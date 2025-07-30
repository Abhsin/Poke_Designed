const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');

// Keep a global reference of the window object
let mainWindow;

// Global AI service state
let globalAIService = null;
let globalAIConfig = {
    model: 'gemini',
    geminiAPIKey: null,
    ollamaConnected: false
};

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    minWidth: 350,
    minHeight: 500,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    titleBarStyle: 'hidden',
    frame: false,
    resizable: true,
    show: false,
    backgroundColor: '#2b2b2b'
  });

  // Load the index.html file
  mainWindow.loadFile('index.html');

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(createWindow);

// Quit when all windows are closed
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Create application menu
const template = [
  {
    label: 'File',
    submenu: [
      {
        label: 'Quit',
        accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
        click: () => {
          app.quit();
        }
      }
    ]
  },
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  }
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);

// Handle window control messages from renderer
ipcMain.on('window-control', (event, action) => {
    switch (action) {
        case 'minimize':
            mainWindow.minimize();
            break;
        case 'maximize':
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize();
            } else {
                mainWindow.maximize();
            }
            break;
        case 'close':
            mainWindow.close();
            break;
        case 'toggle-fullscreen':
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
            break;
        case 'exit-fullscreen':
            mainWindow.setFullScreen(false);
            break;
    }
});

// AI Service IPC handlers
ipcMain.handle('ai-initialize-gemini', async (event, apiKey) => {
    try {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const geminiAPI = new GoogleGenerativeAI(apiKey);
        // Use the latest Gemini 2.5 Flash model as per the official docs
        const geminiModel = geminiAPI.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        globalAIService = {
            type: 'gemini',
            api: geminiAPI,
            model: geminiModel,
            conversationHistory: []
        };
        globalAIConfig.model = 'gemini';
        globalAIConfig.geminiAPIKey = apiKey;
        
        console.log('Gemini API initialized successfully with gemini-2.5-flash');
        return { success: true };
    } catch (error) {
        console.error('Failed to initialize Gemini API:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('ai-test-ollama', async () => {
    try {
        const response = await fetch('http://localhost:11434/api/tags');
        if (response.ok) {
            const data = await response.json();
            globalAIConfig.ollamaConnected = true;
            globalAIConfig.model = 'ollama';
            globalAIConfig.availableOllamaModels = data.models || [];
            console.log('Ollama connection successful, available models:', data.models);
            return { success: true, models: data.models };
        } else {
            return { success: false, error: 'Connection failed' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('ai-send-message', async (event, message) => {
    if (!globalAIService && globalAIConfig.model === 'gemini') {
        throw new Error('Gemini API not initialized');
    }
    
    if (globalAIConfig.model === 'gemini') {
        return await sendToGemini(message);
    } else if (globalAIConfig.model === 'ollama') {
        return await sendToOllama(message);
    } else {
        throw new Error('No AI model selected');
    }
});

ipcMain.handle('ai-get-status', () => {
    return {
        model: globalAIConfig.model,
        geminiInitialized: !!globalAIService,
        ollamaConnected: globalAIConfig.ollamaConnected,
        availableOllamaModels: globalAIConfig.availableOllamaModels || []
    };
});

ipcMain.handle('ai-set-model', (event, model) => {
    globalAIConfig.model = model;
    return { success: true };
});

ipcMain.handle('ai-get-ollama-models', async () => {
    try {
        const response = await fetch('http://localhost:11434/api/tags');
        if (response.ok) {
            const data = await response.json();
            return { success: true, models: data.models || [] };
        } else {
            return { success: false, error: 'Failed to fetch models' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Gemini message handler
async function sendToGemini(message) {
    if (!globalAIService) {
        throw new Error('Gemini API not initialized');
    }

    try {
        // Use the proper content format as per the official docs
        const result = await globalAIService.model.generateContent({
            contents: [{
                parts: [{
                    text: message
                }]
            }]
        });
        
        const response = await result.response;
        const responseText = response.text();

        return responseText;
    } catch (error) {
        console.error('Gemini API error:', error);
        throw new Error(`Gemini API error: ${error.message}`);
    }
}

// Ollama message handler
async function sendToOllama(message) {
    try {
        // Determine which model to use
        let model = 'llama2';
        if (globalAIConfig.model.startsWith('ollama-')) {
            model = globalAIConfig.model.replace('ollama-', '');
        } else if (globalAIConfig.availableOllamaModels?.length > 0) {
            model = globalAIConfig.availableOllamaModels[0].name;
        }
        
        const response = await fetch('http://localhost:11434/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: message }],
                stream: false,
                options: {
                    temperature: 0.7,
                    top_p: 0.9
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        return data.message.content;
    } catch (error) {
        console.error('Ollama API error:', error);
        throw new Error(`Ollama API error: ${error.message}`);
    }
} 