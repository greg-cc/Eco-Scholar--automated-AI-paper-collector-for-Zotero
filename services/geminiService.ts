
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { Paper, AIService } from "../types";

export class GeminiService implements AIService {
  private client: GoogleGenAI;
  private modelId: string;

  constructor(apiKey: string, modelId: string = "gemini-2.0-flash") {
    this.client = new GoogleGenAI({ apiKey });
    this.modelId = modelId;
  }

  private cleanThinkTags(text: string): string {
    if (!text) return "";
    // Remove <think>...</think> blocks and trim
    return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  }

  /**
   * Executes a function with exponential backoff retry logic.
   * Handles 429 (Too Many Requests) and 503 (Service Unavailable).
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>, 
    maxRetries: number = 3, 
    initialDelay: number = 2000
  ): Promise<T> {
    let lastError: any;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // Check for common Rate Limit or Overload patterns in the error object
        const isRateLimit = 
            error?.status === 429 || 
            error?.code === 429 || 
            error?.message?.includes('429') || 
            error?.message?.includes('quota') || 
            error?.message?.includes('RESOURCE_EXHAUSTED');
            
        const isServerOverload = error?.status === 503 || error?.code === 503;

        if (isRateLimit || isServerOverload) {
          // Calculate delay: Initial * 2^attempt + random jitter
          const delay = initialDelay * Math.pow(2, i) + (Math.random() * 1000);
          console.warn(`[Gemini] Rate limit hit (Attempt ${i + 1}/${maxRetries}). Retrying in ${Math.round(delay)}ms...`);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // Retry loop
        }
        
        // If it's not a retryable error, throw immediately
        throw error;
      }
    }
    
    throw lastError;
  }

  async getEmbedding(text: string, signal?: AbortSignal): Promise<number[] | null> {
    if (!text) return null;
    try {
      // Wrap embedding call with retry
      const response = await this.retryWithBackoff(() => this.client.models.embedContent({
        model: 'text-embedding-004',
        contents: [
          {
            parts: [{ text: text }]
          }
        ]
      })) as any;
      return response.embeddings?.[0]?.values || null;
    } catch (error) {
      console.error("Gemini Embedding Error:", error);
      return null;
    }
  }

  async generateAbstract(title: string, authors: string[], fullText?: string, signal?: AbortSignal): Promise<string> {
    try {
      let prompt = "";
      
      if (fullText && fullText.length > 500) {
          // Priority 1: Summarize real text (Scraped)
          prompt = `
            Summarize the following academic text into a concise abstract (approx 150 to 250 words).
            Focus on the objectives, methods, and results.
            
            TEXT SOURCE:
            ${fullText.slice(0, 15000)}
          `;
      } else {
          // Priority 2: Fallback inference (Metadata only)
          prompt = `Generate a 3-sentence abstract for this paper based on metadata. Title: ${title} Authors: ${authors.join(", ")} Output ONLY text.`;
      }
      
      // Wrap generation call with retry
      const response = await this.retryWithBackoff(() => this.client.models.generateContent({
        model: this.modelId,
        contents: prompt
      })) as GenerateContentResponse;
      
      return this.cleanThinkTags(response.text || "Abstract generation failed.");
    } catch (error) {
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

      const prompt = `
        Analyze this scientific paper for a structured report.
        Title: ${paper.title}
        Abstract: ${paper.abstract}

        The paper MUST be highly relevant to at least one of the following topics/compounds to be qualified:
        ${topicsStr}

        You are an expert research analyst. Evaluate the "Discovery Probability" carefully.
        - If the paper discusses a generic review or irrelevant topic, probability is low (0-3).
        - If it discusses a known effect of these compounds, probability is medium (4-6).
        - If it identifies a NEW bioactive compound or a NEW therapeutic application of these topics, probability is high (7-10).
      `;

      // Wrap analysis call with retry
      const response = await this.retryWithBackoff(() => this.client.models.generateContent({
        model: this.modelId,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { 
                type: Type.NUMBER, 
                description: "Relevance Score 0-10. 0=Irrelevant, 10=Perfect Match" 
              },
              // We rely on 'qualified' for Turbo, but for logic we check lists. 
              // We let the model decide qualified based on topic relevance primarily.
              qualified: { 
                type: Type.BOOLEAN, 
                description: "True if score >= 6 AND relevant to specified topics" 
              },
              summary: { 
                type: Type.STRING, 
                description: "Concise bullet points summarizing the paper." 
              },
              tags: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                description: "List of relevant keywords"
              },
              phytochemicals: { 
                type: Type.STRING,
                description: "Comma separated list of specific chemicals found. Return 'None' if empty."
              },
              plants: { 
                type: Type.STRING,
                description: "Comma separated list of specific plants found. Return 'None' if empty."
              },
              possible_plants: { 
                type: Type.STRING,
                description: "List plants/compounds with reasoning if inferred. Return 'None' if empty."
              },
              probability: { 
                type: Type.INTEGER, 
                description: "Integer 0-10. Probability this discovers a new use/compound. 0=Old/Generic, 10=Novel Discovery" 
              }
            },
            required: ["score", "qualified", "summary", "tags", "phytochemicals", "plants", "possible_plants", "probability"]
          }
        }
      })) as GenerateContentResponse;

      // With responseSchema, the text is guaranteed to be valid JSON matching the schema
      const jsonText = this.cleanThinkTags(response.text || "{}");
      
      let json;
      try {
        json = JSON.parse(jsonText);
      } catch (e) {
        console.error("JSON Parse Error", e);
        return { 
            qualified: false, score: 0, summary: "Analysis Parse Error", tags: [],
            phytochemicals: "None", plants: "None", possible_plants: "None", probability: 0
        };
      }

      // SAFE CASTING HELPER: Ensures we always work with strings
      const safeString = (val: any): string => {
         if (val === null || val === undefined) return "None";
         if (typeof val === 'string') return val;
         if (Array.isArray(val)) return val.join(", ");
         return String(val);
      };

      const phytoStr = safeString(json.phytochemicals);
      const plantsStr = safeString(json.plants);
      const possibleStr = safeString(json.possible_plants);
      
      // LOGIC FIX:
      // 1. Clamp score to 10 max
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
      console.error("Gemini Analysis failed", e);
      return { 
          qualified: false, score: 0, summary: "Error during analysis", tags: [],
          phytochemicals: "Error", plants: "Error", possible_plants: "Error", probability: 0
      };
    }
  }
}