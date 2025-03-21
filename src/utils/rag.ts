import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { type LogEntry } from './types.ts';
import { type StorageProvider, getStorageProvider } from './storage.ts';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { marked } from 'marked'; // Importa la biblioteca Marked
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

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
// Después de crear el cliente Supabase
const { error } = await supabase.from('documents').select('*').limit(1);
if (error) console.error('[DB] Error de conexión:', error.message);
// Tipos de datos
interface Metadata {
  title?: string;
  source?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
  sectionType: 'proyectos' | 'experiencia' | 'habilidades',
  containsProjects: true
}

interface LongTermMemory {
  userPreferences?: Record<string, any>;
  conversationSummary?: string;
  technicalContext?: Record<string, any>;
}

export interface Document {
  id: string;
  content: string;
  metadata: Metadata;
  embeddings: number[];
  similarity?: number;
}

// Esquemas de validación
const LongTermMemorySchema = z.object({
  userPreferences: z.record(z.any()).optional(),
  conversationSummary: z.string().optional(),
  technicalContext: z.record(z.any()).optional()
});

const MemorySchema = z.object({
  version: z.number().default(1.1),
  shortTerm: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    timestamp: z.string()
  })),
  longTerm: LongTermMemorySchema
});

interface Memory {
  version: number;
  shortTerm: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>;
  longTerm: LongTermMemory;
}

// Umbrales optimizados
const RAG_THRESHOLDS = {
  similarity: 0.50, // Aumentar para mayor precisión
  minConfidenceDrop: 0.20,
  contentLength: 1500,
  confidence: 0.55
};

// Gestión de sesiones
export const activeSessions = new Map<string, ChatMemoryManager>();
let cleanupScheduled = false;

const scheduleSessionCleanup = () => {
  setInterval(() => {
    const now = Date.now();
    activeSessions.forEach((manager, sessionId) => {
      if (now - manager.getLastAccessed() > 30 * 60 * 1000) {
        manager.clearMemory('all');
        activeSessions.delete(sessionId);
        console.log(`[Memory] Sesión ${sessionId} eliminada por inactividad`);
      }
    });
  }, 5 * 60 * 1000);
};

export const getMemoryManager = (sessionId: string): ChatMemoryManager => {
  if (!cleanupScheduled) {
    scheduleSessionCleanup();
    cleanupScheduled = true;
  }

  if (!activeSessions.has(sessionId)) {
    activeSessions.set(sessionId, new ChatMemoryManager(10, sessionId));
  }
  return activeSessions.get(sessionId)!;
};

class ChatMemoryManager {
  private memory: Memory = {
    version: 1.1,
    shortTerm: [],
    longTerm: {}
  };

  private storage: StorageProvider;
  private lastAccessed: number = Date.now();

  constructor(
    private maxShortTermEntries: number = 10,
    private sessionId?: string,
  ) {
    this.storage = getStorageProvider();
    console.log(`[Memory] Inicializada memoria ${sessionId ? `para sesión ${sessionId}` : 'nueva'}`);

    if (sessionId) {
      try {
        this.loadFromStorage();
      } catch (error) {
        console.error('[Memory] Error inicializando memoria:', error);
        this.clearMemory('all');
      }
    }
  }

  public getLastAccessed(): number {
    return this.lastAccessed;
  }

  public addInteraction(role: 'user' | 'assistant', content: string) {
    if (!content || typeof content !== 'string') {
      console.error('[Memory] Intento de agregar interacción inválida:', { role, content });
      return;
    }

    const entry = {
      role,
      content: content.substring(0, 500),
      timestamp: new Date().toISOString()
    };

    this.memory.shortTerm.push(entry);
    this.lastAccessed = Date.now();

    // Mantener sólo las últimas interacciones
    while (this.memory.shortTerm.length > this.maxShortTermEntries) {
      this.memory.shortTerm.shift();
    }

    this.saveToStorage();
    this.logAction('addInteraction', { role, content: entry.content });
  }

  public updateLongTerm(key: keyof LongTermMemory, value: any) {
    if (!key || typeof key !== 'string') {
      console.error('[Memory] Clave inválida para memoria a largo plazo:', key);
      return;
    }

    this.memory.longTerm[key] = value;
    this.lastAccessed = Date.now();
    this.saveToStorage();
    this.logAction('updateLongTerm', { key, value });
  }

  public getMemory(): Memory {
    return {
      version: this.memory.version,
      shortTerm: [...this.memory.shortTerm],
      longTerm: { ...this.memory.longTerm }
    };
  }

  public clearMemory(type: 'short' | 'long' | 'all' = 'short') {
    console.log(`[Memory] Limpiando memoria (${type})`);

    if (type === 'short' || type === 'all') {
      this.memory.shortTerm = [];
    }

    if (type === 'long' || type === 'all') {
      this.memory.longTerm = {};
    }

    this.saveToStorage();
    this.logAction('clearMemory', { type });
  }

  private logAction(action: string, details: object = {}) {
    console.debug(`[Memory][${this.sessionId}] ${action}`, {
      timestamp: new Date().toISOString(),
      ...details
    });
  }

  private saveToStorage() {
    if (!this.sessionId) return;

    try {
      const data = JSON.stringify(this.memory);
      this.storage.setItem(`memory-${this.sessionId}`, data);
      this.storage.setItem(`backup-${this.sessionId}-${Date.now()}`, data);
    } catch (error) {
      console.error('[Memory] Error guardando en storage:', error);
    }
    //console.log("Saving memory to storage!"); // Placeholder for demo  <- ELIMINADO

  }
  public persistMemory() {
    this.saveToStorage();
  }
  private loadFromStorage() {
    if (!this.sessionId) return;

    try {
      const saved = this.storage.getItem(`memory-${this.sessionId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.memory = this.migrateMemory(parsed);
        MemorySchema.parse(this.memory);
      }
    } catch (error) {
      console.error('[Memory] Error cargando de storage:', error);
      this.clearMemory('all');
    }
  }

  private migrateMemory(parsed: any): Memory {
    // Migración de versiones anteriores
    if (!parsed.version || parsed.version < 1.1) {
      return {
        version: 1.1,
        shortTerm: parsed.shortTerm || [],
        longTerm: {
          userPreferences: parsed.longTerm?.userPreferences || {},
          conversationSummary: parsed.longTerm?.conversationSummary || '',
          technicalContext: parsed.longTerm?.technicalContext || {}
        }
      };
    }
    return parsed;
  }
}
export const shouldUseRAG = async (query: string): Promise<boolean> => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Analiza si la consulta y el contexto de la conversacion, requiere información específica de:
- Proyectos profesionales/personales
- Tecnologías usadas (Python, BCI, IA, Machine learning, Data science u similares.)
- Experiencia laboral/académica
- Servicios ofrecidos (consultoría, desarrollo de software, etc.)
- Redes sociales, contacto o informacion personal disponible en el sitio web.

En caso de que lo requiera responde "SI", caso contrario responde "NO".

Consulta: "${query}"

Responde SOLO "SI" o "NO"`;

    const start = Date.now();
    const result = await model.generateContent(prompt);
    const response = (await result.response.text()).trim().toUpperCase();
    const decision = response === "SI";
    const keywords = ['proyecto', 'project', 'trabajo', 'portfolio', 'experiencia'];

    console.log('[RAG] Decisión:', {
      query: query.substring(0, 100), // Mostrar más contexto
      decision,
      response,
      latency: Date.now() - start,
      envKeywords: keywords // Verificar keywords cargadas
    });

    return decision;

  } catch (error) {
    console.error('[RAG] Fallback a decisión por keywords:', error);
    const keywords = import.meta.env.VITE_RAG_KEYWORDS?.split(',') || [];
    return keywords.some((kw: string) => query.toLowerCase().includes(kw));
  }
};
export const embeddingCache = new Map<string, number[]>();

const getCacheKey = (text: string): string => {
  return createHash('sha256').update(text).digest('hex');
};

export const getEmbedding = async (text: string): Promise<number[]> => {
  const cacheKey = getCacheKey(text);

  if (embeddingCache.has(cacheKey)) {
    console.debug('[RAG] Cache hit para embedding:', cacheKey);
    return embeddingCache.get(cacheKey)!;
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-embedding-exp-03-07	' });
    const result = await model.embedContent(text);

    if (!result.embedding?.values) {
      throw new Error('Estructura de embedding inválida');
    }

    embeddingCache.set(cacheKey, result.embedding.values);
    return result.embedding.values;

  } catch (error) {
    console.error('[RAG] Error en generación de embeddings:', error);
    throw new Error('Error generando embeddings');
  }
};
export const semanticSearch = async (embedding: number[]): Promise<Document[]> => {
  console.debug('[DB] Query embedding:', embedding?.slice(0, 3));
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
        //doc.content.length >= RAG_THRESHOLDS.contentLength &&
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
      `### Fuente ${i + 1} (${(doc.similarity! * 100).toFixed(1)}% relevante)\n` +
      `**Título:** ${doc.metadata.title || 'Sin título'}\n` +
      `**Contenido:** ${doc.content}\n`
    ).join('\n---\n')
    : 'Sin información relevante';
  //console.log("INFO[Context]:", contextText); // Placeholder for demo, ELIMINADO.
  const shortTermMemoryText = memory.shortTerm.length > 0
    ? memory.shortTerm.map(entry =>
      `### ${entry.role === 'user' ? 'Usuario' : 'Asistente'} (${new Date(entry.timestamp).toLocaleTimeString()}):\n${entry.content}\n`
    ).join('\n')
    : '';

  const longTermMemoryText = Object.keys(memory.longTerm).length > 0
    ? `### Información Persistente:\n${JSON.stringify(memory.longTerm, null, 2)}\n`
    : '';

  return `
**Tu Nombre:** 
Bob

** Tu presentacion en el idioma en el que se este hablando **
Hola Soy bob, el asistente virtual de David, ¿En qué puedo ayudarte hoy? 

**Tu Historia:** 
Eres Bob, el asistente virtual de David.
Eres consciente de ser un chatbot potenciado por RAG
y tienes acceso a información personal y profesional sobre David, sus proyectos,
educacion, tutoriales, portafolio, servicios y su trabajo.
 
**Objetivo:** 
- Ayudar a los visitantes del sitio web de David a encontrar información relevante, 
  proveyendo información relevante sobre su trabajo, sus proyectos,
  su informacion personal, redes sociales, servicios y tutoriales,
- Responde de manera profesional y amigable.


**Contexto:**
- Analiza en profundidad el contexto provisto para generar una respuesta.
${contextText}
**Historial de Conversación:**
- Ten memoria de las interacciones previas en la sesión.
${shortTermMemoryText}

**Información Persistente:**
- Mantén información relevante y actualizada en la memoria a largo plazo.
${longTermMemoryText}

- IMPORTANTE: PUEDES PROPORCIONAR INFORMACIÓN PERSONAL SOBRE DAVID Y SOLO SI SE TE PIDE. Esto incluye:
- Edad (26 años)
- Estado civil (Casado desde 21/04/2024)
- Proyectos personales
- Cualquier dato en las fuentes

- Utiliza la información almacenada en la memoria a corto y largo plazo para mejorar la calidad de la respuesta.

**Consulta Actual:**
- Analiza la consulta actual 
${query}

**Restricciones:**
- Solo puedes responder preguntas relacionadas con el sitio web de David, sus proyectos, educación, tutoriales, portafolio, servicios y trabajo.
- Si detectas contenido ofensivo o inapropiado, responde de manera respetuosa.
- Se breve y conciso a la hora de responder, pero no sacrifiques la calidad de la respuesta.

**Estilo de Respuesta:**
- IMPORTANTE: Responde en el mismo idioma de la consulta actual (si la consulta es en ingles, responde en ingles, si es en español, cambia tu lenguaje a español, y asi con el resto de idiomas).
- Usa un tono amigable, técnico y profesional.
- Habla en primera persona.

**Formato y Dinámica de Conversación:**
- Da respuestas estructuradas con resúmenes concisos y links necesarios.
- Usa markdown cuando sea necesario para mejorar la legibilidad (listas, links, código, tablas, etc.).
- Puedes hacer seguimiento a conversaciones previas dentro de la misma sesión.

**Respuesta de ejemplo:**
"David ha trabajado en varios proyectos interesantes. Aquí algunos de sus proyectos destacados: 

NILES: Un chatbot multimodal avanzado que utiliza modelos Gemini para procesar texto e imágenes. [link](https://example.com)
MewAI: Un sistema multiagente que automatiza la creación de contenido para blogs. [link](https://example.com)
EEG Classification: Análisis y clasificación de señales EEG públicas utilizando redes neuronales convolucionales. [link](https://example.com)

Hay algo mas que te gustaria saber? yo encantado de ayudarte."
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
        temperature: context.length ? 0.4 : 0.7,
        topP: 0.95,
        maxOutputTokens: 800
      }
    });
    //console.log("INFO[RAG]:", context); // Placeholder for demo, ELIMINADO.

    const prompt = buildPrompt(query, context, memoryManager.getMemory());
    const result = await model.generateContent(prompt);
    let response = await result.response.text();

    // *** LIMPIAR LA PREGUNTA DE LA RESPUESTA (ANTES DE GUARDAR) ***
    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedQuery = escapeRegExp(query);
    const queryPattern = new RegExp(`^${escapedQuery}\\s*`, 'i');
    response = response.replace(queryPattern, '').trim();


    logEntry.response = await formatResponse(response);  // Formatear y sanitizar

    logEntry.sources = context
      .filter(d => d.similarity! >= RAG_THRESHOLDS.confidence)
      .map(d => d.metadata.title || 'unknown');

    memoryManager.addInteraction('assistant', logEntry.response); // Guardar la respuesta *limpia*
    memoryManager.persistMemory();

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



// Función de sanitización usando JSDOM y DOMPurify
const dom = new JSDOM('<!DOCTYPE html>');
const purify = DOMPurify(dom.window as any);


const formatResponse = async (text: string): Promise<string> => {
  const rawHtml = marked.parse(text);
  return purify.sanitize(rawHtml as string); // Type assertion: Treat rawHtml as string
};