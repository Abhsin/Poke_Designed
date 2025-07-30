const { ipcRenderer } = require('electron');

// Window control functions using ipcRenderer
function minimizeWindow() {
    ipcRenderer.send('window-control', 'minimize');
}

function maximizeWindow() {
    ipcRenderer.send('window-control', 'maximize');
}

function closeWindow() {
    ipcRenderer.send('window-control', 'close');
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
    showNotification('Ollama Connection', 'Connecting to Ollama...');
    
    try {
        const result = await ipcRenderer.invoke('ai-test-ollama');
        if (result.success) {
            const modelCount = result.models ? result.models.length : 0;
            const message = modelCount > 0 
                ? `Successfully connected to Ollama! Found ${modelCount} model(s).`
                : 'Successfully connected to Ollama!';
            showNotification('Ollama Connected', message);
            setTimeout(() => {
                window.location.href = 'main-window.html';
            }, 1000);
        } else {
            showNotification('Connection Failed', 'Could not connect to Ollama. Make sure it\'s running on localhost:11434');
        }
    } catch (error) {
        showNotification('Connection Error', 'Failed to connect to Ollama: ' + error.message);
    }
});

// Continue button
document.getElementById('continueBtn').addEventListener('click', async () => {
    const geminiKey = geminiKeyInput.value.trim();
    const openaiKey = openaiKeyInput.value.trim();
    
    if (!geminiKey && !openaiKey) {
        showNotification('API Keys Required', 'Please enter at least one API key to continue.');
        return;
    }
    
    // Initialize Gemini if API key is provided
    if (geminiKey) {
        try {
            const result = await ipcRenderer.invoke('ai-initialize-gemini', geminiKey);
            if (result.success) {
                showNotification('Success!', 'Gemini API initialized successfully.');
            } else {
                showNotification('Error', 'Failed to initialize Gemini API. Please check your API key.');
                return;
            }
        } catch (error) {
            showNotification('Error', 'Failed to initialize Gemini API: ' + error.message);
            return;
        }
    }
    
    console.log('API Keys saved:', { gemini: geminiKey ? '***' : 'not provided', openai: openaiKey ? '***' : 'not provided' });
    
    // Navigate to main window
    setTimeout(() => {
        window.location.href = 'main-window.html';
    }, 1000);
});

// Notification function
function showNotification(title, message) {
    if (Notification.permission === 'granted') {
        new Notification(title, { body: message });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
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
        ipcRenderer.send('window-control', 'toggle-fullscreen');
    }
    
    // Escape to exit fullscreen
    if (event.key === 'Escape') {
        ipcRenderer.send('window-control', 'exit-fullscreen');
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

// Handle app activation (macOS)
if (process.platform === 'darwin') {
    document.addEventListener('focus', () => {
        console.log('App activated');
    });
    
    document.addEventListener('blur', () => {
        console.log('App deactivated');
    });
} 