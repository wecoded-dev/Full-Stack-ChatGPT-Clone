import axios from 'axios';
import { Configuration, OpenAIApi } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import Cohere from 'cohere-ai';
import { HfInference } from '@huggingface/inference';

class UltraAIService {
  constructor() {
    this.providers = {
      openai: this.setupOpenAI(),
      anthropic: this.setupAnthropic(),
      cohere: this.setupCohere(),
      huggingface: this.setupHuggingFace(),
      local: this.setupLocal()
    };

    this.availableModels = {
      openai: [
        'gpt-4',
        'gpt-4-32k',
        'gpt-4-turbo-preview',
        'gpt-3.5-turbo',
        'gpt-3.5-turbo-16k',
        'gpt-4-vision-preview'
      ],
      anthropic: [
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-2.1',
        'claude-instant-1.2'
      ],
      cohere: [
        'command',
        'command-nightly',
        'command-light',
        'command-light-nightly'
      ],
      huggingface: [
        'mistralai/Mistral-7B-Instruct-v0.2',
        'google/flan-t5-xxl',
        'microsoft/DialoGPT-large'
      ]
    };

    this.defaultSettings = {
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 2000,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
      stream: true
    };
  }

  setupOpenAI() {
    return new OpenAIApi(new Configuration({
      apiKey: process.env.OPENAI_API_KEY
    }));
  }

  setupAnthropic() {
    return new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  setupCohere() {
    Cohere.init(process.env.COHERE_API_KEY);
    return Cohere;
  }

  setupHuggingFace() {
    return new HfInference(process.env.HUGGINGFACE_API_KEY);
  }

  setupLocal() {
    // Local model setup (Ollama, LocalAI, etc.)
    return {
      baseURL: process.env.LOCAL_AI_URL || 'http://localhost:11434'
    };
  }

  async generateResponse(messages, settings = {}) {
    const finalSettings = { ...this.defaultSettings, ...settings };
    const provider = finalSettings.provider;

    try {
      switch (provider) {
        case 'openai':
          return await this.openAIRequest(messages, finalSettings);
        case 'anthropic':
          return await this.anthropicRequest(messages, finalSettings);
        case 'cohere':
          return await this.cohereRequest(messages, finalSettings);
        case 'huggingface':
          return await this.huggingFaceRequest(messages, finalSettings);
        case 'local':
          return await this.localRequest(messages, finalSettings);
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }
    } catch (error) {
      console.error(`AI Service Error (${provider}):`, error);
      throw this.handleProviderError(error, provider);
    }
  }

  async openAIRequest(messages, settings) {
    const response = await this.providers.openai.createChatCompletion({
      model: settings.model,
      messages: this.formatMessagesForOpenAI(messages),
      temperature: settings.temperature,
      max_tokens: settings.maxTokens,
      top_p: settings.topP,
      frequency_penalty: settings.frequencyPenalty,
      presence_penalty: settings.presencePenalty,
      stream: false
    });

    return {
      content: response.data.choices[0].message.content,
      tokens: response.data.usage.total_tokens,
      model: response.data.model,
      finishReason: response.data.choices[0].finish_reason
    };
  }

  async anthropicRequest(messages, settings) {
    const response = await this.providers.anthropic.messages.create({
      model: settings.model,
      messages: this.formatMessagesForAnthropic(messages),
      temperature: settings.temperature,
      max_tokens: settings.maxTokens,
      top_p: settings.topP
    });

    return {
      content: response.content[0].text,
      tokens: response.usage.input_tokens + response.usage.output_tokens,
      model: response.model,
      finishReason: response.stop_reason
    };
  }

  async streamResponse(messages, settings, callbacks) {
    const { onChunk, onComplete, onError } = callbacks;
    const provider = settings.provider || this.defaultSettings.provider;

    try {
      switch (provider) {
        case 'openai':
          await this.openAIStream(messages, settings, callbacks);
          break;
        case 'anthropic':
          await this.anthropicStream(messages, settings, callbacks);
          break;
        default:
          throw new Error(`Streaming not supported for provider: ${provider}`);
      }
    } catch (error) {
      onError(error);
    }
  }

  async openAIStream(messages, settings, { onChunk, onComplete, onError }) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...settings,
          messages: this.formatMessagesForOpenAI(messages),
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine === '' || trimmedLine === 'data: [DONE]') {
            onComplete();
            return;
          }

          if (trimmedLine.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmedLine.slice(6));
              const chunk = data.choices[0]?.delta?.content;
              
              if (chunk) {
                onChunk(chunk);
              }
            } catch (e) {
              console.error('Error parsing stream data:', e);
            }
          }
        }
      }
    } catch (error) {
      onError(error);
    }
  }

  // Advanced features
  async analyzeSentiment(text) {
    try {
      const response = await this.providers.huggingface.textClassification({
        model: 'cardiffnlp/twitter-roberta-base-sentiment-latest',
        inputs: text
      });
      return response[0];
    } catch (error) {
      console.error('Sentiment analysis failed:', error);
      return null;
    }
  }

  async summarizeText(text, maxLength = 150) {
    try {
      const response = await this.providers.huggingface.summarization({
        model: 'facebook/bart-large-cnn',
        inputs: text,
        parameters: {
          max_length: maxLength,
          min_length: 30,
          do_sample: false
        }
      });
      return response[0].summary_text;
    } catch (error) {
      console.error('Text summarization failed:', error);
      return null;
    }
  }

  async translateText(text, targetLanguage) {
    try {
      const response = await this.providers.huggingface.translation({
        model: 'Helsinki-NLP/opus-mt-en-' + targetLanguage,
        inputs: text
      });
      return response[0].translation_text;
    } catch (error) {
      console.error('Translation failed:', error);
      return null;
    }
  }

  async generateImage(prompt, settings = {}) {
    try {
      const response = await this.providers.openai.createImage({
        prompt: prompt,
        n: settings.n || 1,
        size: settings.size || '1024x1024',
        quality: settings.quality || 'standard',
        style: settings.style || 'vivid'
      });
      return response.data.data[0].url;
    } catch (error) {
      console.error('Image generation failed:', error);
      throw error;
    }
  }

  async speechToText(audioBuffer, language = 'en') {
    try {
      const response = await this.providers.openai.createTranscription(
        audioBuffer,
        'whisper-1',
        undefined,
        'json',
        0,
        language
      );
      return response.data.text;
    } catch (error) {
      console.error('Speech to text failed:', error);
      throw error;
    }
  }

  async textToSpeech(text, voice = 'alloy') {
    try {
      const response = await this.providers.openai.createSpeech({
        model: 'tts-1',
        voice: voice,
        input: text,
        speed: 1.0
      });
      return response.data;
    } catch (error) {
      console.error('Text to speech failed:', error);
      throw error;
    }
  }

  // Utility methods
  formatMessagesForOpenAI(messages) {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  }

  formatMessagesForAnthropic(messages) {
    return messages.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    }));
  }

  handleProviderError(error, provider) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      switch (status) {
        case 401:
          return new Error(`Invalid ${provider} API key`);
        case 429:
          return new Error('Rate limit exceeded. Please try again later.');
        case 500:
          return new Error(`${provider} server error. Please try again.`);
        case 503:
          return new Error(`${provider} service unavailable. Please try again later.`);
        default:
          return new Error(`${provider} error: ${data.error?.message || error.message}`);
      }
    } else if (error.request) {
      return new Error(`No response received from ${provider}. Please check your connection.`);
    } else {
      return new Error(`Error configuring ${provider} request: ${error.message}`);
    }
  }

  estimateTokens(text) {
    // Improved token estimation
    const words = text.split(/\s+/).length;
    const characters = text.length;
    return Math.ceil((words * 1.3 + characters / 4) / 2);
  }

  getAvailableModels(provider = null) {
    if (provider) {
      return this.availableModels[provider] || [];
    }
    return this.availableModels;
  }

  validateSettings(settings) {
    const errors = [];
    
    if (settings.temperature && (settings.temperature < 0 || settings.temperature > 2)) {
      errors.push('Temperature must be between 0 and 2');
    }
    
    if (settings.maxTokens && (settings.maxTokens < 1 || settings.maxTokens > 400000)) {
      errors.push('Max tokens must be between 1 and 400,000');
    }
    
    if (settings.model) {
      const provider = settings.provider || this.defaultSettings.provider;
      const models = this.availableModels[provider];
      if (models && !models.includes(settings.model)) {
        errors.push(`Model must be one of: ${models.join(', ')}`);
      }
    }

    return errors;
  }

  // Cost estimation
  estimateCost(provider, model, inputTokens, outputTokens) {
    const costRates = {
      openai: {
        'gpt-4': { input: 0.03, output: 0.06 },
        'gpt-4-32k': { input: 0.06, output: 0.12 },
        'gpt-3.5-turbo': { input: 0.0015, output: 0.002 },
        'gpt-3.5-turbo-16k': { input: 0.003, output: 0.004 }
      },
      anthropic: {
        'claude-3-opus': { input: 0.015, output: 0.075 },
        'claude-3-sonnet': { input: 0.003, output: 0.015 },
        'claude-2.1': { input: 0.008, output: 0.024 }
      }
    };

    const rates = costRates[provider]?.[model];
    if (!rates) return 0;

    const inputCost = (inputTokens / 1000) * rates.input;
    const outputCost = (outputTokens / 1000) * rates.output;
    
    return inputCost + outputCost;
  }
}

export default new UltraAIService();
