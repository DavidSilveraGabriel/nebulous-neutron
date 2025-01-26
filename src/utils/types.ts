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
  role: 'user' | 'assistant' | 'error';
  content: string;
  sources?: string[];
  timestamp?: number;
}

export interface APIRequest {
  message: string;
}

export interface APIResponse {
  response: string;
  sources: string[];
  error?: string;
}