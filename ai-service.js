const { GoogleGenerativeAI } = require('@google/generative-ai');

class AIService {
    constructor() {
        this.geminiAPI = null;
        this.geminiModel = null;
        this.ollamaEndpoint = 'http://localhost:11434';
        this.currentModel = 'gemini'; // 'gemini' or 'ollama'
        this.conversationHistory = [];
    }

    // Initialize Gemini API
    initializeGemini(apiKey) {
        try {
            this.geminiAPI = new GoogleGenerativeAI(apiKey);
            this.geminiModel = this.geminiAPI.getGenerativeModel({ model: "gemini-pro" });
            console.log('Gemini API initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize Gemini API:', error);
            return false;
        }
    }

    // Test Ollama connection
    async testOllamaConnection() {
        try {
            const response = await fetch(`${this.ollamaEndpoint}/api/tags`);
            if (response.ok) {
                const data = await response.json();
                console.log('Ollama connection successful, available models:', data.models);
                return true;
            } else {
                console.error('Ollama connection failed:', response.status);
                return false;
            }
        } catch (error) {
            console.error('Ollama connection error:', error);
            return false;
        }
    }

    // Send message to Gemini
    async sendToGemini(message) {
        if (!this.geminiModel) {
            throw new Error('Gemini API not initialized');
        }

        try {
            // Add user message to history
            this.conversationHistory.push({ role: 'user', content: message });

            // Create chat session
            const chat = this.geminiModel.startChat({
                history: this.conversationHistory.slice(0, -1), // Exclude current message
                generationConfig: {
                    maxOutputTokens: 1000,
                    temperature: 0.7,
                },
            });

            // Send message and get response
            const result = await chat.sendMessage(message);
            const response = await result.response;
            const responseText = response.text();

            // Add AI response to history
            this.conversationHistory.push({ role: 'model', content: responseText });

            return responseText;
        } catch (error) {
            console.error('Gemini API error:', error);
            throw new Error(`Gemini API error: ${error.message}`);
        }
    }

    // Send message to Ollama
    async sendToOllama(message, model = 'llama2') {
        try {
            // Add user message to history
            this.conversationHistory.push({ role: 'user', content: message });

            const requestBody = {
                model: model,
                messages: this.conversationHistory,
                stream: false
            };

            const response = await fetch(`${this.ollamaEndpoint}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const responseText = data.message.content;

            // Add AI response to history
            this.conversationHistory.push({ role: 'assistant', content: responseText });

            return responseText;
        } catch (error) {
            console.error('Ollama API error:', error);
            throw new Error(`Ollama API error: ${error.message}`);
        }
    }

    // Send message to current AI model
    async sendMessage(message) {
        if (this.currentModel === 'gemini') {
            return await this.sendToGemini(message);
        } else if (this.currentModel === 'ollama') {
            return await this.sendToOllama(message);
        } else {
            throw new Error('No AI model selected');
        }
    }

    // Switch AI model
    setModel(model) {
        this.currentModel = model;
        console.log(`Switched to ${model} model`);
    }

    // Clear conversation history
    clearHistory() {
        this.conversationHistory = [];
        console.log('Conversation history cleared');
    }

    // Get available Ollama models
    async getOllamaModels() {
        try {
            const response = await fetch(`${this.ollamaEndpoint}/api/tags`);
            if (response.ok) {
                const data = await response.json();
                return data.models.map(model => model.name);
            } else {
                throw new Error(`Failed to fetch models: ${response.status}`);
            }
        } catch (error) {
            console.error('Error fetching Ollama models:', error);
            return [];
        }
    }

    // Get current model status
    getStatus() {
        return {
            currentModel: this.currentModel,
            geminiInitialized: !!this.geminiModel,
            conversationLength: this.conversationHistory.length
        };
    }
}

module.exports = AIService; 