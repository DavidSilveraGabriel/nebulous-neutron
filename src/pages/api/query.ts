import type { APIRoute } from 'astro';
import { generateResponse, getEmbedding, semanticSearch, shouldUseRAG } from '../../utils/rag.ts';
import { errorResponse, successResponse } from '../../utils/apihelpers.ts';
import { logQuery } from '../../utils/logger.ts';
import type { Document } from '../../utils/rag.ts';

import { getMemoryManager, activeSessions, embeddingCache } from '../../utils/rag.ts';
import { randomUUID  } from 'node:crypto';


export const POST: APIRoute = async ({ request }) => {
  const startTime = Date.now();
  let context: Document[] = [];
  let useRAGDecision = false;
  // Obtener sessionId de los headers
  const sessionId = request.headers.get('X-Session-ID') || 'default-session';
  try {
    // 1. Validación inicial
    console.log('[API] Iniciando procesamiento de consulta');
    const body = await request.json();
    
    if (!body || typeof body !== 'object' || !body.message || typeof body.message !== 'string') {
      console.error('[API] Error de validación:', JSON.stringify(body));
      return errorResponse(400, 'Mensaje inválido', {
        received: body,
        expected: { message: "string" }
      });
    }

    const { message } = body;
    console.log(`[API] Consulta recibida: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);

    // 2. Decisión de uso de RAG
    // Decisión RAG mejorada
    try {
      useRAGDecision = await shouldUseRAG(message);
      console.log(`[API] Decisión RAG: ${useRAGDecision ? 'SI' : 'NO'}`);
      if (!useRAGDecision && message.toLowerCase().includes('david')) {
        useRAGDecision = true; // Forzar RAG si menciona a David
      }
    } catch (ragError) {
      useRAGDecision = message.toLowerCase().includes('david');
    }

    // 3. Búsqueda de contexto
    if (useRAGDecision) {
      try {
        console.log('[API] Iniciando obtención de embeddings');
        const embeddingStart = Date.now();
        const embedding = await getEmbedding(message);
        console.log(`[API] Embeddings obtenidos: ${embedding}`);
        
        // Checkpoint: Validación de embeddings
        if (!embedding || embedding.length !== 768) {
          throw new Error(`Embedding inválido. Longitud: ${embedding?.length}`);
        }
        
        //console.log(`[API] Embeddings obtenidos (${Date.now() - embeddingStart}ms) - Muestra: [${embedding.slice(0, 3).join(', ')}...]`);

        // 4. Búsqueda semántica
        const searchStart = Date.now();
        context = await semanticSearch(embedding);
        console.log(`[API] Búsqueda semántica completada (${Date.now() - searchStart}ms)`);
        console.log('[API] Contexto obtenido:', {
          documents: context.length,
          sources: [...new Set(context.map(d => d.metadata?.title))],
          avgSimilarity: context.reduce((acc, doc) => acc + (doc.similarity || 0), 0) / (context.length || 1)
        });
      } catch (searchError) {
        console.error('[API] Error en búsqueda contextual:', {
          error: searchError,
          message: message.substring(0, 20)
        });
        context = []; // Continuar sin contexto
      }
    }

    // 5. Generación de respuesta
    const generationStart = Date.now();
    
    const result = await generateResponse(message, context, sessionId); // Cambiar el tercer parámetro
    console.log(`[API] Respuesta generada (${Date.now() - generationStart}ms)`, {
      responseLength: result.response.length,
      sources: result.sources || ["Data Base"]
    });
    console.log('[API] Sesión ID:', sessionId);

    // 6. Logging final
    // En el logging final:
    await logQuery({
      ...result,
      session_id: sessionId, // Agregar sessionId al log
      use_rag: useRAGDecision,
      context_count: context.length,
      processed_time: Date.now() - startTime
    });

    return successResponse({
      response: result.response,
      sources: result.sources
    });

  } catch (error) {
    // Logging detallado de errores
    const errorData = {
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : null,
      context: {
        messageLength: context.length,
        ragDecision: useRAGDecision,
        requestBody: await request.text()
      }
    };
    
    console.error('[API] Error crítico:', JSON.stringify(errorData, null, 2));
    
    return errorResponse(500, 'Error interno', {
      message: "Estamos experimentando problemas técnicos. Por favor intenta nuevamente más tarde.",
      errorId: `${Date.now()}-${Math.random().toString(36).substr(2, 4)}`
    });
  }
};


// Añade este nuevo método en tu archivo
export const DELETE: APIRoute = async ({ request }) => {
  const sessionId = request.headers.get('X-Session-ID');
  
  if (!sessionId) {
    return errorResponse(400, 'Se requiere ID de sesión');
  }

  try {
    // 1. Limpiar memoria de sesión
    if (activeSessions.has(sessionId)) {
      activeSessions.get(sessionId)?.clearMemory('all');
      activeSessions.delete(sessionId);
    }

    // 2. Limpiar caché relacionado
    embeddingCache.forEach((_, key) => {
      if (key.includes(sessionId)) embeddingCache.delete(key);
    });

    // 3. Generar nueva sesión
    const newSessionId = crypto.randomUUID();
    
    console.log('[SESSION] Reset completo:', { 
      oldSession: sessionId,
      newSession: newSessionId 
    });

    return successResponse({
      newSessionId,
      resetAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('[SESSION] Error crítico:', error);
    return errorResponse(500, 'Falló el reset completo');
  }
};