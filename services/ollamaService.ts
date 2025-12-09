
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
   * Supports STREAMING response updates and RETRY LOGIC (3 mins, 10s interval).
   * Now supports VALIDATION callback to retry on valid HTTP 200 but invalid JSON data.
   */
  private async fetchWithCORSCheck(
      url: string, 
      options: { method: string, body?: any }, 
      errorMessageContext: string, 
      signal?: AbortSignal,
      validate?: (json: any) => boolean
  ) {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const startTime = Date.now();
    
    // Retry Configuration
    const MAX_DURATION = 3 * 60 * 1000; // 3 minutes
    const RETRY_INTERVAL = 10000; // 10 seconds

    // Log Request (Initial)
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

    // The core fetch logic
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
            
            // VALIDATION: Ensure response contains expected data (e.g. "embedding")
            if (validate && !validate(json)) {
                throw new Error("Response validation failed: Missing expected data fields.");
            }

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

    // --- RETRY LOOP ---
    let attempt = 0;
    while (true) {
        attempt++;
        try {
            return await doFetch(url);
        } catch (error: any) {
             // 1. Abort Check (Stop immediately)
             if (error.name === 'AbortError') {
                 this.onLog?.({
                    id: requestId + '-abort',
                    timestamp: Date.now(),
                    source: 'Ollama',
                    type: 'err',
                    method: options.method,
                    url: path,
                    duration: Date.now() - startTime,
                    details: 'Request aborted by user'
                });
                throw error; 
             }

             // 2. Automatic Fallback: Try 127.0.0.1 if localhost failed
             if (url.includes('localhost')) {
                try {
                    const fallbackUrl = url.replace('localhost', '127.0.0.1');
                    console.warn(`[Ollama] 'localhost' failed. Retrying with '127.0.0.1': ${fallbackUrl}`);
                    
                    // Log the fallback attempt inside this loop iteration
                    return await doFetch(fallbackUrl);
                } catch (retryError: any) {
                    // Fallback failed, continue to standard retry logic below
                }
             }
             
             // 3. Check if Time Limit Exceeded
             const elapsed = Date.now() - startTime;
             if (elapsed > MAX_DURATION) {
                 // Log Final Failure
                this.onLog?.({
                    id: requestId + '-err-final',
                    timestamp: Date.now(),
                    source: 'Ollama',
                    type: 'err',
                    method: options.method,
                    url: path,
                    duration: elapsed,
                    details: `Max retry duration (3m) exceeded. Last error: ${error.message}`
                });

                // Final Diagnostics to throw a helpful error
                try {
                    const rootUrl = new URL(url).origin;
                    await fetch(rootUrl, { mode: 'no-cors', signal });
                    throw new Error(`Connection blocked by CORS.\nOllama is running, but blocked.\nFix: Set OLLAMA_ORIGINS="*" env var.`);
                } catch (diagErr: any) {
                    if (diagErr.message.includes('CORS')) throw diagErr;
                }
                if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http:')) {
                        throw new Error(`Security Error: Mixed Content (HTTPS -> HTTP).`);
                }
                if (error instanceof TypeError && error.message === 'Failed to fetch') {
                    throw new Error(`Connection failed after 3 minutes.\nCould not connect to ${this.baseUrl}.\nEnsure 'ollama serve' is running.`);
                }

                throw new Error(`${errorMessageContext}: ${error.message}`);
             }

             // 4. Wait & Retry
             const remaining = Math.round((MAX_DURATION - elapsed) / 1000);
             console.warn(`[Ollama] Connection failed. Retrying in 10s... (Attempt ${attempt}, ${remaining}s left). Error: ${error.message}`);
             
             this.onLog?.({
                id: requestId + `-retry-${attempt}`,
                timestamp: Date.now(),
                source: 'Ollama',
                type: 'err',
                method: options.method,
                url: path,
                duration: elapsed,
                details: `Connection failed. Retrying in 10s... Error: ${error.message}`
             });

             await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
             
             // Check signal again after waiting
             if (signal?.aborted) {
                  throw new DOMException('Aborted', 'AbortError');
             }
        }
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
          signal,
          (json) => !!json.models // Validator: ensure 'models' key exists
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
        signal,
        // Validator: ensure 'embedding' key exists (some versions/models might return empty bodies on failure)
        (json) => !!json.embedding || !!json.embeddings
      );
      return data.embedding || data.embeddings || null;
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
    const topicsStr = gradingTopics.length > 0 ? gradingTopics.join(", ") : "Phytochemicals, Herbal Medicine, Natural Extracts";

    // --- Helper to execute a single inference run ---
    const runInference = async (promptText: string) => {
        const isOpenThinker = this.genModel.includes('openthinker');
        let finalPrompt = promptText;
        if (isOpenThinker) {
            finalPrompt = `<|im_start|>system\nYou are a research analysis engine. Output strict JSON.\n<|im_end|>\n<|im_start|>user\n${promptText}\n<|im_end|>\n<|im_start|>assistant\n`;
        }

        const data = await this.fetchWithCORSCheck(
            `${this.baseUrl}/api/generate`,
            {
                method: 'POST',
                body: {
                    model: this.genModel,
                    prompt: finalPrompt,
                    format: "json",
                    stream: true,
                    options: { 
                        stop: ["<|im_end|>", "<|endoftext|>", "</s>"]
                    }
                }
            },
            "Ollama Analysis Error",
            signal
        );

        const cleanedResponse = this.cleanThinkTags(data.response);
        const jsonText = cleanedResponse.replace(/```json|```/g, '').trim();
        return JSON.parse(jsonText);
    };

    // --- Prompt Builder ---
    const buildPrompt = (isRetry: boolean = false) => {
        let prompt = `
        Analyze the following scientific paper and return valid JSON.
        
        PAPER DATA
        Title: ${paper.title}
        Abstract: ${paper.abstract}

        CRITERIA
        The paper has passed semantic pre-screening and MUST be evaluated for relevance to: ${topicsStr}
        
        SCORING GUIDELINES
        - "score": Overall relevance to the topics (0-10).
        - "probability": DISCOVERY PROBABILITY (0-10).
           - 0: FALSE POSITIVE. Completely irrelevant (e.g. software, administration, geology).
           - 1-4: General Mention/Review.
           - 5-10: RELEVANT. Specific plants/compounds mentioned in a medical/biological context.
           
        IMPORTANT: If the abstract mentions specific plants, extracts, or phytochemicals being tested or discussed, 'probability' MUST be at least 5. Do not rate as 0 if keywords are present.

        REQUIRED JSON FORMAT
        {
            "score": 0, 
            "qualified": false, 
            "summary": "Markdown bullets: Mechanistic Insight, Evidence Gap, Clinical Relevance",
            "tags": ["tag1", "tag2"],
            "phytochemicals": "List or 'None'",
            "plants": "List or 'None'",
            "possible_plants": "List or 'None'",
            "probability": 0 
        }
        
        Respond with JSON only.
        `;

        if (isRetry) {
            prompt += `\n\nCRITICAL CORRECTION: You previously assigned a probability of 0 to this paper. This paper passed semantic pre-filters. Please re-read the abstract carefully. If ANY of the target topics are mentioned, the probability CANNOT be 0. Assign a score of at least 5 if specific compounds are named.`;
        }
        
        return prompt;
    };

    try {
      // 1. Initial Attempt
      let json = await runInference(buildPrompt(false));

      // 2. Retry Logic: If Score is 0, it might be a hallucination/error given pre-filtering passed
      if (json.probability === 0) {
          console.log(`[Ollama] Paper '${paper.title.substring(0,20)}...' got 0 probability. Retrying with correction...`);
          try {
              const retryJson = await runInference(buildPrompt(true));
              // Only accept retry if it actually found something positive
              if (retryJson.probability > 0) {
                  console.log(`[Ollama] Retry successful. Score adjusted to ${retryJson.probability}.`);
                  json = retryJson;
              } else {
                  console.log(`[Ollama] Retry confirmed 0 probability.`);
              }
          } catch (retryErr) {
              console.warn("Retry failed, using original result", retryErr);
          }
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
