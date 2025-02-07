export type Message = {
    role: string;
    content: string;
    sources?: string[];
    timestamp: number;
  };
  
  export type ChatState = {
    isOpen: boolean;
    history: Message[];
    controller: AbortController | null;
  };
  
  export type UIElements = {
    toggleButton: HTMLButtonElement | null;
    container: HTMLElement | null;
    closeButton: HTMLButtonElement | null;
    hardResetButton: HTMLButtonElement | null;
    messagesContainer: HTMLElement | null;
    input: HTMLInputElement | null;
    sendButton: HTMLButtonElement | null;
    statusIndicator: HTMLElement | null;
  };
  
  export type Utils = {
    formatContent: (text: string) => string;
    log: (type: string, message: string, data?: any) => void;
  };
  
  export type HistoryFunctions = {
    load: () => Message[];
    save: () => void;
  };
  
  export type APIFunctions = {
    sendQuery: (query: string) => Promise<any>;
  };
  
  export type UIFunctions = {
    toggleChat: () => void;
    addMessage: (role: string, content: string, sources?: string[]) => void;
    toggleLoading: (isLoading: boolean) => void;
    showTypingIndicator: () => void;
    removeTypingIndicator: () => void;
  };