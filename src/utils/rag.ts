// src/utils/rag.ts
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { type LogEntry } from './types.ts';

const genAI = new GoogleGenerativeAI(import.meta.env.GEMINI_API_KEY);
const supabase = createClient(
  import.meta.env.SUPABASE_URL,
  import.meta.env.SUPABASE_KEY
);

export const getEmbedding = async (text: string): Promise<number[]> => {
  try {
    const model = genAI.getGenerativeModel({ model: 'embedding-001' });
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    console.error('[RAG] Embedding Error:', error);
    throw new Error('Failed to generate embeddings');
  }
};

export const semanticSearch = async (embedding: number[]) => {
  try {
    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: embedding,
      match_threshold: 0.78,
      match_count: 5
    });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('[RAG] Search Error:', error);
    throw new Error('Semantic search failed');
  }
};

export const generateResponse = async (query: string, context: any[], history: any[]): Promise<LogEntry> => {
  const start = Date.now();
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        temperature: 0.3,
        topP: 0.95,
        maxOutputTokens: 1024
      }
    });

    const contextText = context
      .map(doc => `[Fuente: ${doc.metadata?.title || 'Sin título'}]\n${doc.content}`)
      .join('\n\n---\n');

    const prompt = `Contexto:\n${contextText || "No hay información relevante"}\n\nPregunta: ${query}\nRespuesta:`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response.text();

    return {
      query,
      response,
      response_time: Date.now() - start,
      model: 'gemini-1.5-flash',
      sources: context.map(doc => doc.metadata?.title || 'unknown')
    };
  } catch (error) {
    console.error('[RAG] Generation Error:', error);
    return {
      query,
      response: "Disculpa, estoy teniendo dificultades para responder.",
      response_time: Date.now() - start,
      model: 'gemini-1.5-flash',
      sources: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};