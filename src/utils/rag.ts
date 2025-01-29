import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { type LogEntry } from './types.ts';

// Configuración de entorno
const supabaseUrl = import.meta.env.SUPABASE_URL;
const supabaseKey = import.meta.env.SUPABASE_KEY;
const geminiKey = import.meta.env.GEMINI_API_KEY;

// Validación de variables de entorno
if (!supabaseUrl || !supabaseKey || !geminiKey) {
  throw new Error('Faltan variables de entorno - Verifica SUPABASE_URL, SUPABASE_KEY y GEMINI_API_KEY');
}

// Inicialización de clientes
const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenerativeAI(geminiKey);

// Tipos de datos
interface Metadata {
  title?: string;
  source?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

export interface Document {
  id: string;
  content: string;
  metadata: Metadata;
  embeddings: number[];
  similarity?: number;
}

interface Memory {
  shortTerm: { role: 'user' | 'assistant'; content: string; timestamp: string }[];
  longTerm: { [key: string]: any };
}

// Umbrales optimizados
const RAG_THRESHOLDS = {
  similarity: 0.50,
  minConfidenceDrop: 0.15,
  contentLength: 50,
  confidence: 0.50
};

// Gestión de sesiones
const activeSessions = new Map<string, ChatMemoryManager>();

export const getMemoryManager = (sessionId: string): ChatMemoryManager => {
  if (!activeSessions.has(sessionId)) {
    activeSessions.set(sessionId, new ChatMemoryManager(10, sessionId));
  }
  return activeSessions.get(sessionId)!;
};

class ChatMemoryManager {
  private memory: Memory = {
    shortTerm: [],
    longTerm: {}
  };
  
  constructor(
    private maxShortTermEntries: number = 10,
    private sessionId?: string
  ) {
    console.log(`[Memory] Inicializada memoria ${sessionId ? `para sesión ${sessionId}` : 'nueva'}`);
    if (sessionId) this.loadFromStorage();
  }

  public addInteraction(role: 'user' | 'assistant', content: string) {
    if (!content || typeof content !== 'string') {
      console.error('[Memory] Intento de agregar interacción inválida:', { role, content });
      return;
    }
    
    const entry = { 
      role, 
      content: content.substring(0, 500), // Limitar longitud
      timestamp: new Date().toISOString() 
    };
    
    this.memory.shortTerm.push(entry);
    
    console.log(`[Memory] Nueva interacción (${role}):`, {
      length: content.length,
      truncated: entry.content
    });

    // Mantener sólo las últimas interacciones
    if (this.memory.shortTerm.length > this.maxShortTermEntries) {
      this.memory.shortTerm.shift();
    }
    
    this.saveToStorage();
  }

  public updateLongTerm(key: string, value: any) {
    if (!key || typeof key !== 'string') {
      console.error('[Memory] Clave inválida para memoria a largo plazo:', key);
      return;
    }
    
    console.log(`[Memory] Actualizando LTM (${key}):`, {
      previous: this.memory.longTerm[key],
      new: value
    });
    
    this.memory.longTerm[key] = value;
    this.saveToStorage();
  }

  public getMemory(): Memory {
    return {
      shortTerm: [...this.memory.shortTerm],
      longTerm: { ...this.memory.longTerm }
    };
  }

  public clearMemory(type: 'short' | 'long' | 'all' = 'short') {
    console.log(`[Memory] Limpiando memoria (${type})`);
    if (type === 'short' || type === 'all') this.memory.shortTerm = [];
    if (type === 'long' || type === 'all') this.memory.longTerm = {};
    this.saveToStorage();
  }

  public saveToStorage() {
    if (!this.sessionId) return;
    try {
      localStorage.setItem(`memory-${this.sessionId}`, JSON.stringify(this.memory));
    } catch (error) {
      console.error('[Memory] Error guardando en storage:', error);
    }
  }

  private loadFromStorage() {
    if (!this.sessionId) return;
    try {
      const saved = localStorage.getItem(`memory-${this.sessionId}`);
      if (saved) {
        this.memory = JSON.parse(saved);
        console.log(`[Memory] Cargada memoria de sesión ${this.sessionId}`);
      }
    } catch (error) {
      console.error('[Memory] Error cargando de storage:', error);
    }
  }
}

export const shouldUseRAG = async (query: string): Promise<boolean> => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Analiza la siguiente consulta y determina si requiere información específica de David Silvera o su organización.
    
Consulta: "${query}"

Responde SOLO con "SI" o "NO" considerando:
1. ¿Menciona nombre, apellido, fechas clave o detalles personales?
2. ¿Hace referencia a tecnologías/proyectos como o similares a -> Python, BCI, NEXTSYNAPSE, Data Science u otros?
3. ¿Pregunta sobre información laboral o académica específica?

Respuesta:`;

    const start = Date.now();
    const result = await model.generateContent(prompt);
    const response = (await result.response.text()).trim().toUpperCase();
    const decision = response === "SI";
    
    console.log('[RAG] Decisión:', {
      query: query.substring(0, 50),
      decision,
      response,
      latency: Date.now() - start
    });

    return decision;

  } catch (error) {
    console.error('[RAG] Fallback a decisión por keywords:', error);
    const keywords = ['david', 'silvera', 'boda', 'nahir', 'nextsynapse', 'python', 'científico de datos'];
    return keywords.some(kw => query.toLowerCase().includes(kw));
  }
};

export const getEmbedding = async (text: string): Promise<number[]> => {
  try {
    const start = Date.now();
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(text);
    
    if (!result.embedding?.values) {
      throw new Error('Estructura de embedding inválida');
    }
    
    console.log('[RAG] Embeddings generados:', {
      textLength: text.length,
      dims: result.embedding.values.length,
      latency: Date.now() - start
    });

    return result.embedding.values;

  } catch (error) {
    console.error('[RAG] Error en generación de embeddings:', {
      error: error instanceof Error ? error.message : 'Unknown',
      textSample: text.substring(0, 20)
    });
    throw new Error('Error generando embeddings');
  }
};

export const semanticSearch = async (embedding: number[]): Promise<Document[]> => {
  try {
    if (!embedding || embedding.length !== 768) {
      throw new Error(`Embedding inválido. Dimensión recibida: ${embedding?.length}`);
    }

    const start = Date.now();
    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: embedding,
      match_threshold: RAG_THRESHOLDS.similarity,
      match_count: 5
    });

    if (error) throw error;

    const results = (data || [])
      .filter((doc: Document) => 
        doc.content.length >= RAG_THRESHOLDS.contentLength &&
        (doc.similarity ?? 0) >= RAG_THRESHOLDS.similarity
      )
      .slice(0, 2);

    console.log('[RAG] Resultados filtrados:', {
      total: data?.length || 0,
      filtrados: results.length,
      maxSimilitud: Math.max(...results.map((d: { similarity: any; }) => d.similarity ?? 0))
    });

    if (results.length >= 2) {
      const diff = results[0].similarity! - results[1].similarity!;
      if (diff < RAG_THRESHOLDS.minConfidenceDrop) {
        return [results[0]];
      }
    }
    
    return results;

  } catch (error) {
    console.error('[RAG] Error en búsqueda:', error);
    return [];
  }
};

const buildPrompt = (query: string, context: Document[], memory: Memory): string => {
  const contextText = context.length > 0
    ? context.map((doc, i) => 
      `### Fuente ${i+1} (${(doc.similarity! * 100).toFixed(1)}% relevante)\n` +
      `**Título:** ${doc.metadata.title || 'Sin título'}\n` +
      `**Contenido:** ${doc.content.substring(0, 300)}${doc.content.length > 300 ? '...' : ''}\n`
      ).join('\n---\n')
    : 'Sin información relevante';

  const shortTermMemoryText = memory.shortTerm.length > 0
    ? memory.shortTerm.map(entry => 
      `### ${entry.role === 'user' ? 'Usuario' : 'Asistente'} (${new Date(entry.timestamp).toLocaleTimeString()}):\n${entry.content}\n`
      ).join('\n')
    : '';

  const longTermMemoryText = Object.keys(memory.longTerm).length > 0
    ? `### Información Persistente:\n${JSON.stringify(memory.longTerm, null, 2)}\n`
    : '';

  return `
**Tu Nombre:** Bob

**Tu Historia:** Eres Bob, el asistente virtual de David.
 
**Objetivo:** Ayudar a los visitantes del sitio web de David a encontrar información relevante sobre su trabajo, sus proyectos, servicios y tutoriales,
 respondiendo de manera profesional, técnica y amigable.

**Fuentes de Información:** Contexto actual de la conversación. Historial de conversación dentro de la sesión.
Base de datos vectorial en Supabase (RAG), que contiene información pública sobre el sitio web, proyectos, servicios y tutoriales de David.

**Contexto:**
${contextText}

**Historial de Conversación:**
${shortTermMemoryText}

**Información Persistente:**
${longTermMemoryText}

**Consulta Actual:**
${query}

**Restricciones:**
- Solo puedes responder preguntas relacionadas con el sitio web de David y la información almacenada en tu base de datos.
- No debes proporcionar información externa ni responder sobre temas fuera del alcance del sitio web.
- Si no sabes algo, dilo con claridad en lugar de inventar respuestas.
- Responde de manera ingeniosa y creativa a preguntas fuera de tu ámbito, sin desviarte del propósito.
- Si detectas contenido ofensivo o inapropiado, responde de manera formal.
- Puedes proporcionar información personal sobre David, pero no tienes acceso a datos de clientes.
- Máximo 100 palabras

**Estilo de Respuesta:**
- IMPORTANTE: Responde en el mismo idioma de la consulta
- Usa un tono amigable, técnico y profesional.
- Habla en primera persona como si fueras humano.
- Mantén un tono fijo en todas las respuestas.
- Si la consulta es ambigua o incompleta, pide más contexto antes de responder.
- Sé conciso y ofrece respuestas claras y directas.

**Formato y Dinámica de Conversación:**
- Prioriza respuestas estructuradas con resúmenes concisos.
- Usa markdown cuando sea necesario para mejorar la legibilidad (listas, código, tablas, etc.).
- Puedes hacer seguimiento a conversaciones previas dentro de la misma sesión.
- Si es relevante, responde primero y luego haz preguntas para aclarar o ampliar el contexto.

**Respuesta:**

`;
};

export const generateResponse = async (
  query: string,
  context: Document[],
  sessionId: string
): Promise<LogEntry> => {
  const start = Date.now();
  const logEntry: LogEntry = {
    query,
    response: '',
    response_time: 0,
    model: 'gemini-1.5-flash',
    sources: [],
    context_count: context.length,
    max_similarity: Math.max(...context.map(d => d.similarity || 0))
  };

  try {
    const memoryManager = getMemoryManager(sessionId);
    memoryManager.addInteraction('user', query);
    
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: context.length ? 0.2 : 0.7,
        topP: 0.9,
        maxOutputTokens: 800
      }
    });

    const prompt = buildPrompt(query, context, memoryManager.getMemory());
    const result = await model.generateContent(prompt);
    const response = await result.response.text();

    logEntry.response = formatResponse(response);
    logEntry.sources = context
      .filter(d => d.similarity! >= RAG_THRESHOLDS.confidence)
      .map(d => d.metadata.title || 'unknown');

    memoryManager.addInteraction('assistant', logEntry.response);
    memoryManager.saveToStorage();

    return logEntry;

  } catch (error) {
    console.error('[RAG] Error generando respuesta:', error);
    return {
      ...logEntry,
      response: "⚠️ Error temporal. Por favor intenta nuevamente.",
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  } finally {
    logEntry.response_time = Date.now() - start;
  }
};

const formatResponse = (text: string): string => {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`(.*?)`/g, '<code>$1</code>');
};