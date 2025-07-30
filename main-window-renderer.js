const { ipcRenderer } = require('electron');

// Window control functions
function minimizeWindow() {
    ipcRenderer.send('window-control', 'minimize');
}

function maximizeWindow() {
    ipcRenderer.send('window-control', 'maximize');
}

function closeWindow() {
    ipcRenderer.send('window-control', 'close');
}

function toggleFullscreen() {
    ipcRenderer.send('window-control', 'toggle-fullscreen');
}

// Auto-resize textarea
function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 120);
    textarea.style.height = newHeight + 'px';
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Window control buttons
    const minimizeBtn = document.getElementById('minimizeBtn');
    const maximizeBtn = document.getElementById('maximizeBtn');
    const closeBtn = document.getElementById('closeBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    
    // Chat elements
    const chatInput = document.getElementById('chatInput');
    const pointBtn = document.getElementById('pointBtn');
    const shareScreenBtn = document.getElementById('shareScreenBtn');
    const sendBtn = document.getElementById('sendBtn');
    
    // AI model selector
    const aiModelSelector = document.querySelector('.ai-model-selector');
    
    // Window control event listeners
    if (minimizeBtn) {
        minimizeBtn.addEventListener('click', minimizeWindow);
    }
    
    if (maximizeBtn) {
        maximizeBtn.addEventListener('click', maximizeWindow);
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeWindow);
    }
    
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            console.log('Settings button clicked!');
            // TODO: Open settings modal or navigate to settings page
        });
    }
    
    // AI model selector
    if (aiModelSelector) {
        aiModelSelector.addEventListener('click', () => {
            console.log('AI model selector clicked!');
            showModelSelector();
        });
    }
    
    // Chat input functionality
    if (chatInput) {
        // Auto-resize textarea
        chatInput.addEventListener('input', () => {
            autoResizeTextarea(chatInput);
        });
        
        // Handle Enter key
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
            // Focus on input when page loads
    chatInput.focus();
    
    // Add welcome message
    addWelcomeMessage();
    }
    
    // Action buttons
    if (pointBtn) {
        pointBtn.addEventListener('click', () => {
            console.log('Point button clicked!');
            // TODO: Implement pointing functionality
        });
    }
    
    if (shareScreenBtn) {
        shareScreenBtn.addEventListener('click', () => {
            console.log('Share screen button clicked!');
            // TODO: Implement screen sharing functionality
        });
    }
    
    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl+Q to quit
        if (e.ctrlKey && e.key === 'q') {
            e.preventDefault();
            closeWindow();
        }
        
        // F11 to toggle fullscreen
        if (e.key === 'F11') {
            e.preventDefault();
            toggleFullscreen();
        }
        
        // Escape to clear input
        if (e.key === 'Escape' && chatInput) {
            chatInput.value = '';
            autoResizeTextarea(chatInput);
            chatInput.focus();
        }
    });
});

// Send message function
async function sendMessage() {
    const chatInput = document.getElementById('chatInput');
    const chatMessages = document.querySelector('.chat-messages');
    
    if (!chatInput || !chatMessages) return;
    
    const message = chatInput.value.trim();
    if (!message) return;
    
    // Create user message element
    const messageElement = document.createElement('div');
    messageElement.className = 'message user';
    messageElement.innerHTML = `
        <div class="message-content">${escapeHtml(message)}</div>
    `;
    
    // Add message to chat
    chatMessages.appendChild(messageElement);
    
    // Clear input and reset height
    chatInput.value = '';
    chatInput.style.height = 'auto';
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Show typing indicator
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'message ai typing';
    typingIndicator.innerHTML = `
        <div class="message-content">
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    chatMessages.appendChild(typingIndicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    try {
        // Send message to AI service via main process
        const response = await ipcRenderer.invoke('ai-send-message', message);
        
        // Remove typing indicator
        if (typingIndicator.parentNode) {
            typingIndicator.remove();
        }
        
        // Create AI response element
        const aiMessageElement = document.createElement('div');
        aiMessageElement.className = 'message ai';
        aiMessageElement.innerHTML = `
            <div class="message-content">${escapeHtml(response)}</div>
        `;
        chatMessages.appendChild(aiMessageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
    } catch (error) {
        // Remove typing indicator
        if (typingIndicator.parentNode) {
            typingIndicator.remove();
        }
        
        // Show error message
        const errorMessageElement = document.createElement('div');
        errorMessageElement.className = 'message ai error';
        errorMessageElement.innerHTML = `
            <div class="message-content">
                ❌ Error: ${escapeHtml(error.message)}
            </div>
        `;
        chatMessages.appendChild(errorMessageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        console.error('AI service error:', error);
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show model selector dropdown
async function showModelSelector() {
    const modelText = document.querySelector('.model-text');
    const status = await ipcRenderer.invoke('ai-get-status');
    
    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'model-dropdown';
    
    // Build dropdown items
    let dropdownHTML = '<div class="dropdown-item" data-model="gemini">Gemini</div>';
    
    // Add Ollama models if available
    if (status.ollamaConnected && status.availableOllamaModels.length > 0) {
        status.availableOllamaModels.forEach(model => {
            dropdownHTML += `<div class="dropdown-item" data-model="ollama-${model.name}">Ollama (${model.name})</div>`;
        });
    } else {
        dropdownHTML += '<div class="dropdown-item" data-model="ollama">Ollama</div>';
    }
    
    dropdown.innerHTML = dropdownHTML;
    
    // Position dropdown
    const selector = document.querySelector('.ai-model-selector');
    selector.style.position = 'relative';
    selector.appendChild(dropdown);
    
    // Handle model selection
    dropdown.addEventListener('click', async (e) => {
        if (e.target.classList.contains('dropdown-item')) {
            const model = e.target.dataset.model;
            await ipcRenderer.invoke('ai-set-model', model);
            
            // Update display text
            if (model.startsWith('ollama-')) {
                const modelName = model.replace('ollama-', '');
                modelText.textContent = `Ollama (${modelName})`;
            } else {
                modelText.textContent = model === 'gemini' ? 'Gemini' : 'Ollama';
            }
            
            dropdown.remove();
        }
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!selector.contains(e.target)) {
            dropdown.remove();
        }
    });
}

// Add welcome message
async function addWelcomeMessage() {
    const chatMessages = document.querySelector('.chat-messages');
    if (!chatMessages) return;
    
    const status = await ipcRenderer.invoke('ai-get-status');
    let modelName = 'AI';
    
    if (status.model === 'gemini' && status.geminiInitialized) {
        modelName = 'Gemini 2.5 Flash';
    } else if (status.model.startsWith('ollama-')) {
        const modelNamePart = status.model.replace('ollama-', '');
        modelName = `Ollama (${modelNamePart})`;
    } else if (status.model === 'ollama' && status.ollamaConnected) {
        modelName = 'Ollama';
    }
    
    const welcomeMessage = document.createElement('div');
    welcomeMessage.className = 'message ai';
    welcomeMessage.innerHTML = `
        <div class="message-content">
            👋 Hello! I'm your AI assistant powered by ${modelName}. I'm here to help you with any questions or tasks you might have. 
            Feel free to ask me anything!
        </div>
    `;
    
    chatMessages.appendChild(welcomeMessage);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Export functions for potential use in other modules
window.sendMessage = sendMessage;
window.minimizeWindow = minimizeWindow;
window.maximizeWindow = maximizeWindow;
window.closeWindow = closeWindow; 