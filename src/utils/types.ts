export interface LogEntry {
  user_id?: string;
  query: string;
  response: string;
  response_time: number;
  model: string;
  sources: string[];
  error?: string;
  metadata?: Record<string, unknown>;
  use_rag?: boolean;
  context_count?: number;
  processed_time?: number;
  max_similarity?: number;

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

export interface DebugLog {
  timestamp: string;
  stage: 'decision' | 'embedding' | 'search' | 'generation';
  data: any;
  metadata?: {
    queryHash?: string;
    contextHash?: string;
  };
}

export interface ErrorLog {
  code: string;
  context: any;
  stack?: string;
  severity: 'low' | 'medium' | 'critical';
}