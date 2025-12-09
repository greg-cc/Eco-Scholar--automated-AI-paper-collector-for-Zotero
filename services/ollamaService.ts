
import { Paper, AIService, NetworkLog } from "../types";

export class OllamaService implements AIService {
  private baseUrl: string;
  private genModel: string;
  private embedModel: string;
  private onLog?: (log: NetworkLog) => void;

  constructor(baseUrl: string, genModel: string, embedModel: string, onLog?: (log: NetworkLog) => void) {
    // Ensure no trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.genModel = genModel;
    this.embedModel = embedModel;
    this.onLog = onLog;
  }

  private cleanThinkTags(text: string): string {
    if (!text) return "";

    // 1. Handle |im_sep| - Critical for OpenThinker style models.
    if (text.includes("|im_sep|")) {
      const parts = text.split("|im_sep|");
      return parts[parts.length - 1].trim();
    }
    
    // Handle the token variant <|im_sep|> just in case
    if (text.includes("<|im_sep|>")) {
      const parts = text.split("<|im_sep|>");
      return parts[parts.length - 1].trim();
    }

    // 2. Handle DeepSeek/Standard <think> blocks
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    
    // 3. Handle stray closing tags
    cleaned = cleaned.replace(/<\/think>/gi, '');

    return cleaned.trim();
  }

  /**
   * Generic fetch wrapper with robust error handling for CORS and Connectivity.
   * Supports STREAMING response updates.
   */
  private async fetchWithCORSCheck(url: string, options: { method: string, body?: any }, errorMessageContext: string, signal?: AbortSignal) {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const startTime = Date.now();
    
    // Log Request
    const path = url.replace(this.baseUrl, '');
    const reqBodyStr = options.body ? JSON.stringify(options.body, null, 2) : undefined;
    
    this.onLog?.({
        id: requestId,
        timestamp: startTime,
        source: 'Ollama',
        type: 'req',
        method: options.method,
        url: path,
        details: options.body ? `Payload: ${JSON.stringify(options.body).length} chars` : undefined,
        requestBody: reqBodyStr
    });

    const doFetch = async (targetUrl: string) => {
        // Surgical Fix: Do not send Content-Type for GET requests.
        const headers: Record<string, string> = {};
        if (options.body) {
            headers['Content-Type'] = 'application/json';
        }

        const fetchConfig: RequestInit = {
            method: options.method,
            headers: headers,
            signal,
            cache: 'no-store', // Surgical Fix: Force fresh network request
            mode: 'cors'
        };
        
        // STREAMING: Enable valid stream parsing
        if (options.body) {
            // Force stream: true in payload if not embedding
            if (!targetUrl.includes('embeddings')) {
               options.body.stream = true;
            }
            fetchConfig.body = JSON.stringify(options.body);
        }

        const response = await fetch(targetUrl, fetchConfig);
        
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Ollama Error (${response.status}): ${response.statusText} - ${errText}`);
        }

        // Handle JSON Response (Non-Streaming, e.g. Embeddings/Tags)
        if (!options.body?.stream) {
            const json = await response.json();
             this.onLog?.({
                id: requestId + '-res',
                timestamp: Date.now(),
                source: 'Ollama',
                type: 'res',
                method: options.method,
                url: path,
                status: response.status,
                duration: Date.now() - startTime,
                responseBody: JSON.stringify(json, null, 2)
            });
            return json;
        }

        // Handle Streaming Response
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Response body is not readable");

        const decoder = new TextDecoder();
        let fullResponseText = "";
        let accumulatedJson = "";
        
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                accumulatedJson += chunk;
                
                // Process lines (Ollama sends multiple JSON objects, one per line)
                const lines = accumulatedJson.split('\n');
                // Keep the last partial line in buffer
                accumulatedJson = lines.pop() || ""; 

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const parsed = JSON.parse(line);
                        // Standard generation response
                        if (parsed.response) {
                            fullResponseText += parsed.response;
                            
                            // Emit Update Log (Throttle if needed, but here we do granular updates for effect)
                            this.onLog?.({
                                id: requestId + '-res', // Use consistent ID for the Response Log
                                timestamp: Date.now(),
                                source: 'Ollama',
                                type: 'res',
                                method: options.method,
                                url: path,
                                status: 200,
                                duration: Date.now() - startTime,
                                responseBody: fullResponseText // Show growing text
                            });
                        }
                        if (parsed.done) {
                            // Final cleanup
                        }
                    } catch (e) {
                        // Partial JSON line, ignore
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        // Return a mock object compatible with previous non-stream logic
        return { response: fullResponseText };
    };

    try {
      return await doFetch(url);
    } catch (error: any) {
      // Log Failure
      this.onLog?.({
          id: requestId + '-err',
          timestamp: Date.now(),
          source: 'Ollama',
          type: 'err',
          method: options.method,
          url: path,
          duration: Date.now() - startTime,
          details: error.message
      });

      if (error.name === 'AbortError') {
          throw error; 
      }

      // 1. Automatic Fallback: Try 127.0.0.1 if localhost failed
      // Chrome treats localhost and 127.0.0.1 distinctively for CORS/Mixed Content
      if (url.includes('localhost')) {
          try {
              const fallbackUrl = url.replace('localhost', '127.0.0.1');
              console.warn(`[Ollama] 'localhost' failed. Retrying with '127.0.0.1': ${fallbackUrl}`);
              
              // Log Retry
              this.onLog?.({
                id: requestId + '-retry',
                timestamp: Date.now(),
                source: 'Ollama',
                type: 'req',
                method: options.method,
                url: path + ' (Retry 127.0.0.1)',
              });

              return await doFetch(fallbackUrl);
          } catch (retryError: any) {
              // Fallback failed, proceed to diagnostics below
          }
      }

      console.error(`${errorMessageContext}:`, error);
      
      // 2. DIAGNOSTIC: Check if server is up but blocking CORS
      // We try a 'no-cors' request to the root. If it doesn't throw, the server is reachable.
      try {
          const rootUrl = new URL(url).origin;
          await fetch(rootUrl, { mode: 'no-cors', signal });
          
          // If we reached here, the server IS UP, but the previous request failed (likely CORS)
          throw new Error(
             `Connection blocked by CORS.\n` +
             `Ollama is running, but rejected the request origin.\n` +
             `Fix: Set OLLAMA_ORIGINS="*" env var and restart Ollama.`
          );
      } catch (diagnosticError: any) {
          // If the diagnostic error is the one we just threw, rethrow it
          if (diagnosticError.message.includes('Connection blocked by CORS')) {
              throw diagnosticError;
          }
          // If this diagnostic fetch ALSO failed (e.g. TypeError: Failed to fetch), 
          // it usually means the server is down OR Mixed Content blocked it.
      }

      // 3. Mixed Content Check (HTTPS -> HTTP)
      if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http:')) {
            throw new Error(
            `Security Error: Mixed Content.\n` +
            `You are using HTTPS but Ollama is HTTP.\n` +
            `Browsers block this. Run this app on HTTP or use a proxy.`
            );
      }

      // 4. General Connection Error
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
         throw new Error(
            `Connection failed.\n` +
            `Could not connect to Ollama at ${this.baseUrl}.\n` +
            `Ensure 'ollama serve' is running.`
         );
      }

      throw error;
    }
  }

  /**
   * Pings the server and retrieves available models.
   * Used for the "Test" button.
   */
  async listModels(signal?: AbortSignal): Promise<any[]> {
      const data = await this.fetchWithCORSCheck(
          `${this.baseUrl}/api/tags`,
          { method: 'GET' },
          "Ollama List Models Error",
          signal
      );
      return data.models || [];
  }

  async getEmbedding(text: string, signal?: AbortSignal): Promise<number[] | null> {
    if (!text) return null;
    
    try {
      const data = await this.fetchWithCORSCheck(
        `${this.baseUrl}/api/embeddings`,
        { 
            method: 'POST',
            body: { model: this.embedModel, prompt: text }
        },
        "Ollama Embedding Error",
        signal
      );
      return data.embedding || null;
    } catch (error) {
       // Propagate error for the UI to display
       throw error;
    }
  }

  async generateAbstract(title: string, authors: string[], fullText?: string, signal?: AbortSignal): Promise<string> {
    try {
      const isOpenThinker = this.genModel.includes('openthinker');
      let prompt = "";

      if (fullText && fullText.length > 500) {
          prompt = `Summarize the following academic text into a concise abstract. TEXT SOURCE: ${fullText.slice(0, 15000)}`;
      } else {
          prompt = `Generate a 3-sentence abstract for this paper based on metadata. Title: ${title} Authors: ${authors.join(", ")} Output ONLY text.`;
      }
      
      let finalPrompt = prompt;
      if (isOpenThinker) {
          finalPrompt = `<|im_start|>user\n${prompt}<|im_end|>\n<|im_start|>assistant\n`;
      }

      const data = await this.fetchWithCORSCheck(
        `${this.baseUrl}/api/generate`,
        {
          method: 'POST',
          body: {
            model: this.genModel,
            prompt: finalPrompt,
            stream: true // Enable streaming
          }
        },
        "Ollama Abstract Gen Error",
        signal
      );
      
      return this.cleanThinkTags(data.response || "Abstract generation failed.");
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
      return "Abstract generation failed.";
    }
  }

  async analyzePaper(paper: Paper, gradingTopics: string[], signal?: AbortSignal): Promise<{ 
      qualified: boolean; 
      score: number; 
      summary: string; 
      tags: string[];
      phytochemicals: string;
      plants: string;
      possible_plants: string;
      probability: number;
  }> {
    try {
      const topicsStr = gradingTopics.length > 0 ? gradingTopics.join(", ") : "Phytochemicals, Herbal Medicine, Natural Extracts";
      const isOpenThinker = this.genModel.includes('openthinker');

      // TIGHTER PROMPT: Enforces strict JSON, stop tokens, and no preamble.
      // Based on User feedback to prevent hallucinations by closing the abstract context.
      const coreInstructions = `
        Analyze the following scientific paper and return valid JSON.
        
        PAPER DATA
        Title: ${paper.title}
        Abstract: ${paper.abstract}

        CRITERIA
        The paper must be highly relevant to: ${topicsStr}

        REQUIRED JSON FORMAT
        {
            "score": 0, // 0-10 Relevance
            "qualified": false, // boolean
            "summary": "Markdown bullets: Mechanistic Insight, Evidence Gap, Clinical Relevance",
            "tags": ["tag1", "tag2"],
            "phytochemicals": "List or 'None'",
            "plants": "List or 'None'",
            "possible_plants": "List or 'None'",
            "probability": 0 // 0-10 Novelty
        }
        
        Respond with JSON only. No markdown formatting. No conversational text.
      `;

      let finalPrompt = coreInstructions;
      if (isOpenThinker) {
          // OpenThinker / DeepSeek template
          finalPrompt = `<|im_start|>system
You are a research analysis engine. You output strict JSON only.
<|im_end|>
<|im_start|>user
${coreInstructions}
<|im_end|>
<|im_start|>assistant
`;
      }

      const data = await this.fetchWithCORSCheck(
        `${this.baseUrl}/api/generate`,
        {
          method: 'POST',
          body: {
            model: this.genModel,
            prompt: finalPrompt,
            format: "json",
            stream: true, // STREAMING ENABLED to capture thought process in logs
            options: { 
                stop: ["<|im_end|>", "<|endoftext|>", "</s>"] // Hard stops to prevent hallucination
            }
          }
        },
        "Ollama Analysis Error",
        signal
      );

      const cleanedResponse = this.cleanThinkTags(data.response);
      const jsonText = cleanedResponse.replace(/```json|```/g, '').trim();

      let json;
      try {
        json = JSON.parse(jsonText);
      } catch (e) {
          throw new Error("Failed to parse JSON response: " + jsonText.substring(0, 50) + "...");
      }

      // SAFE CASTING HELPER: Ensures we always work with strings, even if AI returns arrays/numbers
      const safeString = (val: any): string => {
         if (val === null || val === undefined) return "None";
         if (typeof val === 'string') return val;
         if (Array.isArray(val)) return val.join(", "); // Convert ["A", "B"] to "A, B"
         return String(val); // Convert numbers/bools to string
      };

      const phytoStr = safeString(json.phytochemicals);
      const plantsStr = safeString(json.plants);
      const possibleStr = safeString(json.possible_plants);
      
      // LOGIC FIX:
      // 1. Clamp score to 10 max to prevent UI glitching
      // 2. If score is high (>=6), FORCE qualified to true, overcoming AI boolean hallucination
      const rawScore = json.score ?? 0;
      const clampedScore = Math.min(rawScore, 10);
      const aiQualified = !!json.qualified;
      
      const isQualified = aiQualified || (rawScore >= 6);

      return {
        qualified: isQualified, 
        score: clampedScore,
        summary: safeString(json.summary),
        tags: Array.isArray(json.tags) ? json.tags : [],
        phytochemicals: phytoStr,
        plants: plantsStr,
        possible_plants: possibleStr,
        probability: json.probability ?? 0
      };

    } catch (e) {
       if ((e as Error).name === 'AbortError') throw e;
       console.error("Ollama Analysis failed", e);
       return { 
           qualified: false, score: 0, summary: `Error: ${(e as Error).message}`, tags: [],
           phytochemicals: "Error", plants: "Error", possible_plants: "Error", probability: 0
       };
    }
  }
}