
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
    const topicsStr = gradingTopics.length > 0 ? gradingTopics.join(", ") : "Phytochemicals, Herbal Medicine, Natural Extracts";

    const runInference = async (prompt: string) => {
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
                    description: "Integer 0-10. Probability this is a specific/novel finding. 0=Irrelevant, 5=Relevant, 10=Novel" 
                }
                },
                required: ["score", "qualified", "summary", "tags", "phytochemicals", "plants", "possible_plants", "probability"]
            }
            }
        })) as GenerateContentResponse;

        const jsonText = this.cleanThinkTags(response.text || "{}");
        return JSON.parse(jsonText);
    };

    const buildPrompt = (isRetry: boolean = false) => {
        let prompt = `
        Analyze this scientific paper for a structured report.
        Title: ${paper.title}
        Abstract: ${paper.abstract}

        CRITERIA
        The paper has passed semantic pre-screening and MUST be evaluated for relevance to: ${topicsStr}

        SCORING GUIDELINES
        - "score": Overall relevance (0-10).
        - "probability": DISCOVERY PROBABILITY (0-10).
           - 0: FALSE POSITIVE. Completely irrelevant (e.g. software, administration, geology).
           - 1-4: General Mention/Review.
           - 5-10: RELEVANT. Specific plants/compounds mentioned in a medical/biological context.
           
        IMPORTANT: If the abstract mentions specific plants, extracts, or phytochemicals being tested or discussed, 'probability' MUST be at least 5. Do not rate as 0 if keywords are present.
      `;
      if (isRetry) {
          prompt += `\n\nCRITICAL CORRECTION: You previously assigned a probability of 0 to this paper. This paper passed semantic pre-filters. Please re-read the abstract carefully. If ANY of the target topics are mentioned, the probability CANNOT be 0.`;
      }
      return prompt;
    };

    try {
      // 1. Initial Run
      let json = await runInference(buildPrompt(false));

      // 2. Retry Logic
      if (json.probability === 0) {
          console.log(`[Gemini] Score 0 detected. Retrying with correction...`);
          try {
             const retryJson = await runInference(buildPrompt(true));
             if (retryJson.probability > 0) {
                 json = retryJson;
             }
          } catch(e) {
             console.warn("Retry failed");
          }
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
      
      const rawScore = json.score ?? 0;
      const clampedScore = Math.min(rawScore, 10);
      const aiQualified = !!json.qualified;
      
      // LOGIC FIX:
      // If score is high (>=5) OR Probability is high (>=5), FORCE qualified to true.
      const isQualified = aiQualified || (rawScore >= 5) || ((json.probability ?? 0) >= 5);

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
