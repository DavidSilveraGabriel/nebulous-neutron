// src/pages/api/chat.ts
import type { APIRoute } from 'astro';
import { generateResponse } from '../../utils/rag.ts';
import { errorResponse, successResponse } from '../../utils/apihelpers.ts';
import { logQuery } from '../../utils/logger.ts';

export const POST: APIRoute = async ({ request }) => {
  try {
    console.log('[API] Request received');
    const body = await request.json();
    
    if (!body?.message || typeof body.message !== 'string') {
      return errorResponse(400, 'Mensaje inválido', body);
    }

    const { message } = body;
    console.log('[API] Processing query:', message.substring(0, 50));

    const result = await generateResponse(message, [], []);
    await logQuery(result);

    return successResponse({
      response: result.response,
      sources: result.sources
    });

  } catch (error) {
    return errorResponse(500, 'Error interno', error);
  }
};