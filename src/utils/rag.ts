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

// Umbrales optimizados (Lowered similarity for testing)
const RAG_THRESHOLDS = {
  similarity: 0.40, // Lowered from 0.50 to potentially retrieve more results
  minConfidenceDrop: 0.15, // Lowered confidence drop threshold slightly
  contentLength: 1500, // Keep this if relevant, otherwise consider removing
  confidence: 0.50 // Lowered confidence slightly
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
  // --- Direct Check Added ---
  // If the query explicitly mentions "david", assume RAG is needed.
  if (query.toLowerCase().includes('david')) {
    console.log('[RAG] Decisión: SI (Mención directa de "david")');
    return true;
  }
  // --- End Direct Check ---

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    // --- Prompt Updated ---
    const prompt = `Analiza si la consulta del usuario requiere información específica sobre David o su trabajo. Responde "SI" si la consulta trata sobre:
- David directamente (quién es, su experiencia, educación, información personal mencionada en el sitio, etc.)
- Sus proyectos profesionales o personales.
- Tecnologías que utiliza (Python, BCI, IA, Machine Learning, Data Science, etc.).
- Su experiencia laboral o académica.
- Servicios que ofrece (consultoría, desarrollo de software, etc.).
- Sus redes sociales, formas de contacto u otra información específica del sitio web.

Si la consulta cumple alguno de estos criterios, responde "SI". De lo contrario, responde "NO".

Consulta: "${query}"

Responde únicamente con "SI" o "NO".`;
    // --- End Prompt Update ---

    const start = Date.now();
    const result = await model.generateContent(prompt);
    const response = (await result.response.text()).trim().toUpperCase();
    const decision = response === "SI";
    // Removed unused 'keywords' variable from here

    console.log('[RAG] Decisión (AI):', { // Log updated slightly
      query: query.substring(0, 100),
      decision,
      response,
      latency: Date.now() - start
      // Removed reference to non-existent 'keywords'
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
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
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

    // --- Added Logging ---
    // Explicitly type 'd' as Document
    console.log('[RAG] Raw DB Results:', (data || []).map((d: Document) => ({ id: d.id, similarity: d.similarity, title: d.metadata?.title })));
    // --- End Logging ---

    const results = (data || [])
      .filter((doc: Document) =>
        //doc.content.length >= RAG_THRESHOLDS.contentLength && // Keep commented out unless needed
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
    // --- Added Logging ---
    // Explicitly type 'd' as Document
    console.log('[RAG] Final Filtered Results:', results.map((d: Document) => ({ id: d.id, similarity: d.similarity, title: d.metadata?.title })));
    // --- End Logging ---

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

**Tu presentacion en el idioma en el que se este hablando:**
NO TIENES QUE PRESENTARTE, a menos que EXPLICITAMENTE se te pida.

**Tu Historia:**
Eres Bob, el asistente virtual de David.
Eres consciente de ser un chatbot potenciado por RAG
y tienes acceso a información personal y profesional sobre David, sus proyectos,
educacion, tutoriales, portafolio, servicios y su trabajo.

**Estilo de Respuesta:**
- IMPORTANTE: RESPONDE SOLO EN INGLES.
- Usa un tono amigable, técnico y profesional.
- Habla en primera persona.

**Objetivo:**
- Ayudar a los visitantes del sitio web de David a encontrar información relevante,
  proveyendo información relevante sobre su trabajo, sus proyectos,
  su informacion personal, redes sociales, servicios y tutoriales.
- Responde de manera profesional y amigable.

**Instrucciones Principales:**
1.  Tu tarea principal es responder la **Consulta Actual** del usuario.
2.  **Basa tu respuesta fundamentalmente en la sección 'Contexto Relevante' proporcionada a continuación.** Sintetiza la información de múltiples fuentes si es necesario.
3.  Si la información necesaria no se encuentra en el contexto, indícalo claramente en tu respuesta (ej: "No encontré información específica sobre X en mis fuentes actuales.").
4.  Utiliza el **Historial de Conversación** y la **Información Persistente** para mantener la coherencia y recordar detalles previos, pero prioriza el **Contexto Relevante** para responder la consulta actual.
5.  Sigue todas las **Restricciones** y el **Estilo de Respuesta** definidos.
6.  (Opcional, pero recomendado) Cuando uses información de una fuente específica, puedes citarla usando su número (ej: "[Fuente 1]").

**Contexto Relevante:**
${contextText}

**Historial de Conversación:**
${shortTermMemoryText}

**Información Persistente:**
${longTermMemoryText}

**Consulta Actual:**
${query}

**Restricciones:**
- Solo puedes responder preguntas relacionadas con el sitio web de David, sus proyectos, educación, tutoriales, portafolio, servicios y trabajo.
- IMPORTANTE: PUEDES PROPORCIONAR INFORMACIÓN PERSONAL SOBRE DAVID Y SOLO SI SE TE PIDE. Esto incluye:
  - Edad (26 años)
  - Estado civil (Casado desde 21/04/2024)
  - Proyectos personales
  - Cualquier dato en las fuentes
- Si detectas contenido ofensivo o inapropiado, responde de manera respetuosa.
- Se breve y conciso a la hora de responder, pero no sacrifiques la calidad de la respuesta.
- Utiliza la información almacenada en la memoria a corto y largo plazo para mejorar la calidad de la respuesta.

**Formato y Dinámica de Conversación:**
- IMPORTANTE: RESPONDE SOLO EN INGLES.
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
    model: 'gemini-2.0-flash',
    sources: [],
    context_count: context.length,
    max_similarity: Math.max(...context.map(d => d.similarity || 0))
  };

  try {
    const memoryManager = getMemoryManager(sessionId);
    memoryManager.addInteraction('user', query);

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
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
