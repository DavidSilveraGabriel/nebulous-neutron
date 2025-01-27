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

// Umbrales optimizados
const RAG_THRESHOLDS = {
  similarity: 0.65,  // Base
  minConfidenceDrop: 0.15, // Máxima diferencia permitida entre 1er y 2do resultado
  contentLength: 50,
  confidence: 0.80
};

export const shouldUseRAG = async (query: string): Promise<boolean> => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Analiza la siguiente consulta y determina si requiere información específica de David Silvera o su organización.
    
Consulta: "${query}"

Responde SOLO con "SI" o "NO" considerando:
1. ¿Menciona nombre, apellido, fechas clave o detalles personales?
2. ¿Hace referencia a tecnologías/proyectos específicos (Python, BCI, NEXTSYNAPSE)?
3. ¿Pregunta sobre información laboral o académica específica?

Respuesta:`;

    const start = Date.now();
    const result = await model.generateContent(prompt);
    const response = (await result.response.text()).trim().toUpperCase();
    const decision = response === "SI"; // Corrección clave
    
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
    // Modelo corregido para coincidir con tus embeddings
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
    .slice(0, 2); // Limitar a los 2 mejores resultados

    console.log('[RAG] Resultados filtrados:', {
      total: data?.length || 0,
      filtrados: results.length,
      maxSimilitud: Math.max(...results.map((d: { similarity: any; }) => d.similarity ?? 0))
    });
    if (results.length >= 2) {
      const diff = results[0].similarity! - results[1].similarity!;
      if (diff < RAG_THRESHOLDS.minConfidenceDrop) {
        return [results[0]]; // Solo el mejor si hay duda
      }
    }
    
    return results;

  } catch (error) {
    console.error('[RAG] Error en búsqueda:', error);
    return [];
  }
};

const buildPrompt = (query: string, context: Document[]): string => {
  const contextText = context.length > 0
    ? context.map((doc, i) => 
        `### Fuente ${i+1} (${(doc.similarity! * 100).toFixed(1)}% relevante)\n` +
        `**Título:** ${doc.metadata.title || 'Sin título'}\n` +
        `**Contenido:** ${doc.content.substring(0, 300)}${doc.content.length > 300 ? '...' : ''}\n`
      ).join('\n---\n')
    : 'Sin información relevante';

  return `Eres un asistente especializado en David Silvera. Prioriza la información del contexto:

**Contexto:**
${contextText}

**Consulta:**
${query}

**Instrucciones:**
1. Responde usando datos del contexto cuando sean relevantes
2. Si no hay información, di claramente "No tengo esa información"
3. Usa markdown para elementos técnicos
4. Máximo 150 palabras

**Respuesta:**`;
};

export const generateResponse = async (
  query: string,
  context: Document[],
  history: any[]
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
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: context.length ? 0.2 : 0.7,
        topP: 0.9,
        maxOutputTokens: 800
      }
    });

    const prompt = buildPrompt(query, context);
    const result = await model.generateContent(prompt);
    const response = await result.response.text();

    logEntry.response = formatResponse(response);
    logEntry.sources = context
      .filter(d => d.similarity! >= RAG_THRESHOLDS.confidence)
      .map(d => d.metadata.title || 'unknown');

    return logEntry;

  } catch (error) {
    console.error('[RAG] Error generando respuesta:', error);
    return {
      ...logEntry,
      response: "⚠️ Error temporal. Por favor intenta nuevamente.",
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

const formatResponse = (text: string): string => {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`(.*?)`/g, '<code>$1</code>');
};