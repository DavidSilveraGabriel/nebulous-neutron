import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { type LogEntry } from './types.ts';
// Cargar variables desde configuración de Vite
const supabaseUrl = import.meta.env.SUPABASE_URL;
const supabaseKey = import.meta.env.SUPABASE_KEY;
const geminiKey = import.meta.env.GEMINI_API_KEY;

// Verificar variables
if (!supabaseUrl || !supabaseKey || !geminiKey) {
  throw new Error('Faltan variables de entorno');
}
// Configuración de entorno para SSR
const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenerativeAI(geminiKey);

// Definición de tipos
interface Metadata {
  title?: string;
  source?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: any; // Para propiedades adicionales
}

export interface Document {
  id: string;
  content: string;
  metadata: Metadata;
  embeddings: number[];
  similarity?: number; // Si usas scores de similitud
}

// Función para construir prompts
const buildRAGPrompt = (query: string, context: Document[]): string => {
  const contextText = context
    .map(doc => `[Fuente: ${doc.metadata?.title || 'Sin título'}]\n${doc.content}`)
    .join('\n\n---\n');

  return `Como especialista en el tema, responde usando exclusivamente este contexto:
  
Contexto:
${contextText || "No hay información relevante"}

Instrucciones:
1. Proporciona una respuesta precisa y bien estructurada
2. Si no hay información suficiente, indica que no puedes responder
3. Usa markdown básico para formato

Pregunta: ${query}
Respuesta:`;
};

const buildGeneralPrompt = (query: string): string => {
  return `Como asistente virtual general, responde de manera útil y precisa:
  
Instrucciones:
1. Sé conciso pero completo
2. Usa un lenguaje natural y amigable
3. Si es una pregunta técnica, sugiere consultar documentación especializada
4. Usa markdown básico para formato

Pregunta: ${query}
Respuesta:`;
};

// Función principal de embeddings
export const getEmbedding = async (text: string): Promise<number[]> => {
  try {
    const model = genAI.getGenerativeModel({ model: 'embedding-001' });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    console.error('[RAG] Embedding Error:', error);
    throw new Error('Error generando embeddings');
  }
};

// Búsqueda semántica
export const semanticSearch = async (embedding: number[]): Promise<Document[]> => {
  try {
    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: embedding,
      match_threshold: 0.78,
      match_count: 5
    });

    if (error) throw error;
    
    // Filtrado seguro con verificación de tipos
    return (data || []).filter((doc: any) => {
      return typeof doc?.content === 'string' && doc.content.length > 50;
    });
    
  } catch (error) {
    console.error('[RAG] Search Error:', error);
    return [];
  }
};

// Generación de respuestas
export const generateResponse = async (
  query: string,
  context: Document[],
  history: any[]
): Promise<LogEntry> => {
  const start = Date.now();
  
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: context.length ? 0.3 : 0.7,
        topP: 0.95,
        maxOutputTokens: 1024
      }
    });

    const prompt = context.length > 0 
      ? buildRAGPrompt(query, context)
      : buildGeneralPrompt(query);

    const result = await model.generateContent(prompt);
    const response = await result.response.text();

    return {
      query,
      response: formatResponse(response),
      response_time: Date.now() - start,
      model: 'gemini-1.5-flash',
      sources: context.map(doc => doc.metadata?.title || 'unknown')
    };
    
  } catch (error) {
    console.error('[RAG] Generation Error:', error);
    return {
      query,
      response: "⚠️ Lo siento, estoy teniendo problemas técnicos. Por favor intenta nuevamente.",
      response_time: Date.now() - start,
      model: 'gemini-1.5-flash',
      sources: [],
      error: error instanceof Error ? error.message : 'Error desconocido'
    };
  }
};

// Formateo de respuesta
const formatResponse = (text: string): string => {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
};