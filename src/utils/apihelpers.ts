// src/utils/apiHelpers.ts
import type { LogEntry } from './types.ts';

export const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export const errorResponse = (status: number, error: string, details?: unknown) => {
  console.error(`[API] Error ${status}: ${error}`, details);
  return new Response(JSON.stringify({ error, details }), {
    status,
    headers: corsHeaders
  });
};

export const successResponse = (data: unknown) => {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: corsHeaders
  });
};