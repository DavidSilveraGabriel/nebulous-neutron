// src/utils/chatUiTypes.ts

export interface Message {
    role: 'user' | 'assistant' | 'error';
    content: string;
    sources?: string[];
    timestamp: number;
}

export interface ChatState {
    isOpen: boolean;
    history: Message[];
    controller: AbortController | null;
}

export interface UIElements {
    toggleButton: HTMLButtonElement | null;
    container: HTMLElement | null;
    closeButton: HTMLButtonElement | null;
    messagesContainer: HTMLElement | null;
    input: HTMLInputElement | null;
    sendButton: HTMLButtonElement | null;
    statusIndicator: HTMLDivElement | null;
}

export interface Utils {
    formatContent: (text: string) => string;
    log: (type: string, message: string, data?: any) => void;
}

export interface UIFunctions {
    toggleChat: () => void;
    addMessage: (role: string, content: string, sources?: string[]) => void;
    toggleLoading: (isLoading: boolean) => void;
    showTypingIndicator: () => void;
    removeTypingIndicator: () => void;
}

export interface HistoryFunctions {
    load: () => Message[];
    save: () => void;
}

export interface APIFunctions {
    sendQuery: (query: string) => Promise<{ response: string, sources: string[], error?: string }>;
}

