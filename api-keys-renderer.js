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

// Window control buttons
document.getElementById('minimizeBtn').addEventListener('click', () => {
    minimizeWindow();
});

document.getElementById('maximizeBtn').addEventListener('click', () => {
    maximizeWindow();
});

document.getElementById('closeBtn').addEventListener('click', () => {
    closeWindow();
});

// API Key inputs
const geminiKeyInput = document.getElementById('geminiKey');
const openaiKeyInput = document.getElementById('openaiKey');

// Connect Ollama button
document.getElementById('connectOllamaBtn').addEventListener('click', async () => {
    console.log('Connect Ollama clicked!');
    showNotification('Ollama Connection', 'Checking Ollama...');
    
    try {
        // First try to connect to Ollama
        const testResult = await window.electronAPI.testOllama();
        if (testResult.success) {
            const modelCount = testResult.models ? testResult.models.length : 0;
            const message = modelCount > 0 
                ? `Successfully connected to Ollama! Found ${modelCount} model(s).`
                : 'Successfully connected to Ollama!';
            showNotification('Ollama Connected', message);
            setTimeout(() => {
                window.location.href = 'main-window.html';
            }, 1000);
            return;
        }
        
        // If connection failed, try to check and start Ollama
        showNotification('Ollama Connection', 'Ollama not running, attempting to start...');
        const startResult = await window.electronAPI.checkAndStartOllama();
        
        if (startResult.success && startResult.started) {
            const modelCount = startResult.models ? startResult.models.length : 0;
            const message = modelCount > 0 
                ? `Ollama started successfully! Found ${modelCount} model(s).`
                : 'Ollama started successfully!';
            showNotification('Ollama Started', message);
            setTimeout(() => {
                window.location.href = 'main-window.html';
            }, 1000);
        } else if (startResult.installed) {
            // Ollama is installed but couldn't start automatically
            showOllamaInstalledDialog(startResult.message);
        } else {
            // Ollama is not installed
            showOllamaNotFoundDialog();
        }
    } catch (error) {
        console.error('Ollama connection error:', error);
        // Show option to download Ollama if connection fails
        showOllamaNotFoundDialog();
    }
});

// Continue button
document.getElementById('continueBtn').addEventListener('click', async () => {
    const geminiKey = geminiKeyInput.value.trim();
    const openaiKey = openaiKeyInput.value.trim();
    const continueBtn = document.getElementById('continueBtn');
    
    if (!geminiKey && !openaiKey) {
        showNotification('API Keys Required', 'Please enter at least one API key to continue.');
        geminiKeyInput.focus();
        return;
    }
    
    // Validate API key formats
    if (geminiKey && (geminiKey.length < 10 || geminiKey.length > 200)) {
        showNotification('Invalid API Key', 'Gemini API key format appears to be invalid.');
        geminiKeyInput.focus();
        return;
    }
    
    if (openaiKey && (openaiKey.length < 10 || openaiKey.length > 200)) {
        showNotification('Invalid API Key', 'OpenAI API key format appears to be invalid.');
        openaiKeyInput.focus();
        return;
    }
    
    // Disable button during processing
    continueBtn.disabled = true;
    continueBtn.style.opacity = '0.6';
    continueBtn.textContent = 'Processing...';
    
    let successfulInitializations = 0;
    
    // Initialize Gemini if API key is provided
    if (geminiKey) {
        try {
            const result = await window.electronAPI.initializeGemini(geminiKey);
            if (result.success) {
                showNotification('Success!', 'Gemini API initialized successfully.');
                successfulInitializations++;
            } else {
                showNotification('Error', 'Failed to initialize Gemini API. Please check your API key.');
                // Re-enable button
                continueBtn.disabled = false;
                continueBtn.style.opacity = '1';
                continueBtn.textContent = 'Continue';
                geminiKeyInput.focus();
                return;
            }
        } catch (error) {
            showNotification('Error', 'Failed to initialize Gemini API: ' + error.message);
            // Re-enable button
            continueBtn.disabled = false;
            continueBtn.style.opacity = '1';
            continueBtn.textContent = 'Continue';
            geminiKeyInput.focus();
            return;
        }
    }
    
    // Initialize OpenAI if API key is provided
    if (openaiKey) {
        try {
            const result = await window.electronAPI.initializeOpenAI(openaiKey);
            if (result.success) {
                showNotification('Success!', 'OpenAI API initialized successfully.');
                successfulInitializations++;
            } else {
                showNotification('Error', 'Failed to initialize OpenAI API. Please check your API key.');
                // Re-enable button
                continueBtn.disabled = false;
                continueBtn.style.opacity = '1';
                continueBtn.textContent = 'Continue';
                openaiKeyInput.focus();
                return;
            }
        } catch (error) {
            showNotification('Error', 'Failed to initialize OpenAI API: ' + error.message);
            // Re-enable button
            continueBtn.disabled = false;
            continueBtn.style.opacity = '1';
            continueBtn.textContent = 'Continue';
            openaiKeyInput.focus();
            return;
        }
    }
    
    console.log('API Keys saved:', { gemini: geminiKey ? '***' : 'not provided', openai: openaiKey ? '***' : 'not provided' });
    
    // Navigate to main window
    setTimeout(() => {
        window.location.href = 'main-window.html';
    }, 1000);
});

// Notification function with improved security
function showNotification(title, message) {
    // Sanitize inputs
    title = window.electronAPI.escapeHtml(title || '');
    message = window.electronAPI.escapeHtml(message || '');
    
    if (Notification.permission === 'granted') {
        new Notification(title, { body: message });
    } else if (Notification.permission !== 'denied') {
        window.electronAPI.requestNotificationPermission().then(permission => {
            if (permission === 'granted') {
                new Notification(title, { body: message });
            }
        });
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
    // Ctrl/Cmd + Q to quit
    if ((event.ctrlKey || event.metaKey) && event.key === 'q') {
        closeWindow();
    }
    
    // F11 to toggle fullscreen
    if (event.key === 'F11') {
        window.electronAPI.toggleFullscreen();
    }
    
    // Escape to exit fullscreen
    if (event.key === 'Escape') {
        window.electronAPI.exitFullscreen();
    }
    
    // Enter to submit form
    if (event.key === 'Enter' && (event.target === geminiKeyInput || event.target === openaiKeyInput)) {
        document.getElementById('continueBtn').click();
    }
});

// Input validation and styling
function updateInputStyle(input) {
    if (input.value.trim()) {
        input.style.color = '#ffffff';
    } else {
        input.style.color = '#808080';
    }
}

geminiKeyInput.addEventListener('input', () => updateInputStyle(geminiKeyInput));
openaiKeyInput.addEventListener('input', () => updateInputStyle(openaiKeyInput));

// Focus management
geminiKeyInput.addEventListener('focus', () => {
    geminiKeyInput.style.color = '#ffffff';
});

openaiKeyInput.addEventListener('focus', () => {
    openaiKeyInput.style.color = '#ffffff';
});

geminiKeyInput.addEventListener('blur', () => updateInputStyle(geminiKeyInput));
openaiKeyInput.addEventListener('blur', () => updateInputStyle(openaiKeyInput));

// Window state management
window.addEventListener('beforeunload', () => {
    // Save any app state here
    console.log('API Keys screen closing...');
});

// Add smooth loading animation
document.addEventListener('DOMContentLoaded', () => {
    const appContainer = document.querySelector('.app-container');
    appContainer.style.opacity = '0';
    appContainer.style.transform = 'translateY(20px)';
    
    setTimeout(() => {
        appContainer.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        appContainer.style.opacity = '1';
        appContainer.style.transform = 'translateY(0)';
    }, 100);
    
    // Auto-focus first input for better UX
    setTimeout(() => {
        geminiKeyInput.focus();
    }, 600);
});

// Prevent context menu on right click
document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
});

// Show dialog when Ollama is installed but couldn't start
function showOllamaInstalledDialog(message) {
    const modal = document.createElement('div');
    modal.className = 'ollama-modal';
    window.electronAPI.setInnerHTML(modal, `
        <div class="ollama-modal-content">
            <div class="ollama-modal-header">
                <h3>Ollama Start Failed</h3>
            </div>
            <div class="ollama-modal-body">
                <p>Ollama is installed but couldn't start automatically.</p>
                <p>${message || 'Please try starting Ollama manually.'}</p>
                <p>You can start Ollama by running <code>ollama serve</code> in your terminal.</p>
            </div>
            <div class="ollama-modal-actions">
                <button class="ollama-modal-btn secondary" id="cancelOllamaBtn">Cancel</button>
                <button class="ollama-modal-btn secondary" id="retryOllamaBtn">Retry Connection</button>
                <button class="ollama-modal-btn primary" id="helpOllamaBtn">Get Help</button>
            </div>
        </div>
    `);
    
    document.body.appendChild(modal);
    
    // Add event listeners
    document.getElementById('cancelOllamaBtn').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    document.getElementById('retryOllamaBtn').addEventListener('click', async () => {
        document.body.removeChild(modal);
        // Retry the connection
        document.getElementById('connectOllamaBtn').click();
    });
    
    document.getElementById('helpOllamaBtn').addEventListener('click', () => {
        // Open Ollama documentation
        window.electronAPI.openExternal('https://ollama.com/docs');
        document.body.removeChild(modal);
    });
    
    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// Handle app activation (macOS)
// Show dialog when Ollama is not found
function showOllamaNotFoundDialog() {
    const modal = document.createElement('div');
    modal.className = 'ollama-modal';
    window.electronAPI.setInnerHTML(modal, `
        <div class="ollama-modal-content">
            <div class="ollama-modal-header">
                <h3>Ollama Not Found</h3>
            </div>
            <div class="ollama-modal-body">
                <p>Ollama is not running or not installed on your system.</p>
                <p>Would you like to download and install Ollama?</p>
            </div>
            <div class="ollama-modal-actions">
                <button class="ollama-modal-btn secondary" id="cancelOllamaBtn">Cancel</button>
                <button class="ollama-modal-btn primary" id="downloadOllamaBtn">Download Ollama</button>
            </div>
        </div>
    `);
    
    document.body.appendChild(modal);
    
    // Add event listeners
    document.getElementById('cancelOllamaBtn').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    document.getElementById('downloadOllamaBtn').addEventListener('click', () => {
        // Open Ollama website
        window.electronAPI.openExternal('https://ollama.com/download');
        document.body.removeChild(modal);
    });
    
    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

if (process.platform === 'darwin') {
    document.addEventListener('focus', () => {
        console.log('App activated');
    });
    
    document.addEventListener('blur', () => {
        console.log('App deactivated');
    });
} 