import type { APIRoute } from 'astro';
import { generateResponse, getEmbedding, semanticSearch } from '../../utils/rag.ts';
import { errorResponse, successResponse } from '../../utils/apihelpers.ts';
import { logQuery } from '../../utils/logger.ts';
import type { Document } from '../../utils/rag.ts'; // Importa el tipo Document

// Determina si usar RAG basado en la consulta
function shouldUseRAG(query: string): boolean {
  const ragKeywords = ['python', 'django', 'flask', 'pandas', 'numpy', 'web', 'datos'];
  const cleanQuery = query.toLowerCase();
  return ragKeywords.some(keyword => cleanQuery.includes(keyword));
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    
    // Validación mejorada
    if (!body || typeof body !== 'object' || !body.message || typeof body.message !== 'string') {
      return errorResponse(400, 'Mensaje inválido', {
        received: body,
        expected: { message: "string" }
      });
    }

    const { message } = body;
    console.log('[API] Procesando consulta:', message);
    
    console.log('[API] Procesando consulta:', message.substring(0, 50));

    // 1. Obtener embeddings solo si es necesario
    let context: Document[] = []; // Tipo explícito
    if (shouldUseRAG(message)) {
      const embedding = await getEmbedding(message);
      context = await semanticSearch(embedding);
    }

    // 2. Generar respuesta
    const result = await generateResponse(message, context, []);
    await logQuery(result);
    
    return successResponse({
      response: result.response,
      sources: result.sources
    });

  } catch (error) {
    console.error('[API Error]', error);
    return errorResponse(500, 'Error interno', error instanceof Error ? error.message : 'Unknown error');
  }
};