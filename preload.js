const { contextBridge, ipcRenderer } = require('electron');

// Security: HTML sanitization to prevent XSS
function sanitizeHTML(html) {
    if (typeof html !== 'string') {
        return '';
    }
    
    // Simple but effective sanitization that preserves HTML structure
    // Remove dangerous content patterns while keeping safe HTML
    let sanitized = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
        .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/vbscript:/gi, '')
        .replace(/data:text\/html/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .replace(/expression\s*\(/gi, '')
        .replace(/url\s*\(\s*['"]?\s*javascript:/gi, '');
    
    return sanitized;
}

// Security: Safe innerHTML setter
function setInnerHTML(element, content) {
    if (!element || typeof content !== 'string') {
        return;
    }
    
    const sanitizedContent = sanitizeHTML(content);
    element.innerHTML = sanitizedContent;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.send('window-control', 'minimize'),
  maximizeWindow: () => ipcRenderer.send('window-control', 'maximize'),
  closeWindow: () => ipcRenderer.send('window-control', 'close'),
  toggleFullscreen: () => ipcRenderer.send('window-control', 'toggle-fullscreen'),
  exitFullscreen: () => ipcRenderer.send('window-control', 'exit-fullscreen'),

  // AI service methods with input validation
  initializeGemini: (apiKey) => {
    if (typeof apiKey !== 'string' || apiKey.length < 10) {
      throw new Error('Invalid API key format');
    }
    return ipcRenderer.invoke('ai-initialize-gemini', apiKey);
  },
  
  initializeOpenAI: (apiKey) => {
    if (typeof apiKey !== 'string' || apiKey.length < 10) {
      throw new Error('Invalid API key format');
    }
    return ipcRenderer.invoke('ai-initialize-openai', apiKey);
  },
  
  testOllama: () => ipcRenderer.invoke('ai-test-ollama'),
  
  checkAndStartOllama: () => ipcRenderer.invoke('ollama-check-and-start'),
  
  sendMessage: (message) => {
    if (typeof message !== 'string' || message.trim().length === 0) {
      throw new Error('Message must be a non-empty string');
    }
    if (message.length > 10000) {
      throw new Error('Message too long');
    }
    return ipcRenderer.invoke('ai-send-message', message.trim());
  },
  
  getAIStatus: () => ipcRenderer.invoke('ai-get-status'),
  
  setAIModel: (model) => {
    if (typeof model !== 'string' || !['gemini', 'ollama', 'openai', 'gpt-', 'dall-e'].some(m => model.startsWith(m))) {
      throw new Error('Invalid model selection');
    }
    return ipcRenderer.invoke('ai-set-model', model);
  },
  
  getOllamaModels: () => ipcRenderer.invoke('ai-get-ollama-models'),

  // Utility functions
  escapeHtml: (text) => {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // Security: Safe HTML setting
  setInnerHTML: (element, content) => {
    if (!element || typeof content !== 'string') {
      return;
    }
    const sanitizedContent = sanitizeHTML(content);
    element.innerHTML = sanitizedContent;
  },

  // External links
  openExternal: (url) => {
    if (typeof url !== 'string' || !url.startsWith('http')) {
      throw new Error('Invalid URL');
    }
    return ipcRenderer.invoke('open-external', url);
  },

  // Notification permission
  requestNotificationPermission: () => {
    return Notification.requestPermission();
  },

  // Auto-load stored API keys on startup
  loadStoredAPIKeys: () => ipcRenderer.invoke('ai-load-stored-keys'),

  // Clear stored API keys
  clearStoredAPIKeys: () => ipcRenderer.invoke('ai-clear-stored-keys'),
  
  // Download image function
  downloadImage: (imageData, filename) => ipcRenderer.invoke('download-image', imageData, filename)
});

// Remove any global Node.js APIs that might have been exposed
delete window.require;
delete window.exports;
delete window.module;