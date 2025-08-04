const { app, BrowserWindow, Menu, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Security: Logging utility for security events
function logSecurityEvent(event, details = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        event,
        details,
        process: process.type,
        pid: process.pid
    };
    
    console.log(`[SECURITY] ${event}:`, JSON.stringify(logEntry));
    
    // In production, you might want to send this to a security monitoring service
    // or write to a secure log file
}

// Security: Input validation helper
function validateInput(input, type, options = {}) {
    if (typeof input !== 'string') {
        logSecurityEvent('INVALID_INPUT_TYPE', { type, receivedType: typeof input });
        throw new Error(`Invalid input type for ${type}`);
    }
    
    const trimmed = input.trim();
    
    if (trimmed.length === 0) {
        logSecurityEvent('EMPTY_INPUT', { type });
        throw new Error(`${type} cannot be empty`);
    }
    
    if (options.maxLength && trimmed.length > options.maxLength) {
        logSecurityEvent('INPUT_TOO_LONG', { type, length: trimmed.length, maxLength: options.maxLength });
        throw new Error(`${type} too long (max ${options.maxLength} characters)`);
    }
    
    if (options.pattern && !options.pattern.test(trimmed)) {
        logSecurityEvent('INVALID_INPUT_FORMAT', { type, pattern: options.pattern.toString() });
        throw new Error(`Invalid ${type} format`);
    }
    
    return trimmed;
}

// Security: Rate limiting
const rateLimitMap = new Map();

function checkRateLimit(key, limit = 10, window = 60000) {
    const now = Date.now();
    const userLimit = rateLimitMap.get(key) || [];
    const validRequests = userLimit.filter(time => now - time < window);
    
    if (validRequests.length >= limit) {
        logSecurityEvent('RATE_LIMIT_EXCEEDED', { key, limit, window });
        return false;
    }
    
    validRequests.push(now);
    rateLimitMap.set(key, validRequests);
    return true;
}

// Security: Validate and sanitize process execution
function validateExecutablePath(executableName) {
    const allowedExecutables = ['ollama'];
    if (!allowedExecutables.includes(executableName)) {
        logSecurityEvent('UNAUTHORIZED_EXECUTABLE', { executableName });
        throw new Error(`Unauthorized executable: ${executableName}`);
    }
    return executableName;
}

function getSecureExecutablePath(executableName) {
    const validatedName = validateExecutablePath(executableName);
    
    // For production, use absolute paths when possible
    if (process.platform === 'win32') {
        // On Windows, check if executable is in PATH
        try {
            const { execSync } = require('child_process');
            const result = execSync(`where ${validatedName}`, { encoding: 'utf8' });
            const paths = result.trim().split('\n');
            return paths[0]; // Use first found path
        } catch (error) {
            console.warn(`Could not find ${validatedName} in PATH, using name directly`);
            return validatedName;
        }
    } else {
        // On Unix-like systems, check if executable is in PATH
        try {
            const { execSync } = require('child_process');
            const result = execSync(`which ${validatedName}`, { encoding: 'utf8' });
            return result.trim();
        } catch (error) {
            console.warn(`Could not find ${validatedName} in PATH, using name directly`);
            return validatedName;
        }
    }
}

function secureSpawnProcess(executableName, args = []) {
    const securePath = getSecureExecutablePath(executableName);
    
    // Validate arguments
    const sanitizedArgs = args.map(arg => {
        if (typeof arg !== 'string') {
            throw new Error('Process arguments must be strings');
        }
        // Basic sanitization - remove any potentially dangerous characters
        return arg.replace(/[;&|`$]/g, '');
    });
    
    const { spawn } = require('child_process');
    
    try {
        const childProcess = spawn(securePath, sanitizedArgs, {
            detached: true,
            stdio: 'ignore',
            // Additional security options
            windowsHide: true,
            shell: false // Prevent shell injection
        });
        
        // Unref to prevent the parent from waiting
        childProcess.unref();
        
        // Add error handling
        childProcess.on('error', (error) => {
            logSecurityEvent('PROCESS_SPAWN_ERROR', { executableName, error: error.message });
            console.error(`Failed to start ${executableName}:`, error.message);
        });
        
        return childProcess;
    } catch (error) {
        logSecurityEvent('PROCESS_SPAWN_FAILED', { executableName, error: error.message });
        console.error(`Error spawning ${executableName}:`, error.message);
        throw error;
    }
}

// Security: URL validation and sanitization
function validateExternalURL(url) {
    if (typeof url !== 'string') {
        throw new Error('URL must be a string');
    }
    
    // Check if URL starts with http/https
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        throw new Error('URL must use HTTP or HTTPS protocol');
    }
    
    // Parse URL to validate structure
    let urlObj;
    try {
        urlObj = new URL(url);
    } catch (error) {
        throw new Error('Invalid URL format');
    }
    
    // Allowlist of trusted domains
    const allowedDomains = [
        'ollama.com',
        'github.com',
        'docs.ollama.com',
        'ollama.ai'
    ];
    
    // Check if domain is in allowlist
    const hostname = urlObj.hostname.toLowerCase();
    const isAllowed = allowedDomains.some(domain => 
        hostname === domain || hostname.endsWith('.' + domain)
    );
    
    if (!isAllowed) {
        logSecurityEvent('UNAUTHORIZED_DOMAIN', { hostname, allowedDomains });
        throw new Error(`Domain ${hostname} is not in the allowed list`);
    }
    
    // Additional security checks
    if (urlObj.protocol !== 'https:' && urlObj.protocol !== 'http:') {
        throw new Error('Only HTTP and HTTPS protocols are allowed');
    }
    
    // Prevent potential SSRF by checking for localhost/127.0.0.1
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
        logSecurityEvent('SSRF_ATTEMPT', { hostname });
        throw new Error('Local network URLs are not allowed');
    }
    
    return url;
}

// Security: Atomic file write operation
async function atomicWriteFile(filePath, data, options = {}) {
    const tempPath = filePath + '.tmp';
    
    try {
        // Write to temporary file first
        await fs.promises.writeFile(tempPath, data, { 
            mode: options.mode || 0o600,
            flag: 'w'
        });
        
        // Atomic move operation
        await fs.promises.rename(tempPath, filePath);
        
        return true;
    } catch (error) {
        // Clean up temp file if it exists
        try {
            await fs.promises.unlink(tempPath);
        } catch (cleanupError) {
            // Ignore cleanup errors
        }
        throw error;
    }
}

// Security: Safe file read operation
async function safeReadFile(filePath) {
    try {
        const data = await fs.promises.readFile(filePath, { 
            encoding: 'utf8',
            flag: 'r'
        });
        return data;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null; // File doesn't exist
        }
        throw error;
    }
}

// Security: Content validation
function validateMessageContent(message) {
    const dangerousPatterns = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /javascript:/gi,
        /data:text\/html/gi,
        /vbscript:/gi,
        /on\w+\s*=/gi
    ];
    
    for (const pattern of dangerousPatterns) {
        if (pattern.test(message)) {
            logSecurityEvent('DANGEROUS_CONTENT_DETECTED', { 
                pattern: pattern.toString(),
                messageLength: message.length
            });
            throw new Error('Message contains potentially dangerous content');
        }
    }
    
    return message;
}

// Keep a global reference of the window object
let mainWindow;

// Global AI service state
let globalAIService = null;
let globalAIConfig = {
    model: 'gemini',
    geminiAPIKey: null,
    ollamaConnected: false,
    openaiAPIKey: null,
    openaiConnected: false
};

// Secure storage paths
const configDir = path.join(os.homedir(), '.poke-app');
const encryptedKeysPath = path.join(configDir, 'encrypted-keys.dat');

// Ensure config directory exists
function ensureConfigDir() {
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }
}

// Securely store API key
async function storeAPIKey(service, apiKey) {
    if (!safeStorage.isEncryptionAvailable()) {
        console.warn('Encryption not available, API keys will be stored in memory only');
        return false;
    }
    
    try {
        ensureConfigDir();
        const encrypted = safeStorage.encryptString(apiKey);
        const keyData = {
            service,
            data: encrypted.toString('base64'),
            timestamp: Date.now()
        };
        
        let storedKeys = {};
        const existingData = await safeReadFile(encryptedKeysPath);
        if (existingData) {
            try {
                storedKeys = JSON.parse(existingData);
            } catch (e) {
                console.warn('Could not read existing keys file, creating new one');
            }
        }
        
        storedKeys[service] = keyData;
        const dataToWrite = JSON.stringify(storedKeys);
        
        await atomicWriteFile(encryptedKeysPath, dataToWrite, { mode: 0o600 });
        return true;
    } catch (error) {
        logSecurityEvent('API_KEY_STORE_FAILED', { service, error: error.message });
        console.error('Failed to store API key securely:', error);
        return false;
    }
}

// Securely retrieve API key
async function retrieveAPIKey(service) {
    if (!safeStorage.isEncryptionAvailable()) {
        return null;
    }
    
    try {
        const existingData = await safeReadFile(encryptedKeysPath);
        if (!existingData) {
            return null;
        }
        
        const storedKeys = JSON.parse(existingData);
        if (!storedKeys[service]) {
            return null;
        }
        
        const keyData = storedKeys[service];
        
        // Handle multiple key storage formats
        let decryptedKey;
        
        if (typeof keyData === 'string') {
            // Could be plain text (old) or base64 encrypted (new)
            if (keyData.startsWith('sk-') || keyData.startsWith('AIza') || keyData.length < 50) {
                // Looks like a plain text API key
                decryptedKey = keyData;
            } else {
                // Looks like encrypted base64 string
                try {
                    decryptedKey = safeStorage.decryptString(Buffer.from(keyData, 'base64'));
                } catch (decryptError) {
                    console.warn(`Failed to decrypt key for ${service}, trying as plain text:`, decryptError.message);
                    decryptedKey = keyData; // Fallback to plain text
                }
            }
        } else if (keyData && keyData.data) {
            // Old format: object with data array
            try {
                const encryptedBuffer = Buffer.from(keyData.data, 'base64');
                decryptedKey = safeStorage.decryptString(encryptedBuffer);
            } catch (decryptError) {
                console.warn(`Failed to decrypt key data for ${service}:`, decryptError.message);
                // Try to use data directly if it's an array of bytes representing a string
                if (Array.isArray(keyData.data)) {
                    decryptedKey = Buffer.from(keyData.data).toString('utf8');
                } else {
                    throw decryptError;
                }
            }
        } else {
            throw new Error('Invalid stored key format for service: ' + service);
        }
        
        return decryptedKey;
    } catch (error) {
        console.error('Failed to retrieve API key:', error);
        return null;
    }
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    minWidth: 350,
    minHeight: 500,
    icon: path.join(__dirname, 'assets', 'icons', 'icon-256.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
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

// Load stored API keys on startup
async function loadStoredAPIKeys() {
    try {
        const geminiKey = await retrieveAPIKey('gemini');
        const openaiKey = await retrieveAPIKey('openai');
        
        // Load Gemini if key exists
        if (geminiKey) {
            const { GoogleGenerativeAI } = require('@google/generative-ai');
            const geminiAPI = new GoogleGenerativeAI(geminiKey);
            
            // Since the Google Generative AI SDK doesn't have listModels, 
            // we'll provide a curated list of known available models
            const knownGeminiModels = [
                {
                    name: 'gemini-2.5-flash',
                    displayName: 'Gemini 2.5 Flash',
                    description: 'Fast and versatile performance across a diverse variety of tasks',
                    capabilities: ['text', 'vision']
                },
                {
                    name: 'gemini-2.5-pro',
                    displayName: 'Gemini 2.5 Pro',
                    description: 'Advanced reasoning and complex task performance',
                    capabilities: ['text', 'vision']
                },
                {
                    name: 'gemini-2.0-flash-preview-image-generation',
                    displayName: 'Gemini 2.0 Flash Image Gen',
                    description: 'Conversational image generation and editing',
                    capabilities: ['text', 'vision', 'image-generation']
                },
                {
                    name: 'gemini-1.5-pro',
                    displayName: 'Gemini 1.5 Pro',
                    description: 'Advanced reasoning with large context window',
                    capabilities: ['text', 'vision']
                },
                {
                    name: 'gemini-1.5-flash',
                    displayName: 'Gemini 1.5 Flash',
                    description: 'Fast performance for diverse tasks',
                    capabilities: ['text', 'vision']
                }
            ];
            
            globalAIConfig.availableGeminiModels = knownGeminiModels;
            console.log('Available Gemini models:', knownGeminiModels.map(m => m.name));
            
            // Use gemini-2.5-flash as default
            const defaultModelName = 'gemini-2.5-flash';
            const geminiModel = geminiAPI.getGenerativeModel({ model: defaultModelName });
            
            globalAIService = {
                type: 'gemini',
                api: geminiAPI,
                model: geminiModel,
                conversationHistory: []
            };
            globalAIConfig.model = defaultModelName;
            console.log(`Stored Gemini API key loaded successfully with model: ${defaultModelName}`);
        }
        
        // Load OpenAI if key exists
        if (openaiKey) {
            try {
                const OpenAI = require('openai');
                const openaiAPI = new OpenAI({
                    apiKey: openaiKey
                });
                
                // Test the key before proceeding
                try {
                    await openaiAPI.models.list();
                    console.log('Stored OpenAI API key validated successfully');
                } catch (testError) {
                    console.warn('Stored OpenAI API key is invalid, skipping OpenAI initialization:', testError.message);
                    // Remove invalid key from storage
                    try {
                        const existingData = await safeReadFile(encryptedKeysPath);
                        if (existingData) {
                            const storedKeys = JSON.parse(existingData);
                            delete storedKeys.openai;
                            await atomicWriteFile(encryptedKeysPath, JSON.stringify(storedKeys), { mode: 0o600 });
                            console.log('Invalid OpenAI key removed from storage');
                        }
                    } catch (cleanupError) {
                        console.error('Failed to remove invalid OpenAI key from storage:', cleanupError.message);
                    }
                    return; // Skip OpenAI initialization
                }
                
                const knownOpenAIModels = [
                    {
                        name: 'gpt-4o',
                        displayName: 'GPT-4o',
                        description: 'Most advanced multimodal model with vision and image generation',
                        capabilities: ['text', 'vision', 'image-generation']
                    },
                    {
                        name: 'gpt-4o-mini',
                        displayName: 'GPT-4o Mini',
                        description: 'Fast and cost-effective model with vision capabilities',
                        capabilities: ['text', 'vision']
                    },
                    {
                        name: 'gpt-4-turbo-preview',
                        displayName: 'GPT-4 Turbo',
                        description: 'Advanced reasoning with large context window and vision',
                        capabilities: ['text', 'vision']
                    },
                    {
                        name: 'gpt-4',
                        displayName: 'GPT-4',
                        description: 'High-quality responses for complex tasks',
                        capabilities: ['text']
                    },
                    {
                        name: 'gpt-3.5-turbo',
                        displayName: 'GPT-3.5 Turbo',
                        description: 'Fast and efficient for most conversations',
                        capabilities: ['text']
                    },
                    {
                        name: 'dall-e-3',
                        displayName: 'DALL-E 3',
                        description: 'Advanced image generation model',
                        capabilities: ['image-generation']
                    }
                ];
                
                globalAIConfig.availableOpenAIModels = knownOpenAIModels;
                globalAIConfig.openaiConnected = true;
                console.log('Available OpenAI models:', knownOpenAIModels.map(m => m.name));
                
                // If no Gemini service is set, use OpenAI as default
                if (!globalAIService) {
                    globalAIService = {
                        type: 'openai',
                        api: openaiAPI,
                        conversationHistory: []
                    };
                    globalAIConfig.model = 'gpt-4o-mini';
                    console.log(`Stored OpenAI API key loaded successfully with model: gpt-4o-mini`);
                } else {
                    console.log('OpenAI API key loaded successfully (Gemini is primary)');
                }
            } catch (error) {
                console.error('Failed to load OpenAI API key:', error.message);
                // Don't let OpenAI errors prevent app startup
            }
        }
        
        // If no API keys, check if Ollama is available
        if (!geminiKey && !openaiKey) {
            try {
                // Try IPv4 first, then fallback to localhost
                let response;
                try {
                    response = await fetch('http://127.0.0.1:11434/api/tags');
                } catch (ipv4Error) {
                    console.log('IPv4 connection failed, trying localhost:', ipv4Error.message);
                    response = await fetch('http://localhost:11434/api/tags');
                }
                
                if (response.ok) {
                    const data = await response.json();
                    globalAIConfig.ollamaConnected = true;
                    globalAIConfig.model = 'ollama';
                    globalAIConfig.availableOllamaModels = data.models || [];
                    console.log('No API keys found, defaulting to Ollama');
                }
            } catch (error) {
                console.log('No API keys and Ollama not available');
            }
        }
    } catch (error) {
        console.error('Failed to load stored API keys:', error);
    }
}

// IPC handlers for key management
ipcMain.handle('ai-load-stored-keys', async () => {
    await loadStoredAPIKeys();
    return { success: true };
});

ipcMain.handle('ai-clear-stored-keys', async () => {
    try {
        const existingData = await safeReadFile(encryptedKeysPath);
        if (existingData) {
            await fs.promises.unlink(encryptedKeysPath);
        }
        globalAIService = null;
        globalAIConfig.geminiAPIKey = null;
        globalAIConfig.openaiAPIKey = null;
        globalAIConfig.openaiConnected = false;
        logSecurityEvent('STORED_KEYS_CLEARED', {});
        return { success: true };
    } catch (error) {
        logSecurityEvent('CLEAR_KEYS_FAILED', { error: error.message });
        console.error('Failed to clear stored keys:', error);
        return { success: false, error: error.message };
    }
});

// Handle image downloads
ipcMain.handle('download-image', async (event, imageData, filename) => {
    try {
        const { dialog } = require('electron');
        
        // Show save dialog
        const result = await dialog.showSaveDialog({
            title: 'Save Generated Image',
            defaultPath: filename,
            filters: [
                { name: 'Images', extensions: ['png', 'jpg', 'jpeg'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        
        if (result.canceled) {
            return { success: false, error: 'Download cancelled' };
        }
        
        const filePath = result.filePath;
        
        // Handle different image data formats
        if (imageData.startsWith('data:')) {
            // Base64 data
            const base64Data = imageData.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            await fs.promises.writeFile(filePath, buffer);
        } else if (imageData.startsWith('http')) {
            // URL - download the image first
            const https = require('https');
            const http = require('http');
            
            const url = new URL(imageData);
            const client = url.protocol === 'https:' ? https : http;
            
            const response = await new Promise((resolve, reject) => {
                client.get(url, (res) => {
                    if (res.statusCode !== 200) {
                        reject(new Error(`HTTP ${res.statusCode}`));
                        return;
                    }
                    
                    const chunks = [];
                    res.on('data', (chunk) => chunks.push(chunk));
                    res.on('end', () => resolve(Buffer.concat(chunks)));
                    res.on('error', reject);
                }).on('error', reject);
            });
            
            await fs.promises.writeFile(filePath, response);
        } else {
            throw new Error('Invalid image data format');
        }
        
        logSecurityEvent('IMAGE_DOWNLOADED', { filename, filePath });
        return { success: true, filePath };
        
    } catch (error) {
        logSecurityEvent('IMAGE_DOWNLOAD_FAILED', { error: error.message, filename });
        console.error('Failed to download image:', error);
        return { success: false, error: error.message };
    }
});

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
    createWindow();
    await loadStoredAPIKeys();
});

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
        // Enhanced API key validation with security logging
        const validatedKey = validateInput(apiKey, 'Gemini API key', {
            maxLength: 200,
            pattern: /^AIza[0-9A-Za-z_-]{35,}$/
        });
        
        logSecurityEvent('GEMINI_API_INITIALIZATION_ATTEMPT', { 
            keyLength: validatedKey.length,
            keyPrefix: validatedKey.substring(0, 4)
        });
    
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const geminiAPI = new GoogleGenerativeAI(validatedKey);
        
        // Since the Google Generative AI SDK doesn't have listModels, 
        // we'll provide a curated list of known available models
        const knownGeminiModels = [
            {
                name: 'gemini-2.5-flash',
                displayName: 'Gemini 2.5 Flash',
                description: 'Fast and versatile performance across a diverse variety of tasks',
                capabilities: ['text', 'vision']
            },
            {
                name: 'gemini-2.5-pro',
                displayName: 'Gemini 2.5 Pro',
                description: 'Advanced reasoning and complex task performance',
                capabilities: ['text', 'vision']
            },
            {
                name: 'gemini-2.0-flash-preview-image-generation',
                displayName: 'Gemini 2.0 Flash Image Gen',
                description: 'Conversational image generation and editing',
                capabilities: ['text', 'vision', 'image-generation']
            },
            {
                name: 'gemini-1.5-pro',
                displayName: 'Gemini 1.5 Pro',
                description: 'Advanced reasoning with large context window',
                capabilities: ['text', 'vision']
            },
            {
                name: 'gemini-1.5-flash',
                displayName: 'Gemini 1.5 Flash',
                description: 'Fast performance for diverse tasks',
                capabilities: ['text', 'vision']
            }
        ];
        
        globalAIConfig.availableGeminiModels = knownGeminiModels;
        console.log('Available Gemini models:', knownGeminiModels.map(m => m.name));
        
        // Use gemini-2.5-flash as default
        const defaultModelName = 'gemini-2.5-flash';
        const geminiModel = geminiAPI.getGenerativeModel({ model: defaultModelName });
        
        globalAIService = {
            type: 'gemini',
            api: geminiAPI,
            model: geminiModel,
            conversationHistory: []
        };
        globalAIConfig.model = defaultModelName;
        
        console.log(`Gemini API initialized successfully with model: ${defaultModelName}`);
        
        logSecurityEvent('GEMINI_API_INITIALIZATION_SUCCESS', { 
            keyLength: validatedKey.length
        });
        
        // Store API key securely
        const stored = await storeAPIKey('gemini', validatedKey);
        if (stored) {
            console.log('Gemini API key stored securely');
        } else {
            console.warn('API key stored in memory only (encryption not available)');
            globalAIConfig.geminiAPIKey = validatedKey; // Fallback to memory storage
        }
        
        return { success: true };
    } catch (error) {
        logSecurityEvent('GEMINI_API_INITIALIZATION_FAILED', { 
            error: error.message
        });
        console.error('Failed to initialize Gemini API:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('ai-initialize-openai', async (event, apiKey) => {
    try {
        // Enhanced API key validation with security logging
        const validatedKey = validateInput(apiKey, 'OpenAI API key', {
            maxLength: 200,
            pattern: /^sk-[0-9A-Za-z]{20,}$/
        });
        
        logSecurityEvent('OPENAI_API_INITIALIZATION_ATTEMPT', { 
            keyLength: validatedKey.length,
            keyPrefix: validatedKey.substring(0, 3)
        });
    
        const OpenAI = require('openai');
        const openaiAPI = new OpenAI({
            apiKey: validatedKey
        });
        
        // Test the API key with a simple model listing request
        try {
            const models = await openaiAPI.models.list();
            console.log('OpenAI API key validated successfully');
        } catch (testError) {
            console.error('OpenAI API key validation failed:', testError.message);
            return { success: false, error: `Invalid API key: ${testError.message}` };
        }
        
        const knownOpenAIModels = [
            {
                name: 'gpt-4o',
                displayName: 'GPT-4o',
                description: 'Most advanced multimodal model with vision and image generation',
                capabilities: ['text', 'vision', 'image-generation']
            },
            {
                name: 'gpt-4o-mini',
                displayName: 'GPT-4o Mini',
                description: 'Fast and cost-effective model with vision capabilities',
                capabilities: ['text', 'vision']
            },
            {
                name: 'gpt-4-turbo-preview',
                displayName: 'GPT-4 Turbo',
                description: 'Advanced reasoning with large context window and vision',
                capabilities: ['text', 'vision']
            },
            {
                name: 'gpt-4',
                displayName: 'GPT-4',
                description: 'High-quality responses for complex tasks',
                capabilities: ['text']
            },
            {
                name: 'gpt-3.5-turbo',
                displayName: 'GPT-3.5 Turbo',
                description: 'Fast and efficient for most conversations',
                capabilities: ['text']
            },
            {
                name: 'dall-e-3',
                displayName: 'DALL-E 3',
                description: 'Advanced image generation model',
                capabilities: ['image-generation']
            }
        ];
        
        globalAIConfig.availableOpenAIModels = knownOpenAIModels;
        globalAIConfig.openaiConnected = true;
        console.log('Available OpenAI models:', knownOpenAIModels.map(m => m.name));
        
        // Use gpt-4o-mini as default
        const defaultModelName = 'gpt-4o-mini';
        
        globalAIService = {
            type: 'openai',
            api: openaiAPI,
            conversationHistory: []
        };
        globalAIConfig.model = defaultModelName;
        
        console.log(`OpenAI API initialized successfully with model: ${defaultModelName}`);
        
        logSecurityEvent('OPENAI_API_INITIALIZATION_SUCCESS', { 
            keyLength: validatedKey.length
        });
        
        // Store API key securely
        const stored = await storeAPIKey('openai', validatedKey);
        if (stored) {
            console.log('OpenAI API key stored securely');
        } else {
            console.warn('API key stored in memory only (encryption not available)');
            globalAIConfig.openaiAPIKey = validatedKey; // Fallback to memory storage
        }
        
        return { success: true };
    } catch (error) {
        logSecurityEvent('OPENAI_API_INITIALIZATION_FAILED', { 
            error: error.message
        });
        console.error('Failed to initialize OpenAI API:', error);
        return { success: false, error: `Initialization failed: ${error.message}` };
    }
});

ipcMain.handle('ai-test-ollama', async () => {
    try {
        // Try IPv4 first, then fallback to localhost
        let response;
        try {
            response = await fetch('http://127.0.0.1:11434/api/tags');
        } catch (ipv4Error) {
            console.log('IPv4 connection failed, trying localhost:', ipv4Error.message);
            response = await fetch('http://localhost:11434/api/tags');
        }
        
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
    try {
        // Enhanced message validation with security logging
        const validatedMessage = validateInput(message, 'user message', {
            maxLength: 5000
        });
        
        // Check for potentially dangerous content
        const sanitizedMessage = validateMessageContent(validatedMessage);
        
        // Rate limiting check
        const clientId = event.sender.id || 'unknown';
        if (!checkRateLimit(`message_${clientId}`, 10, 60000)) { // 10 messages per minute
            throw new Error('Rate limit exceeded. Please wait before sending another message.');
        }
        
        logSecurityEvent('MESSAGE_SENT', { 
            messageLength: sanitizedMessage.length,
            model: globalAIConfig.model,
            clientId
        });
    
    console.log('Sending message with model:', globalAIConfig.model);
    
    if (globalAIConfig.model === 'gemini' || globalAIConfig.model.startsWith('gemini-')) {
        if (!globalAIService) {
            throw new Error('Gemini API not initialized');
        }
        const result = await sendToGemini(sanitizedMessage);
        
        // Handle the new response format that might include images
        if (typeof result === 'object' && result.hasImages) {
            return {
                text: result.text,
                images: result.images,
                hasImages: true
            };
        } else if (typeof result === 'object') {
            return result.text || result;
        } else {
            return result;
        }
    } else if (globalAIConfig.model === 'openai' || globalAIConfig.model.startsWith('gpt-') || globalAIConfig.model.startsWith('dall-e')) {
        if (!globalAIService) {
            throw new Error('OpenAI API not initialized');
        }
        const result = await sendToOpenAI(sanitizedMessage);
        
        // Handle image responses from OpenAI (DALL-E)
        if (typeof result === 'object' && result.hasImages) {
            return {
                text: result.text,
                images: result.images,
                hasImages: true
            };
        } else if (typeof result === 'object') {
            return result.text || result;
        } else {
            return result;
        }
    } else if (globalAIConfig.model === 'ollama' || globalAIConfig.model.startsWith('ollama-')) {
        return await sendToOllama(sanitizedMessage);
    } else {
        throw new Error('No AI model selected');
    }
    } catch (error) {
        logSecurityEvent('MESSAGE_PROCESSING_ERROR', { 
            error: error.message,
            model: globalAIConfig.model
        });
        throw error;
    }
});

ipcMain.handle('ai-get-status', () => {
    // Show all services that have API keys available, regardless of which one is currently active
    const geminiInitialized = !!(globalAIConfig.availableGeminiModels && globalAIConfig.availableGeminiModels.length > 0);
    const geminiConnected = geminiInitialized;
    const openaiInitialized = !!(globalAIConfig.availableOpenAIModels && globalAIConfig.availableOpenAIModels.length > 0);
    const openaiConnected = openaiInitialized;
    
    return {
        model: globalAIConfig.model,
        geminiInitialized: geminiInitialized,
        geminiConnected: geminiConnected,
        openaiInitialized: openaiInitialized,
        openaiConnected: openaiConnected,
        ollamaConnected: globalAIConfig.ollamaConnected,
        availableOllamaModels: globalAIConfig.availableOllamaModels || [],
        availableGeminiModels: globalAIConfig.availableGeminiModels || [],
        availableOpenAIModels: globalAIConfig.availableOpenAIModels || []
    };
});

ipcMain.handle('ai-set-model', async (event, model) => {
    // Validate model selection
    if (typeof model !== 'string') {
        throw new Error('Model must be a string');
    }
    
    const validModels = ['gemini', 'ollama', 'openai'];
    const isValidOllamaModel = model.startsWith('ollama-') && model.length > 7;
    const isValidGeminiModel = model.startsWith('gemini-') && model.length > 7;
    const isValidOpenAIModel = model.startsWith('gpt-') && model.length > 4;
    const isValidDALLEModel = model.startsWith('dall-e') && model.length > 6;
    
    if (!validModels.includes(model) && !isValidOllamaModel && !isValidGeminiModel && !isValidOpenAIModel && !isValidDALLEModel) {
        throw new Error('Invalid model selection');
    }
    
    // If switching to a specific Gemini model, ensure Gemini service is active and update the model
    if (isValidGeminiModel && globalAIConfig.availableGeminiModels) {
        // Switch to Gemini service if not already active
        if (!globalAIService || globalAIService.type !== 'gemini') {
            try {
                // Get the stored Gemini API key
                const geminiKey = await retrieveAPIKey('gemini');
                if (geminiKey) {
                    const { GoogleGenerativeAI } = require('@google/generative-ai');
                    const geminiAPI = new GoogleGenerativeAI(geminiKey);
                    
                    const modelName = model.replace('gemini-', '');
                    const geminiModel = geminiAPI.getGenerativeModel({ model: modelName });
                    
                    globalAIService = {
                        type: 'gemini',
                        api: geminiAPI,
                        model: geminiModel,
                        conversationHistory: []
                    };
                    console.log(`Switched to Gemini service for model: ${modelName}`);
                } else {
                    throw new Error('Gemini API key not found');
                }
            } catch (error) {
                console.error('Failed to switch to Gemini service:', error.message);
                throw new Error('Failed to activate Gemini service');
            }
        } else {
            // Already on Gemini, just switch the model
            const modelName = model.replace('gemini-', '');
            try {
                const geminiModel = globalAIService.api.getGenerativeModel({ model: modelName });
                globalAIService.model = geminiModel;
                console.log(`Switched to Gemini model: ${modelName}`);
            } catch (error) {
                console.error(`Error switching to Gemini model ${modelName}:`, error);
                throw new Error(`Failed to switch to model: ${modelName}`);
            }
        }
    }
    
    // If switching to any OpenAI model, ensure OpenAI service is active
    if ((isValidOpenAIModel || isValidDALLEModel) && globalAIConfig.openaiConnected) {
        // Switch to OpenAI service if not already active
        if (!globalAIService || globalAIService.type !== 'openai') {
            try {
                const OpenAI = require('openai');
                // Get the stored OpenAI API key
                const openaiKey = await retrieveAPIKey('openai');
                if (openaiKey) {
                    const openaiAPI = new OpenAI({ apiKey: openaiKey });
                    
                    globalAIService = {
                        type: 'openai',
                        api: openaiAPI,
                        conversationHistory: []
                    };
                    console.log(`Switched to OpenAI service for model: ${model}`);
                } else {
                    throw new Error('OpenAI API key not found');
                }
            } catch (error) {
                console.error('Failed to switch to OpenAI service:', error.message);
                throw new Error('Failed to activate OpenAI service');
            }
        }
        console.log(`Using OpenAI model: ${model}`);
    }
    
    // If switching to Ollama model, ensure we're using the default service (or implement Ollama service switching)
    if (isValidOllamaModel) {
        console.log(`Switched to Ollama model: ${model}`);
        // Ollama uses the existing fetch-based approach, no service switching needed
    }
    
    globalAIConfig.model = model;
    return { success: true };
});

ipcMain.handle('ai-get-ollama-models', async () => {
    try {
        // Try IPv4 first, then fallback to localhost
        let response;
        try {
            response = await fetch('http://127.0.0.1:11434/api/tags');
        } catch (ipv4Error) {
            console.log('IPv4 connection failed, trying localhost:', ipv4Error.message);
            response = await fetch('http://localhost:11434/api/tags');
        }
        
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

// Handle opening external URLs with security validation
ipcMain.handle('open-external', async (event, url) => {
    const { shell } = require('electron');
    try {
        // Validate URL before opening
        const validatedURL = validateExternalURL(url);
        await shell.openExternal(validatedURL);
        logSecurityEvent('EXTERNAL_URL_OPENED', { url: validatedURL });
        return { success: true };
    } catch (error) {
        logSecurityEvent('EXTERNAL_URL_OPEN_FAILED', { url, error: error.message });
        console.error('Failed to open external URL:', error);
        return { success: false, error: error.message };
    }
});

// Check if Ollama is installed and attempt to start it
ipcMain.handle('ollama-check-and-start', async () => {
    const { spawn, exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    try {
        // First, check if Ollama is installed by trying to get its version
        let isInstalled = false;
        try {
            if (process.platform === 'win32') {
                await execAsync('ollama --version');
            } else {
                await execAsync('which ollama');
            }
            isInstalled = true;
            console.log('Ollama is installed');
        } catch (error) {
            console.log('Ollama not found in PATH');
        }
        
        if (!isInstalled) {
            return { 
                success: false, 
                installed: false, 
                message: 'Ollama is not installed on this system' 
            };
        }
        
        // If installed, try to start Ollama
        console.log('Ollama is installed, attempting to start...');
        
        try {
            // Use secure process spawning
            secureSpawnProcess('ollama', ['serve']);
            
            // Wait for Ollama to start with retry logic
            let retries = 0;
            const maxRetries = 6; // 6 retries over ~15 seconds
            
            while (retries < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 2500)); // Wait 2.5 seconds between attempts
                
                try {
                    // Try both IPv4 explicitly and localhost
                    let testResponse;
                    try {
                        testResponse = await fetch('http://127.0.0.1:11434/api/tags');
                    } catch (ipv4Error) {
                        console.log('IPv4 connection failed, trying localhost:', ipv4Error.message);
                        testResponse = await fetch('http://localhost:11434/api/tags');
                    }
                    
                    if (testResponse.ok) {
                        const data = await testResponse.json();
                        globalAIConfig.ollamaConnected = true;
                        globalAIConfig.model = 'ollama';
                        globalAIConfig.availableOllamaModels = data.models || [];
                        return { 
                            success: true, 
                            installed: true, 
                            started: true,
                            models: data.models || [],
                            message: 'Ollama started successfully' 
                        };
                    }
                } catch (testError) {
                    console.log(`Connection attempt ${retries + 1} failed:`, testError.message);
                }
                
                retries++;
            }
            
            return { 
                success: false, 
                installed: true, 
                started: false,
                message: 'Ollama is installed but failed to start automatically. Please try starting it manually with "ollama serve".' 
            };
        } catch (startError) {
            console.error('Failed to start Ollama:', startError);
            return { 
                success: false, 
                installed: true, 
                started: false,
                message: 'Ollama is installed but failed to start automatically' 
            };
        }
    } catch (error) {
        console.error('Error checking Ollama:', error);
        return { 
            success: false, 
            installed: false, 
            message: 'Error checking Ollama installation' 
        };
    }
});

// OpenAI message handler
async function sendToOpenAI(message) {
    if (!globalAIService || globalAIService.type !== 'openai') {
        throw new Error('OpenAI API not initialized');
    }

    try {
        // Check if this is an image generation request
        const isImageRequest = detectImageGenerationRequest(message);
        
        // Determine which model to use
        let model = 'gpt-4o-mini';
        if (globalAIConfig.model && globalAIConfig.model.startsWith('gpt-')) {
            model = globalAIConfig.model;
        }
        
        console.log('Using OpenAI model:', model, isImageRequest ? '(Image Generation)' : '(Text)');
        
        // Handle DALL-E model selection - always generate images
        if (model.startsWith('dall-e')) {
            console.log('DALL-E model selected, generating image');
            return await generateImageWithDALLE(message);
        }
        
        // Handle image generation requests for other models
        if (isImageRequest) {
            // Try GPT-4o image generation first (more natural)
            if (model === 'gpt-4o') {
                try {
                    const completion = await globalAIService.api.chat.completions.create({
                        model: model,
                        messages: [
                            {
                                role: 'user',
                                content: message
                            }
                        ],
                        max_tokens: 4000,
                        temperature: 0.7
                    });
                    
                    const responseContent = completion.choices[0].message?.content;
                    if (responseContent) {
                        return {
                            text: responseContent,
                            hasImages: false // GPT-4o will handle images in its response
                        };
                    }
                } catch (gpt4oError) {
                    console.log('GPT-4o image generation failed, falling back to DALL-E:', gpt4oError.message);
                }
            }
            
            // Fallback to DALL-E for dedicated image generation
            return await generateImageWithDALLE(message);
        }
        
        // Handle regular text completion
        const completion = await globalAIService.api.chat.completions.create({
            model: model,
            messages: [
                {
                    role: 'user',
                    content: message
                }
            ],
            max_tokens: 4000,
            temperature: 0.7,
            top_p: 0.9
        });
        
        // Ensure we have a valid response
        if (!completion.choices || completion.choices.length === 0) {
            throw new Error('No response from OpenAI API');
        }
        
        const responseContent = completion.choices[0].message?.content;
        if (!responseContent) {
            throw new Error('Empty response from OpenAI API');
        }
        
        return responseContent;
    } catch (error) {
        console.error('OpenAI API error:', error);
        
        // Handle specific OpenAI error types
        if (error.status) {
            switch (error.status) {
                case 401:
                    throw new Error('OpenAI API authentication failed. Please check your API key.');
                case 429:
                    throw new Error('OpenAI API rate limit exceeded. Please try again later.');
                case 500:
                    throw new Error('OpenAI API server error. Please try again later.');
                default:
                    throw new Error(`OpenAI API error (${error.status}): ${error.message}`);
            }
        }
        
        throw new Error(`OpenAI API error: ${error.message}`);
    }
}

// DALL-E image generation handler
async function generateImageWithDALLE(message) {
    if (!globalAIService || globalAIService.type !== 'openai') {
        throw new Error('OpenAI API not initialized');
    }

    try {
        // Extract image prompt from message
        const prompt = extractImagePrompt(message);
        console.log('Generating image with DALL-E, prompt:', prompt);
        
        const response = await globalAIService.api.images.generate({
            model: "dall-e-3", // Use DALL-E 3 for better quality
            prompt: prompt,
            n: 1,
            size: "1024x1024",
            quality: "standard", // or "hd" for higher quality
            response_format: "b64_json" // Get base64 data for consistent handling
        });
        
        if (!response.data || response.data.length === 0) {
            throw new Error('No image generated by DALL-E');
        }
        
        const imageData = response.data[0].b64_json;
        const revisedPrompt = response.data[0].revised_prompt;
        
        // Return in a format compatible with Gemini's image response format
        return {
            text: revisedPrompt ? `I generated an image based on: "${revisedPrompt}"` : 'Here\'s your generated image:',
            images: [{
                data: imageData,
                mimeType: 'image/png',
                alt: prompt
            }],
            hasImages: true
        };
        
    } catch (error) {
        console.error('DALL-E generation error:', error);
        
        // Handle specific DALL-E errors
        if (error.status) {
            switch (error.status) {
                case 400:
                    if (error.message?.includes('content_policy')) {
                        throw new Error('Image request violates OpenAI content policy. Please try a different prompt.');
                    }
                    throw new Error(`Invalid request: ${error.message}`);
                case 429:
                    throw new Error('OpenAI rate limit exceeded. Please try again later.');
                default:
                    throw new Error(`DALL-E error (${error.status}): ${error.message}`);
            }
        }
        
        throw new Error(`DALL-E generation failed: ${error.message}`);
    }
}

// Extract and clean image prompt from user message
function extractImagePrompt(message) {
    // Remove common image generation prefixes
    const cleanedMessage = message
        .replace(/^(generate|create|make|draw|paint|sketch|design)\s+(an?\s+)?(image|picture|photo|drawing|artwork|illustration)\s+(of\s+)?/i, '')
        .replace(/^(can\s+you\s+)?(please\s+)?(generate|create|make|draw|paint|sketch|design)\s+/i, '')
        .replace(/^(show\s+me\s+)/i, '')
        .trim();
    
    // If the cleaned message is too short, use the original
    if (cleanedMessage.length < 10) {
        return message;
    }
    
    // Ensure prompt is descriptive and within limits
    const prompt = cleanedMessage.length > 1000 ? cleanedMessage.substring(0, 1000) + '...' : cleanedMessage;
    
    return prompt;
}

// Gemini message handler
async function sendToGemini(message) {
    if (!globalAIService) {
        throw new Error('Gemini API not initialized');
    }

    try {
        // Check if this is an image generation request
        const isImageRequest = detectImageGenerationRequest(message);
        
        // Get current model info
        const currentModelName = globalAIConfig.model.startsWith('gemini-') ? globalAIConfig.model.replace('gemini-', '') : globalAIConfig.model;
        const currentModel = globalAIConfig.availableGeminiModels?.find(m => m.name === currentModelName || m.name === globalAIConfig.model);
        const supportsImageGeneration = currentModel?.capabilities?.includes('image-generation');
        
        let generationConfig = {};
        
        // Configure generation settings
        if (supportsImageGeneration) {
            // For image generation models, always enable image output
            generationConfig.responseModalities = ['Text', 'Image'];
        }
        
        // Configure safety settings
        const safetySettings = [
            {
                category: "HARM_CATEGORY_HARASSMENT",
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                category: "HARM_CATEGORY_HATE_SPEECH", 
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
            }
        ];

        // Use the proper content format
        const result = await globalAIService.model.generateContent({
            contents: [{
                parts: [{
                    text: message
                }]
            }],
            generationConfig: generationConfig,
            safetySettings: safetySettings
        });
        
        const response = await result.response;
        
        // Handle both text and image responses
        const candidates = response.candidates;
        if (candidates && candidates.length > 0) {
            const parts = candidates[0].content.parts;
            let responseText = '';
            let images = [];
            
            for (const part of parts) {
                if (part.text) {
                    responseText += part.text;
                } else if (part.inlineData) {
                    // Handle generated image
                    images.push({
                        data: part.inlineData.data,
                        mimeType: part.inlineData.mimeType
                    });
                }
            }
            
            // Check if this was an image generation model but no images were generated
            if (supportsImageGeneration && images.length === 0 && responseText.toLowerCase().includes('policy')) {
                const suggestions = getSafeImagePromptSuggestions();
                responseText += '\n\n💡 **Try these alternative prompts:**\n' +
                              suggestions.map(s => `• "${s}"`).join('\n');
            }
            
            // Return response with both text and images
            return {
                text: responseText,
                images: images,
                hasImages: images.length > 0
            };
        }
        
        // Fallback to text-only response
        return {
            text: response.text(),
            images: [],
            hasImages: false
        };
    } catch (error) {
        console.error('Gemini API error:', error);
        throw new Error(`Gemini API error: ${error.message}`);
    }
}

// Helper function to detect image generation requests
function detectImageGenerationRequest(message) {
    const imageKeywords = [
        // Direct image generation commands
        'generate image', 'create image', 'make image', 'generate an image', 'create an image',
        'generate picture', 'create picture', 'make picture', 'generate a picture', 'create a picture',
        'generate photo', 'create photo', 'make photo', 'generate a photo', 'create a photo',
        
        // Drawing and artistic commands
        'draw', 'paint', 'sketch', 'illustrate', 'design',
        'draw me', 'paint me', 'sketch me', 'illustrate a', 'design a',
        'make a drawing', 'create art', 'generate art', 'create artwork', 'make artwork',
        
        // Visual content requests
        'show me an image', 'show me a picture', 'show me a photo',
        'i want to see', 'i need an image', 'i need a picture',
        'visual representation', 'visual of', 'picture of',
        
        // Question-based requests
        'can you draw', 'can you create', 'can you generate', 'can you make',
        'could you draw', 'could you create', 'could you generate', 'could you make',
        'would you draw', 'would you create', 'would you generate', 'would you make',
        
        // DALL-E specific
        'dall-e', 'dalle', 'use dall-e', 'with dall-e'
    ];
    
    const lowerMessage = message.toLowerCase();
    
    // Check for direct keyword matches
    const hasImageKeyword = imageKeywords.some(keyword => lowerMessage.includes(keyword));
    
    // Check for image-related patterns
    const imagePatterns = [
        /\b(image|picture|photo|drawing|illustration|artwork|visual)\s+of\b/i,
        /\b(generate|create|make|draw|paint|sketch|design)\s+.*\b(image|picture|photo|drawing|illustration|artwork|visual)\b/i,
        /\bshow\s+me\s+.*\b(image|picture|photo|drawing|illustration|artwork|visual)\b/i
    ];
    
    const hasImagePattern = imagePatterns.some(pattern => pattern.test(message));
    
    return hasImageKeyword || hasImagePattern;
}

// Helper function to suggest alternative image prompts
function getSafeImagePromptSuggestions() {
    const suggestions = [
        "Create an abstract geometric pattern with vibrant colors",
        "Generate a serene mountain landscape at sunset", 
        "Draw a whimsical cartoon robot character",
        "Make a futuristic cityscape with neon lights",
        "Create a colorful mandala design with intricate patterns",
        "Generate a cosmic space scene with nebulas and stars",
        "Draw a magical fantasy castle on a floating island",
        "Make a retro-style poster with bold typography",
        "Create a minimalist logo design with clean lines",
        "Generate digital art with flowing watercolor effects",
        "Create an artistic interpretation of nature elements",
        "Draw a stylized portrait in pop art style",
        "Make a surreal dreamscape with floating objects",
        "Generate a geometric animal illustration",
        "Create a vintage travel poster design"
    ];
    
    // Return 3 random suggestions
    const shuffled = suggestions.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3);
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
        
        console.log('Using Ollama model:', model);
        
        // Try IPv4 first, then fallback to localhost
        let response;
        const requestBody = JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: message }],
            stream: false,
            options: {
                temperature: 0.7,
                top_p: 0.9
            }
        });
        
        try {
            response = await fetch('http://127.0.0.1:11434/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: requestBody
            });
        } catch (ipv4Error) {
            console.log('IPv4 connection failed, trying localhost:', ipv4Error.message);
            response = await fetch('http://localhost:11434/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: requestBody
            });
        }

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