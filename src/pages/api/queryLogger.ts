// src/utils/queryLogger.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

interface LogEntry {
  user_id?: string;
  query: string;
  response: string;
  response_time: number;
  model: string;
  sources: string[];
  error?: string;
  metadata?: any;
}

export default async function logQuery(entry: LogEntry) {
  try {
    const { error } = await supabase
      .from('chat_logs')
      .insert({
        user_id: entry.user_id || 'anonymous',
        query: entry.query,
        response: entry.response,
        response_time: entry.response_time,
        model: entry.model,
        sources: entry.sources,
        error: entry.error,
        metadata: {
          user_agent: entry.metadata?.userAgent,
          ip: entry.metadata?.ip,
          ...entry.metadata
        }
      });

    if (error) console.error('Logging error:', error);
  } catch (error) {
    console.error('Failed to log query:', error);
  }
}
