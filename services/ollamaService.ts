
import { Paper, AIService, NetworkLog } from "../types";

export class OllamaService implements AIService {
  private baseUrl: string;
  private genModel: string;
  private embedModel: string;
  private onLog?: (log: NetworkLog) => void;

  constructor(baseUrl: string, genModel: string, embedModel: string, onLog?: (log: NetworkLog) => void) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.genModel = genModel;
    this.embedModel = embedModel;
    this.onLog = onLog;
  }

  private cleanThinkTags(text: string): string {
    if (!text) return "";
    let cleaned = text;
    if (cleaned.includes("|im_sep|")) cleaned = cleaned.split("|im_sep|").pop() || "";
    if (cleaned.includes("<|im_sep|>")) cleaned = cleaned.split("<|im_sep|>").pop() || "";
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
    cleaned = cleaned.replace(/<\/think>/gi, '');
    return cleaned.trim();
  }

  private async monitoredFetch(url: string, options: RequestInit): Promise<Response> {
    const requestId = `oll-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const startTime = Date.now();
    const method = options.method || 'GET';
    const path = url.replace(this.baseUrl, '');

    // 1. Log Request
    this.onLog?.({
        id: requestId,
        timestamp: startTime,
        source: 'Ollama',
        type: 'req',
        method: method,
        url: path,
        requestBody: options.body as string
    });

    try {
        const response = await fetch(url, options);

        // 2. Log Response
        const clone = response.clone();
        const resText = await clone.text();
        
        let resBodyStr = resText;
        try {
           const parsed = JSON.parse(resText);
           if (parsed.embedding) parsed.embedding = `[Array(${parsed.embedding.length})]`;
           resBodyStr = JSON.stringify(parsed, null, 2);
        } catch(e) {}

        this.onLog?.({
          id: requestId + '-res',
          timestamp: Date.now(),
          source: 'Ollama',
          type: 'res',
          method: method,
          url: path,
          status: response.status,
          duration: Date.now() - startTime,
          responseBody: resBodyStr
        });

        return response;
    } catch (e: any) {
         // 3. Log Error
         this.onLog?.({
          id: requestId + '-err',
          timestamp: Date.now(),
          source: 'Ollama',
          type: 'err',
          method: method,
          url: path,
          duration: Date.now() - startTime,
          details: e.message
        });
        throw e;
    }
  }

  private async fetchWithRetry(
    url: string, 
    options: RequestInit & { body?: string }, 
    signal?: AbortSignal
  ): Promise<any> {
    const MAX_RETRIES = 3;
    let attempt = 0;
    
    const fetchOptions: RequestInit = {
        ...options,
        body: options.body, 
        signal,
        mode: 'cors'
    };

    while (attempt < MAX_RETRIES) {
        try {
            attempt++;
            const res = await this.monitoredFetch(url, fetchOptions);
            if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
            return res;
        } catch (e: any) {
            if (e.name === 'AbortError') throw e;
            console.warn(`Ollama Req Failed (Attempt ${attempt}):`, e);
            if (attempt >= MAX_RETRIES) throw e;
            await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }
  }

  async getEmbedding(text: string, signal?: AbortSignal): Promise<number[] | null> {
    if (!text) return null;
    try {
      const res = await this.fetchWithRetry(
        `${this.baseUrl}/api/embeddings`,
        { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: this.embedModel, prompt: text })
        },
        signal
      );
      const data = await res.json();
      return data.embedding || data.embeddings || null;
    } catch (error) {
       console.error("Embedding Error:", error);
       return null;
    }
  }

  async generateAbstract(title: string, authors: string[], fullText?: string, signal?: AbortSignal): Promise<string> {
    try {
      const prompt = fullText && fullText.length > 500 
        ? `Summarize this text: ${fullText.slice(0, 15000)}` 
        : `Summarize paper: ${title} by ${authors.join(", ")}`;

      const res = await this.fetchWithRetry(
        `${this.baseUrl}/api/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.genModel,
            prompt: prompt,
            stream: false
          })
        },
        signal
      );
      
      const data = await res.json();
      return this.cleanThinkTags(data.response || "Failed.");
    } catch (e) {
      return "Generation failed.";
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
    const topicsStr = gradingTopics.length > 0 ? gradingTopics.join(", ") : "Phytochemicals";
    
    // Explicitly requesting 0-10 integer in prompt
    const promptText = `
        Analyze the following scientific paper and return valid JSON.
        
        PAPER DATA
        Title: ${paper.title}
        Abstract: ${paper.abstract}

        CRITERIA: Evaluate relevance to: ${topicsStr}
        
        REQUIRED JSON FORMAT
        {
            "score": 0, 
            "qualified": false, 
            "summary": "Summary text",
            "tags": ["tag1"],
            "phytochemicals": "List or 'None'",
            "plants": "List or 'None'",
            "possible_plants": "List or 'None'",
            "probability": 0 
        }

        IMPORTANT: 'score' and 'probability' must be integers between 0 and 10.
    `;

    const finalPrompt = this.genModel.includes('openthinker') 
        ? `<|im_start|>system\nOutput strict JSON.\n<|im_end|>\n<|im_start|>user\n${promptText}\n<|im_end|>\n<|im_start|>assistant\n`
        : promptText;

    try {
        const res = await this.fetchWithRetry(
            `${this.baseUrl}/api/generate`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.genModel,
                    prompt: finalPrompt,
                    format: "json",
                    stream: false,
                    options: { stop: ["<|im_end|>", "<|endoftext|>"] }
                })
            },
            signal
        );

        const data = await res.json();
        let cleaned = this.cleanThinkTags(data.response);
        
        const firstOpen = cleaned.indexOf('{');
        const lastClose = cleaned.lastIndexOf('}');
        if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
            cleaned = cleaned.substring(firstOpen, lastClose + 1);
        }

        const json = JSON.parse(cleaned);
        const safeStr = (v: any) => Array.isArray(v) ? v.join(", ") : (v || "None");
        
        // CORRECTION LOGIC: Ensure 0-10 scale
        let score = json.score || 0;
        let prob = json.probability || 0;

        // If AI returns 0.8, scale to 8. If 0.9, scale to 9.
        if (score > 0 && score <= 1) score = Math.round(score * 10);
        if (prob > 0 && prob <= 1) prob = Math.round(prob * 10);
        
        // Cap at 10
        score = Math.min(score, 10);
        prob = Math.min(prob, 10);

        const isQualified = !!json.qualified || score >= 5 || prob >= 5;

        return {
            qualified: isQualified,
            score: score,
            summary: safeStr(json.summary),
            tags: Array.isArray(json.tags) ? json.tags : [],
            phytochemicals: safeStr(json.phytochemicals),
            plants: safeStr(json.plants),
            possible_plants: safeStr(json.possible_plants),
            probability: prob
        };

    } catch (e: any) {
        if (e.name === 'AbortError') throw e;
        console.error("Analysis Failed:", e);
        return {
            qualified: false, score: 0, summary: `Error: ${e.message}`, tags: [],
            phytochemicals: "Error", plants: "Error", possible_plants: "Error", probability: 0
        };
    }
  }
  
  async listModels(signal?: AbortSignal): Promise<any[]> {
      try {
        const res = await fetch(`${this.baseUrl}/api/tags`, { signal });
        const data = await res.json();
        return data.models || [];
      } catch { return []; }
  }
}
