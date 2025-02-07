// src/utils/chatUiLogic.ts
import { createClient } from '@supabase/supabase-js';
import type { ChatState, Message, Utils, UIElements, HistoryFunctions, APIFunctions, UIFunctions } from './chatUiTypes.ts'; // Asumimos que crearás este archivo de tipos
 
console.log("Environment Variables in chatUiLogic.ts:", import.meta.env); // Add this line

// Inicialización de Supabase fuera de la función init para que sea accesible en todo el módulo
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL; // Corrected variable name
const supabaseKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
console.log(import.meta.env) // You have this line already, keep it for now
if (!supabaseUrl || !supabaseKey) {
    throw new Error('Faltan variables de entorno - Verifica SUPABASE_URL, SUPABASE_KEY');
  }
const supabase = createClient(supabaseUrl, supabaseKey);

const API_ENDPOINT = '/api/query';
const MAX_HISTORY_LENGTH = 20;
const LOCAL_STORAGE_KEY = 'chatHistory';
const RETRY_CONFIG = { maxRetries: 2, baseDelay: 1000 };

let chatState: ChatState = {
    isOpen: false,
    history: [],
    controller: null,
};

let elements: UIElements = { // Inicialización con valores null
    toggleButton: document.getElementById('chatbot-toggle') as HTMLButtonElement | null,
    container: document.getElementById('chatbot-container') as HTMLElement | null,
    closeButton: document.getElementById('close-chat') as HTMLButtonElement | null,
    messagesContainer: document.getElementById('chat-messages') as HTMLElement | null,
    input: document.getElementById('user-input') as HTMLInputElement | null,
    sendButton: document.getElementById('send-btn') as HTMLButtonElement | null,
    statusIndicator: document.getElementById('status-indicator') as HTMLDivElement | null,
};

const utils: Utils = {
    formatContent: (text: string) => text, // Confiar en el HTML sanitizado del backend
    log: (type: string, message: string, data?: any) => {
        console.log(`[${new Date().toISOString()}] [${type.toUpperCase()}] ${message}`, data);
    },
};

const ui: UIFunctions = {
    toggleChat: () => {
        chatState.isOpen = !chatState.isOpen;
        localStorage.setItem('chatIsOpen', JSON.stringify(chatState.isOpen));

        if (elements.container) {
            elements.container.classList.toggle('opacity-0', !chatState.isOpen);
            elements.container.classList.toggle('translate-y-4', !chatState.isOpen);
            elements.container.classList.toggle('scale-95', !chatState.isOpen);
            elements.container.classList.toggle('invisible', !chatState.isOpen);
            elements.container.style.pointerEvents = chatState.isOpen ? 'auto' : 'none';
        }
        if (elements.toggleButton) {
            elements.toggleButton.classList.toggle('rotate-45', chatState.isOpen);
        }
        if (elements.messagesContainer && chatState.isOpen) {
            elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
        }
    },


    addMessage: (role: string, content: string, sources: string[] = []) => {
        if (!elements.messagesContainer) return;

        const messageElement = document.createElement('div');
        messageElement.className = `${role}-message flex ${role === 'user' ? 'justify-end' : 'justify-start'} message-enter`;

        const bubble = document.createElement('div');
        bubble.className = `rounded-xl p-3 max-w-[85%] ${
            role === 'error' ? 'bg-red-600/20 text-red-400 border border-red-600/30' :
            role === 'user' ? 'bg-blue-600/80' : 'bg-gray-800/80'
        }`;

        bubble.innerHTML = utils.formatContent(content);

        if (sources.length > 0) {
            const sourcesDiv = document.createElement('div');
            sourcesDiv.className = 'mt-2 pt-2 border-t border-white/10 text-xs text-gray-400';
            sourcesDiv.innerHTML = `
                <div class="font-medium mb-1">Fuentes:</div>
                ${sources.map(s => `<div class="truncate">${s}</div>`).join('')}
            `;
            bubble.appendChild(sourcesDiv);
        }

        messageElement.appendChild(bubble);
        elements.messagesContainer.appendChild(messageElement);
        elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
    },

    toggleLoading: (isLoading: boolean) => {
        if (elements.statusIndicator) {
            elements.statusIndicator.style.opacity = isLoading ? '1' : '0';
        }
        if (elements.sendButton) {
            elements.sendButton.disabled = isLoading;
        }
        if (elements.input) {
            elements.input.disabled = isLoading;
        }
    },
    showTypingIndicator: () => {
        if (!elements.messagesContainer) return;

        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator bot-message';
        indicator.innerHTML = `
            <div class="bg-gray-800/80 rounded-xl p-3 max-w-[85%">
                <div class="flex items-center gap-2">
                    ${Array(3).fill('<div class="typing-dot"></div>').join('')}
                </div>
            </div>
        `;
        elements.messagesContainer.appendChild(indicator);
        elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
    },
    removeTypingIndicator: () => {
        document.querySelectorAll('.typing-indicator').forEach(indicator => indicator.remove());
    }
};

const hardResetSession = async () => {
    if (!confirm('¿Resetear toda la conversación y contexto?')) return;

    try {
        const oldSessionId = localStorage.getItem('chatSessionId');

        // 1. Reset backend
        const resetResponse = await fetch('/api/query', {
            method: 'DELETE',
            headers: {
                'X-Session-ID': oldSessionId || '',
                'Content-Type': 'application/json'
            }
        });

        if (!resetResponse.ok) throw new Error('Error en el servidor');

        const { newSessionId } = await resetResponse.json();

        // 2. Reset frontend
        localStorage.setItem('chatSessionId', newSessionId);
        localStorage.removeItem('chatHistory');

        // 3. Reiniciar UI
        if (elements.messagesContainer) {
            elements.messagesContainer.innerHTML = `
                <div class="bot-message flex justify-start">
                    <div class="bg-gray-800/80 rounded-xl p-3 max-w-[85%]">
                        ¡Conversación reiniciada! ¿En qué puedo ayudarte ahora?
                    </div>
                </div>`;
        }

        // 4. Reset estado interno
        chatState = {
            isOpen: true,
            history: [],
            controller: null
        };

        // 5. Forzar nuevo handshake
        await fetch('/api/query', { method: 'POST', body: JSON.stringify({ message: '' }) });

    } catch (error) {
        console.error('Reset fallido:', error);
        alert('Error al reiniciar. Recarga la página.');
    }
};


const api: APIFunctions = {
    sendQuery: async (query: string) => {
        let sessionId = localStorage.getItem('chatSessionId');
        if (!sessionId) {
            sessionId = crypto.randomUUID();
            localStorage.setItem('chatSessionId', sessionId);
        }

        // Log user query to Supabase BEFORE sending to backend
        try {
            const { error: logError } = await supabase
                .from('chatbot_interactions')
                .insert([
                    { session_id: sessionId, timestamp: new Date(), role: 'user', content: query }
                ]);
            if (logError) {
                utils.log('error', 'Supabase log error (user query)', logError);
            } else {
                utils.log('info', 'User query logged to Supabase');
            }
        } catch (e) {
            utils.log('error', 'Error logging user query to Supabase', e);
        }


        if (chatState.controller) chatState.controller.abort();
        chatState.controller = new AbortController();

        let retries = RETRY_CONFIG.maxRetries;
        while (retries >= 0) {
            try {
                const response = await fetch(API_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Session-ID': sessionId
                    },
                    body: JSON.stringify({ message: query })
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();

                // Log assistant response to Supabase AFTER receiving from backend
                try {
                    const { response: botResponse, sources = [], error: backendError } = data;
                    const responseToLog = backendError || botResponse || 'No response content'; // Log error or response

                    const { error: logResponseError } = await supabase
                        .from('chatbot_interactions')
                        .insert([
                            { session_id: sessionId, timestamp: new Date(), role: 'assistant', content: responseToLog }
                        ]);
                    if (logResponseError) {
                        utils.log('error', 'Supabase log error (bot response)', logResponseError);
                    } else {
                        utils.log('info', 'Bot response logged to Supabase');
                    }
                } catch (e) {
                    utils.log('error', 'Error logging bot response to Supabase', e);
                }

                return data; // Return the original response data

            } catch (error) {
                if (retries === 0 || (error as Error).name === 'AbortError') throw error;
                await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.baseDelay * (RETRY_CONFIG.maxRetries - retries + 1)));
                retries--;
            }
        }
        throw new Error('Max retries reached');
    }
};

const history: HistoryFunctions = {
    load: () => {
        try {
            const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            utils.log('error', 'Error loading history', error);
            return [];
        }
    },
    save: () => {
        try {
            const limited = chatState.history.slice(-MAX_HISTORY_LENGTH);
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(limited));
        } catch (error) {
            utils.log('error', 'Error saving history', error);
        }
    }
};


const init = () => {
    elements = { // Re-asignar elementos aquí para asegurarnos de que el DOM esté listo
        toggleButton: document.getElementById('chatbot-toggle') as HTMLButtonElement | null,
        container: document.getElementById('chatbot-container') as HTMLElement | null,
        closeButton: document.getElementById('close-chat') as HTMLButtonElement | null,
        messagesContainer: document.getElementById('chat-messages') as HTMLElement | null,
        input: document.getElementById('user-input') as HTMLInputElement | null,
        sendButton: document.getElementById('send-btn') as HTMLButtonElement | null,
        statusIndicator: document.getElementById('status-indicator') as HTMLDivElement | null,
    };

    if (elements.container) {
        elements.container.classList.remove('opacity-0', 'translate-y-4', 'scale-95');
    }
    elements.toggleButton?.removeEventListener('click', ui.toggleChat);
    elements.closeButton?.removeEventListener('click', ui.toggleChat);
    const savedState = localStorage.getItem('chatIsOpen');
    if (savedState) {
        chatState.isOpen = JSON.parse(savedState);
    }

    if (elements.container) {
        elements.container.classList.toggle('opacity-0', !chatState.isOpen);
        elements.container.classList.toggle('translate-y-4', !chatState.isOpen);
        elements.container.classList.toggle('scale-95', !chatState.isOpen);
        elements.container.classList.toggle('invisible', !chatState.isOpen);
        elements.container.style.pointerEvents = chatState.isOpen ? 'auto' : 'none';
    }
    if (elements.toggleButton) {
        elements.toggleButton.classList.toggle('rotate-45', chatState.isOpen);
    }
    elements.toggleButton?.addEventListener('click', ui.toggleChat);
    elements.closeButton?.addEventListener('click', ui.toggleChat);

    elements.input?.addEventListener('input', (e) => {
        if (elements.sendButton) {
            elements.sendButton.disabled = !(e.target as HTMLInputElement).value.trim();
        }
    });

    elements.input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && elements.sendButton && !elements.sendButton.disabled) {
            e.preventDefault();
            elements.sendButton.dispatchEvent(new Event('click'));
        }
    });

    elements.sendButton?.addEventListener('click', async () => {
            if (!elements.input || !elements.sendButton) return;

            const query = elements.input.value.trim();
            if (!query) return;

            elements.sendButton.disabled = true;
            elements.input.disabled = true;

            try {
                ui.toggleLoading(true);
                chatState.history.push({ role: 'user', content: query, sources: [], timestamp: Date.now() });
                ui.addMessage('user', query);

                ui.showTypingIndicator();
                elements.input.value = '';

                const { response, sources = [], error } = await api.sendQuery(query);

                ui.removeTypingIndicator();

                if (error) {
                    ui.addMessage('error', error);
                    chatState.history.push({ role: 'error', content: error, timestamp: Date.now() });
                } else {
                    chatState.history.push({ role: 'assistant', content: response, sources, timestamp: Date.now() });
                    ui.addMessage('assistant', response, sources);
                }

                history.save();
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Error de conexión';
                ui.addMessage('error', errorMessage);
                utils.log('error', 'Chat error', error);
            } finally {
                ui.toggleLoading(false);
                elements.sendButton.disabled = false;
                elements.input.disabled = false;
            }
        });

    if (elements.messagesContainer) {
        chatState.history = history.load();
        chatState.history.forEach(msg => ui.addMessage(msg.role, msg.content, msg.sources));
    }
};

export { init }; // Exporta la función init para usarla en ChatUi.astro   