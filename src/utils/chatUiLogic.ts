// src/utils/chatUiLogic.ts (con depuración mejorada)

import { createClient } from '@supabase/supabase-js';
import type { ChatState, Message, Utils, UIElements, HistoryFunctions, APIFunctions, UIFunctions } from './chatUiTypes.ts';

// Configuración de Supabase
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Constantes
const API_ENDPOINT = '/api/query';
const MAX_HISTORY_LENGTH = 20;
const LOCAL_STORAGE_KEY = 'chatHistory';
const RETRY_CONFIG = { maxRetries: 2, baseDelay: 1000 };

// Estado inicial
let chatState: ChatState = {
  isOpen: false,
  history: [],
  controller: null,
};

// Elementos UI
let elements: UIElements = {
  toggleButton: null,
  container: null,
  closeButton: null,
  hardResetButton: null,
  messagesContainer: null,
  input: null,
  sendButton: null,
  statusIndicator: null,
};

// Utilidades
const utils: Utils = {
  formatContent: (text: string) => text,
  log: (type, message, data) => console.log(`[${type}] ${message}`, data),
};

// Funciones UI
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

  addMessage: (role, content, sources = []) => {
    if (!elements.messagesContainer) return;

    const messageElement = document.createElement('div');
    messageElement.className = `${role}-message flex ${role === 'user' ? 'justify-end' : 'justify-start'} message-enter`;

    const bubble = document.createElement('div');
    bubble.className = `rounded-lg p-3 max-w-[85%] ${ // Changed to rounded-lg to match Astro component
      role === 'error' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700' : // Adjusted error style for better theme fit
      role === 'user' ? 'bg-blue-500 dark:bg-blue-600 text-white' : // Matched user style from Astro component
      'bg-gray-200/70 dark:bg-gray-700/70 text-black dark:text-white' // Applied correct bot style
    }`;

    bubble.innerHTML = utils.formatContent(content); // Ensure formatContent sanitizes or handles HTML correctly

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

  toggleLoading: (isLoading) => {
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
      <div class="bg-gray-800/80 rounded-xl p-3 max-w-[85%]">
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

// Funciones del Historial
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

// Funciones API
const api: APIFunctions = {
    sendQuery: async (query) => {
        let sessionId = localStorage.getItem('chatSessionId');
        if (!sessionId) {
            sessionId = crypto.randomUUID();
            localStorage.setItem('chatSessionId', sessionId);
        }

        // --- Insertar la pregunta del usuario ---
        try {
            const { error: insertUserError } = await supabase.from('chatbot_interactions').insert([
                { session_id: sessionId, timestamp: new Date(), role: 'user', content: query }
            ]);
            if (insertUserError) { // Verificar y registrar error de inserción del usuario
                console.error('[Supabase] Error inserting user query:', insertUserError);
                utils.log('error', 'Error logging user query', insertUserError);
            }
        } catch (e) {
            console.error('[Supabase] Exception inserting user query:', e); // Capturar excepciones
            utils.log('error', 'Exception logging user query', e);
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
                    body: JSON.stringify({ message: query }),
                    signal: chatState.controller.signal
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();

                // --- Insertar la respuesta del bot ---
                try {
                    const { error: insertBotError } = await supabase.from('chatbot_interactions').insert([
                        {
                            session_id: sessionId,
                            timestamp: new Date(),
                            role: 'assistant',
                            content: data.response,
                            sources: data.sources && data.sources.length > 0 ? data.sources : ['Data Base'],
                        }
                    ]);
                   if (insertBotError) {
                        // REGISTRO DETALLADO DEL ERROR
                        console.error('[Supabase] Error inserting bot response:', {
                            error: insertBotError,
                            sessionId,
                            response: data.response.substring(0, 100), // Primeros 100 caracteres
                            sources: data.sources,
                        });
                        utils.log('error', 'Error logging bot response', insertBotError);
                    }

                } catch (e) {
                    // REGISTRO DETALLADO DE LA EXCEPCIÓN
                    console.error('[Supabase] Exception inserting bot response:', {
                        exception: e,
                        sessionId,
                        response: data.response.substring(0, 100), // Primeros 100 caracteres
                        sources: data.sources,
                    });
                    utils.log('error', 'Exception logging bot response', e);
                }

                return data;

            } catch (error) {
                if (retries === 0 || (error as Error).name === 'AbortError') throw error;
                await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.baseDelay * (RETRY_CONFIG.maxRetries - retries + 1)));
                retries--;
            }
        }
        throw new Error('Max retries reached');
    }
};
// Reset completo
const hardResetSession = async () => {
  if (!confirm('Reset the chat?')) return;

  try {
    const oldSessionId = localStorage.getItem('chatSessionId');
    const response = await fetch('/api/query', {
      method: 'DELETE',
      headers: {
        'X-Session-ID': oldSessionId || '',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) throw new Error('Server error');
    const { newSessionId } = await response.json();

    // Reset UI
    if (elements.messagesContainer) {
      // Update reset message style to match new bot style
      elements.messagesContainer.innerHTML = `
        <div class="bot-message flex justify-start">
           
        </div>`;
    }

    // Reset state
    chatState = {
      isOpen: true,
      history: [],
      controller: null
    };

    localStorage.setItem('chatSessionId', newSessionId);
    localStorage.removeItem('chatHistory');
    localStorage.setItem('chatIsOpen', 'true');

    // Force UI update
    ui.toggleChat();
    ui.toggleChat();

  } catch (error) {
    console.error('Reset failed:', error);
    alert('Error al reiniciar. Por favor recarga la página.');
  }
};

// Inicialización
const init = () => {
  // Asignar elementos
  elements = {
    toggleButton: document.getElementById('chatbot-toggle') as HTMLButtonElement,
    container: document.getElementById('chatbot-container') as HTMLElement,
    closeButton: document.getElementById('close-chat') as HTMLButtonElement,
    hardResetButton: document.getElementById('hard-reset') as HTMLButtonElement,
    messagesContainer: document.getElementById('chat-messages') as HTMLElement,
    input: document.getElementById('user-input') as HTMLInputElement,
    sendButton: document.getElementById('send-btn') as HTMLButtonElement,
    statusIndicator: document.getElementById('status-indicator') as HTMLElement,
  };

  // Event listeners
  elements.toggleButton?.addEventListener('click', ui.toggleChat);
  elements.closeButton?.addEventListener('click', ui.toggleChat);
  elements.hardResetButton?.addEventListener('click', hardResetSession);

  elements.input?.addEventListener('input', (e) => {
    if (elements.sendButton) {
      elements.sendButton.disabled = !(e.target as HTMLInputElement).value.trim();
    }
  });

  elements.input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && elements.sendButton && !elements.sendButton.disabled) {
      e.preventDefault();
      elements.sendButton.click();
    }
  });

  // Dentro del event listener del send button
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
        // Función para limpiar la respuesta
        const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedQuery = escapeRegExp(query);
        const queryPattern = new RegExp(`^${escapedQuery}\\s*`, 'i');
        const cleanedResponse = response.replace(queryPattern, '').trim();

        chatState.history.push({ role: 'assistant', content: cleanedResponse, sources, timestamp: Date.now() });
        ui.addMessage('assistant', cleanedResponse, sources);
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

  // Cargar estado inicial
  const savedState = localStorage.getItem('chatIsOpen');
  chatState.isOpen = savedState ? JSON.parse(savedState) : false;
  chatState.history = history.load();

  // Aplicar estado inicial
  if (elements.container) {
    elements.container.classList.toggle('opacity-0', !chatState.isOpen);
    elements.container.classList.toggle('translate-y-4', !chatState.isOpen);
    elements.container.classList.toggle('scale-95', !chatState.isOpen);
    elements.container.classList.toggle('invisible', !chatState.isOpen);
  }

  // Cargar historial
  chatState.history.forEach(msg => ui.addMessage(msg.role, msg.content, msg.sources));
};

export { init };
