// Window control functions using secure API
function minimizeWindow() {
    window.electronAPI.minimizeWindow();
}

function maximizeWindow() {
    window.electronAPI.maximizeWindow();
}

function closeWindow() {
    window.electronAPI.closeWindow();
}

function toggleFullscreen() {
    window.electronAPI.toggleFullscreen();
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
    const aiModelSelector = document.getElementById('modelSelector');
    
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
        aiModelSelector.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('AI model selector clicked!');
            showModelSelector();
        });
    }
    
    // Chat input functionality
    if (chatInput) {
        // Ensure input is interactive
        chatInput.setAttribute('contenteditable', 'false'); // Ensure it's a proper textarea
        chatInput.removeAttribute('readonly');
        chatInput.removeAttribute('disabled');
        
        // Also ensure the input container is clickable
        const inputContainer = document.querySelector('.input-container');
        if (inputContainer) {
            inputContainer.addEventListener('click', (e) => {
                e.stopPropagation();
                chatInput.focus();
                console.log('Input container clicked, focusing chat input');
            });
        }
        
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
        
        // Ensure input is clickable and focusable
        chatInput.addEventListener('click', (e) => {
            e.stopPropagation();
            chatInput.focus();
        });
        
        // Handle focus events
        chatInput.addEventListener('focus', () => {
            console.log('Chat input focused');
        });
        
        chatInput.addEventListener('blur', () => {
            console.log('Chat input blurred');
        });
        
        // Focus on input when page loads
        setTimeout(() => {
            chatInput.focus();
            console.log('Chat input focused on load');
            
            // Debug: Check input properties
            console.log('Chat input properties:', {
                disabled: chatInput.disabled,
                readonly: chatInput.readOnly,
                type: chatInput.type,
                value: chatInput.value,
                style: chatInput.style.cssText,
                offsetWidth: chatInput.offsetWidth,
                offsetHeight: chatInput.offsetHeight
            });
        }, 100);
        
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
    window.electronAPI.setInnerHTML(messageElement, `
        <div class="message-content">${window.electronAPI.escapeHtml(message)}</div>
    `);
    
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
    window.electronAPI.setInnerHTML(typingIndicator, `
        <div class="message-content">
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `);
    chatMessages.appendChild(typingIndicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    try {
        // Send message to AI service via secure API
        const response = await window.electronAPI.sendMessage(message);
        
        // Remove typing indicator
        if (typingIndicator.parentNode) {
            typingIndicator.remove();
        }
        
        // Create AI response element
        const aiMessageElement = document.createElement('div');
        aiMessageElement.className = 'message ai';
        
        // Handle response with potential images
        let messageContent = '';
        
        console.log('Response received:', response);
        
        if (typeof response === 'object' && response.hasImages) {
            // Add text content if available
            if (response.text) {
                messageContent += `<div class="message-text">${window.electronAPI.escapeHtml(response.text)}</div>`;
            }
            
            // Add generated images
            if (response.images && response.images.length > 0) {
                messageContent += '<div class="message-images">';
                response.images.forEach((image, index) => {
                    // Handle both URL and base64 formats
                    let imageSrc = '';
                    let downloadData = '';
                    
                    console.log('Processing image:', image);
                    
                    if (image.url) {
                        // DALL-E returns URLs
                        imageSrc = image.url;
                        downloadData = image.url;
                        console.log('Using URL format:', imageSrc);
                    } else if (image.data && image.mimeType) {
                        // Gemini returns base64 data
                        imageSrc = `data:${image.mimeType};base64,${image.data}`;
                        downloadData = imageSrc;
                        console.log('Using base64 format, data length:', image.data.length);
                    } else {
                        console.error('Invalid image format:', image);
                        return;
                    }
                    
                    messageContent += `
                        <div class="generated-image">
                            <img src="${imageSrc}" alt="Generated image ${index + 1}" onclick="openImageModal(this)" onerror="console.error('Failed to load image:', this.src)" />
                            <div class="image-actions">
                                <button onclick="downloadImage('${downloadData}', 'generated-image-${Date.now()}-${index}.png')" class="download-btn">
                                    📥 Download
                                </button>
                            </div>
                        </div>
                    `;
                });
                messageContent += '</div>';
            }
        } else {
            // Handle text-only response
            const responseText = typeof response === 'object' ? response.text || response : response;
            messageContent = `<div class="message-text">${window.electronAPI.escapeHtml(responseText)}</div>`;
        }
        
        window.electronAPI.setInnerHTML(aiMessageElement, `<div class="message-content">${messageContent}</div>`);
        chatMessages.appendChild(aiMessageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
    } catch (error) {
        // Remove typing indicator
        if (typingIndicator.parentNode) {
            typingIndicator.remove();
        }
        
        // Determine error type and provide appropriate message
        let errorMessage = 'An unexpected error occurred. Please try again.';
        if (error.message.includes('API key')) {
            errorMessage = 'API key issue. Please check your API key in settings.';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
            errorMessage = 'Network error. Please check your internet connection.';
        } else if (error.message.includes('rate limit')) {
            errorMessage = 'Rate limit exceeded. Please wait a moment before trying again.';
        } else if (error.message.includes('too long')) {
            errorMessage = 'Message is too long. Please shorten your message.';
        } else if (error.message.includes('not initialized')) {
            errorMessage = 'AI service not initialized. Please configure your API keys.';
        }
        
        // Show error message
        const errorMessageElement = document.createElement('div');
        errorMessageElement.className = 'message ai error';
        window.electronAPI.setInnerHTML(errorMessageElement, `
            <div class="message-content">
                ❌ ${window.electronAPI.escapeHtml(errorMessage)}
            </div>
        `);
        chatMessages.appendChild(errorMessageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        console.error('AI service error:', error);
        
        // Re-enable input
        chatInput.disabled = false;
        chatInput.focus();
    }
}

// HTML escaping is now handled by the secure API

// Truncate text with ellipsis if too long
function truncateText(text, maxLength = 20) {
    if (text.length <= maxLength) {
        return text;
    }
    return text.substring(0, maxLength - 3) + '...';
}

// Remove duplicate function - using the one below instead

// Show model selector dropdown
async function showModelSelector() {
    console.log('showModelSelector called');
    const modelText = document.querySelector('.model-text');
    const selector = document.getElementById('modelSelector');
    
    if (!selector || !modelText) {
        console.error('Selector or modelText not found');
        return;
    }
    
    // Remove existing dropdown if any
    const existingDropdown = document.querySelector('.model-dropdown-right');
    if (existingDropdown) {
        existingDropdown.remove();
        return;
    }
    
    try {
        const status = await window.electronAPI.getAIStatus();
        console.log('AI Status for dropdown:', status);
        
        // Create dropdown with COMPLETELY different class name
        const dropdown = document.createElement('div');
        dropdown.className = 'model-dropdown';
        // Build dropdown with only available models
        let dropdownItems = [];
        
        // Add Gemini models if API is initialized
        if (status.geminiInitialized && status.availableGeminiModels && status.availableGeminiModels.length > 0) {
            status.availableGeminiModels.forEach(model => {
                const displayName = model.displayName || model.name;
                const hasImageGen = model.capabilities && model.capabilities.includes('image-generation');
                const imageGenIcon = hasImageGen ? ' 🎨' : '';
                const tooltip = `${model.description || displayName}${hasImageGen ? ' • Supports image generation' : ''}`;
                dropdownItems.push(`<div class="dropdown-item" data-model="gemini-${model.name}" title="${tooltip}">${displayName}${imageGenIcon}</div>`);
            });
        }
        
        // Add OpenAI models if API is initialized
        if (status.openaiInitialized && status.availableOpenAIModels && status.availableOpenAIModels.length > 0) {
            status.availableOpenAIModels.forEach(model => {
                const displayName = model.displayName || model.name;
                const hasVision = model.capabilities && model.capabilities.includes('vision');
                const hasImageGen = model.capabilities && model.capabilities.includes('image-generation');
                
                let icons = '';
                if (hasVision) icons += ' 👁️';
                if (hasImageGen) icons += ' 🎨';
                
                let capabilities = [];
                if (hasVision) capabilities.push('Supports vision');
                if (hasImageGen) capabilities.push('Supports image generation');
                
                const tooltip = `${model.description || displayName}${capabilities.length > 0 ? ' • ' + capabilities.join(' • ') : ''}`;
                dropdownItems.push(`<div class="dropdown-item" data-model="${model.name}" title="${tooltip}">${displayName}${icons}</div>`);
            });
        }
        
        // Add Ollama models if connected
        if (status.ollamaConnected && status.availableOllamaModels && status.availableOllamaModels.length > 0) {
            status.availableOllamaModels.forEach(model => {
                dropdownItems.push(`<div class="dropdown-item" data-model="ollama-${model.name}">Ollama (${model.name})</div>`);
            });
        }
        
        // If no models are available, show a message
        if (dropdownItems.length === 0) {
            dropdownItems.push('<div class="dropdown-item disabled">No models available</div>');
        }
        
        window.electronAPI.setInnerHTML(dropdown, dropdownItems.join(''));
        
        // Now that the model selector is on the right side, position dropdown normally
        dropdown.style.cssText = `
            position: fixed !important;
            top: 48px !important;
            right: 12px !important;
            left: auto !important;
            transform: none !important;
            background-color: #282a2c !important;
            border-radius: 8px !important;
            padding: 8px 0 !important;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5) !important;
            z-index: 10000 !important;
            min-width: 220px !important;
            max-width: 350px !important;
            pointer-events: auto !important;
        `;
        
        // Add to body
        document.body.appendChild(dropdown);
        
        // Add click handlers
        dropdown.querySelectorAll('.dropdown-item').forEach(item => {
            // Check if item is disabled
            const isDisabled = item.classList.contains('disabled');
            
            item.style.cssText = `
                padding: 8px 16px !important;
                cursor: ${isDisabled ? 'not-allowed' : 'pointer'} !important;
                color: ${isDisabled ? 'rgba(255, 255, 255, 0.4)' : '#ffffff'} !important;
                font-family: 'Lato', sans-serif !important;
                font-size: 14px !important;
                white-space: nowrap !important;
                font-style: ${isDisabled ? 'italic' : 'normal'} !important;
            `;
            
            if (!isDisabled) {
                item.addEventListener('mouseenter', () => {
                    item.style.backgroundColor = 'rgba(244, 255, 253, 0.2)';
                });
                
                item.addEventListener('mouseleave', () => {
                    item.style.backgroundColor = 'transparent';
                });
            }
            
            item.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Ignore clicks on disabled items
                if (isDisabled) return;
                
                const model = item.dataset.model;
                console.log('Model selected:', model);
                
                try {
                    const result = await window.electronAPI.setAIModel(model);
                    console.log('Set model result:', result);
                    
                    // Update display text with truncation
                    if (model.startsWith('ollama-')) {
                        const modelName = model.replace('ollama-', '');
                        const displayText = `Ollama (${modelName})`;
                        modelText.textContent = truncateText(displayText, 24);
                        modelText.title = displayText;
                    } else if (model === 'ollama') {
                        modelText.textContent = 'Ollama';
                        modelText.title = 'Ollama';
                    } else if (model.startsWith('gemini-')) {
                        // Find the model in available Gemini models for display name
                        const status = await window.electronAPI.getAIStatus();
                        const geminiModelName = model.replace('gemini-', '');
                        const geminiModel = status.availableGeminiModels?.find(m => m.name === geminiModelName);
                        const displayText = geminiModel ? geminiModel.displayName : geminiModelName;
                        modelText.textContent = truncateText(displayText, 24);
                        modelText.title = displayText;
                    } else if (model.startsWith('gpt-') || model.startsWith('dall-e')) {
                        // Find the model in available OpenAI models for display name
                        const status = await window.electronAPI.getAIStatus();
                        const openaiModel = status.availableOpenAIModels?.find(m => m.name === model);
                        const displayText = openaiModel ? openaiModel.displayName : model;
                        modelText.textContent = truncateText(displayText, 24);
                        modelText.title = displayText;
                    } else {
                        modelText.textContent = 'Gemini';
                        modelText.title = 'Gemini';
                    }
                    
                    // Update connection status
                    updateConnectionStatus();
                    
                    // Remove dropdown
                    dropdown.remove();
                    
                } catch (error) {
                    console.error('Failed to set model:', error);
                }
            });
        });
        
        // Close dropdown when clicking outside
        const handleOutsideClick = (e) => {
            if (!selector.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.remove();
                document.removeEventListener('click', handleOutsideClick);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', handleOutsideClick);
        }, 100);
        
    } catch (error) {
        console.error('Error in showModelSelector:', error);
    }
}

// Update connection status indicator
async function updateConnectionStatus() {
    try {
        const status = await window.electronAPI.getAIStatus();
        const connectionStatus = document.getElementById('connectionStatus');
        
        if (connectionStatus) {
            const statusImg = connectionStatus.querySelector('img');
            if (statusImg) {
                if ((status.model === 'gemini' || status.model?.startsWith('gemini-')) && status.geminiConnected) {
                    statusImg.src = 'assets/Property 1=Connected.svg';
                    statusImg.alt = 'Connected';
                    connectionStatus.className = 'status-icon connected';
                } else if ((status.model?.startsWith('gpt-') || status.model?.startsWith('dall-e') || status.model === 'openai') && status.openaiConnected) {
                    statusImg.src = 'assets/Property 1=Connected.svg';
                    statusImg.alt = 'Connected';
                    connectionStatus.className = 'status-icon connected';
                } else if (status.model && (status.model === 'ollama' || status.model.startsWith('ollama-')) && status.ollamaConnected) {
                    statusImg.src = 'assets/Property 1=Connected.svg';
                    statusImg.alt = 'Connected';  
                    connectionStatus.className = 'status-icon connected';
                } else {
                    statusImg.src = 'assets/Property 1=Disconnected.svg';
                    statusImg.alt = 'Disconnected';
                    connectionStatus.className = 'status-icon disconnected';
                }
            }
        }
    } catch (error) {
        console.error('Error updating connection status:', error);
    }
}

// Add welcome message
async function addWelcomeMessage() {
    const chatMessages = document.querySelector('.chat-messages');
    if (!chatMessages) return;
    
    try {
        const status = await window.electronAPI.getAIStatus();
        console.log('Welcome message status:', status);
        
        let modelName = 'AI';
        
        if (status.model && status.model.startsWith('gemini-') && status.geminiInitialized) {
            const geminiModelName = status.model.replace('gemini-', '');
            const geminiModel = status.availableGeminiModels?.find(m => m.name === geminiModelName);
            modelName = geminiModel ? geminiModel.displayName : geminiModelName;
        } else if (status.model === 'gemini' && status.geminiInitialized) {
            modelName = 'Gemini';
        } else if (status.model && status.model.startsWith('ollama-')) {
            const modelNamePart = status.model.replace('ollama-', '');
            modelName = `Ollama (${modelNamePart})`;
        } else if (status.model === 'ollama' && status.ollamaConnected) {
            if (status.availableOllamaModels && status.availableOllamaModels.length > 0) {
                modelName = `Ollama (${status.availableOllamaModels[0].name})`;
            } else {
                modelName = 'Ollama';
            }
        }
        
        // Update the model selector text and connection status
        const modelText = document.querySelector('.model-text');
        const connectionStatus = document.getElementById('connectionStatus');
        
        if (modelText) {
            if (status.model && status.model.startsWith('gemini-')) {
                const geminiModelName = status.model.replace('gemini-', '');
                const geminiModel = status.availableGeminiModels?.find(m => m.name === geminiModelName);
                const displayText = geminiModel ? geminiModel.displayName : geminiModelName;
                modelText.textContent = truncateText(displayText, 24);
                modelText.title = displayText;
            } else if (status.model === 'gemini') {
                modelText.textContent = 'Gemini';
                modelText.title = 'Gemini';
            } else if (status.model && status.model.startsWith('ollama-')) {
                const modelNamePart = status.model.replace('ollama-', '');
                const displayText = `Ollama (${modelNamePart})`;
                modelText.textContent = truncateText(displayText, 24);
                modelText.title = displayText; // Show full text on hover
            } else if (status.model === 'ollama') {
                modelText.textContent = 'Ollama';
                modelText.title = 'Ollama';
            }
        }
        
        // Update connection status icon
        if (connectionStatus) {
            const statusImg = connectionStatus.querySelector('img');
            if (statusImg) {
                if ((status.model === 'gemini' || status.model?.startsWith('gemini-')) && status.geminiConnected) {
                    statusImg.src = 'assets/Property 1=Connected.svg';
                    statusImg.alt = 'Connected';
                    connectionStatus.className = 'status-icon connected';
                } else if (status.model && (status.model === 'ollama' || status.model.startsWith('ollama-')) && status.ollamaConnected) {
                    statusImg.src = 'assets/Property 1=Connected.svg';
                    statusImg.alt = 'Connected';
                    connectionStatus.className = 'status-icon connected';
                } else {
                    statusImg.src = 'assets/Property 1=Disconnected.svg';
                    statusImg.alt = 'Disconnected';
                    connectionStatus.className = 'status-icon disconnected';
                }
            }
        }
        
        const welcomeMessage = document.createElement('div');
        welcomeMessage.className = 'message ai';
        window.electronAPI.setInnerHTML(welcomeMessage, `
            <div class="message-content">
                👋 Hello! I'm your AI assistant powered by ${modelName}. I'm here to help you with any questions or tasks you might have. 
                Feel free to ask me anything!
            </div>
        `);
        
        chatMessages.appendChild(welcomeMessage);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (error) {
        console.error('Error in addWelcomeMessage:', error);
    }
}

// Image handling functions
function openImageModal(imgElement) {
    // Create modal for full-size image viewing
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    window.electronAPI.setInnerHTML(modal, `
        <div class="image-modal-content">
            <span class="image-modal-close" onclick="closeImageModal()">&times;</span>
            <img src="${imgElement.src}" alt="${imgElement.alt}" class="modal-image" />
        </div>
    `);
    
    document.body.appendChild(modal);
    
    // Close modal on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeImageModal();
        }
    });
}

function closeImageModal() {
    const modal = document.querySelector('.image-modal');
    if (modal) {
        modal.remove();
    }
}

async function downloadImage(imageData, filename) {
    try {
        // Use Electron's IPC to handle file download
        const result = await window.electronAPI.downloadImage(imageData, filename);
        if (result.success) {
            console.log('Image downloaded successfully');
        } else {
            console.error('Download failed:', result.error);
        }
    } catch (error) {
        console.error('Download error:', error);
    }
}

// Export functions for potential use in other modules
window.sendMessage = sendMessage;
window.minimizeWindow = minimizeWindow;
window.maximizeWindow = maximizeWindow;
window.closeWindow = closeWindow; 