export interface LogEntry {
    user_id?: string;
    query: string;
    response: string;
    response_time: number;
    model: string;
    sources: string[];
    error?: string;
    metadata?: Record<string, unknown>;
  }
  
  export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
  }