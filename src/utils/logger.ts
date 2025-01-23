// src/utils/logger.ts
import { createClient } from '@supabase/supabase-js';
import type { LogEntry } from './types.ts';

const supabase = createClient(
  import.meta.env.SUPABASE_URL,
  import.meta.env.SUPABASE_KEY
);

export const logQuery = async (entry: LogEntry) => {
  try {
    const { error } = await supabase.from('chat_logs').insert({
      ...entry,
      metadata: {
        user_agent: entry.metadata?.userAgent,
        ip: entry.metadata?.ip,
        ...entry.metadata
      }
    });

    if (error) console.error('[LOGGER] Error:', error);
  } catch (error) {
    console.error('[LOGGER] Critical Error:', error);
  }
};