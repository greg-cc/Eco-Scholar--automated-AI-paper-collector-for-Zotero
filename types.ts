
export interface Paper {
  id: string;
  title: string;
  abstract: string;
  authors: string[];
  year: number;
  url: string;
  doi?: string;
  source: 'SemanticScholar' | 'PubMed';
}

export interface MatchDetail {
  sentenceId: string;
  sentence: string;
  tag: string; // The S-Tag
  netScore: number; // Weighted Score
  rawScore: number; // Raw Cosine Similarity
}

export interface ProcessingResult {
  paperId: string;
  querySource: string; // The search term that found this paper
  vectorScore: number; // Query Similarity (0-1)
  compositeScore: number; // Semantic Accumulation (can be > 1)
  matches: MatchDetail[]; // Top semantic matches
  passedVectorFilter: boolean;
  passedCompositeFilter: boolean;
  
  // Thresholds used during processing
  vectorMin?: number;
  compositeMin?: number;
  probabilityMin?: number;

  aiAnalysis?: {
    qualified: boolean;
    score: number; // 0-10
    summary: string;
    tags: string[];
    phytochemicals?: string;
    plants?: string;
    possible_plants?: string;
    probability?: number;
  };
  skippedAi: boolean; // True if Smart Speedup skipped the AI check
  status: 'FILTERED_OUT' | 'PENDING_AI' | 'AI_REJECTED' | 'QUALIFIED' | 'QUALIFIED_SPEEDUP' | 'SKIPPED_FAIL_FAST';
  
  // New Statistics for UI visibility
  speedupStatistics?: {
    processed: number; // Number of papers that passed pre-filters so far
    qualified: number; // Number of those that were qualified by AI (or Speedup)
    yield: number;     // qualified / processed
    active: boolean;   // Was Smart Speedup ON for this paper?
  };
}

export interface SemanticSentence {
  id: string;
  text: string;
  enabled: boolean;
  positive: boolean; // True = Must match (positive weight), False = Penalty
  customTag: string;
}

export type AIProvider = 'gemini' | 'ollama';

export interface AppConfig {
  provider: AIProvider;
  geminiApiKey: string;
  geminiModel: string; // Selected Gemini Model ID
  ollamaBaseUrl: string;
  ollamaModel: string; // Generation Model (e.g., llama3, meditron)
  ollamaEmbeddingModel: string; // Embedding Model (e.g., nomic-embed-text)
  
  // Zotero Config
  zoteroApiKey?: string;
  zoteroLibraryId?: string; // User ID or Group ID
  useLocalZotero: boolean; // Toggle for Local API
  zoteroIp: string;
  zoteroPort: string;

  // Scoring & Grading
  minVectorScore: number; // Threshold for Query <-> Paper
  minCompositeScore: number; // Threshold for Semantic Sentences <-> Paper
  minProbabilityScore: number; // Threshold for AI Discovery Probability (0-10)
  gradingTopics: string[]; // List of required topics for AI Grading

  speedupSampleCount: number; // e.g., 10 papers to check
  speedupQualifyRate: number; // e.g., 0.7 (70%)
  failFast: boolean; // If true, skips query if first N papers fail
  semanticSentences: SemanticSentence[];
}

export interface CycleStats {
  totalScanned: number;
  passedVector: number; // Passed BOTH Vector and Composite pre-filters
  aiAnalyzed: number;
  qualified: number;
  speedupActive: boolean;
  energySaved: number; // Abstract units representing saved Generation calls
}

export interface AIService {
  getEmbedding(text: string, signal?: AbortSignal): Promise<number[] | null>;
  // Updated: accepts fullText for grounded summarization
  generateAbstract(title: string, authors: string[], fullText?: string, signal?: AbortSignal): Promise<string>;
  analyzePaper(paper: Paper, gradingTopics: string[], signal?: AbortSignal): Promise<{ 
      qualified: boolean; 
      score: number; 
      summary: string; 
      tags: string[];
      phytochemicals: string;
      plants: string;
      possible_plants: string;
      probability: number;
  }>;
}

export type QueueStatus = 'READY' | 'RUNNING' | 'COMPLETED' | 'NEEDS_ADJUSTMENT' | 'CANCELLED';

export interface QueueItem {
  id: string;
  query: string;
  status: QueueStatus;
  yield?: string; // e.g. "10%"
  details?: string;
  
  // Per-Query Configuration
  collectionId?: string;
  vecMin?: number;
  compMin?: number; 
  probMin?: number;
  startRec?: number;
  stopRec?: number;
  selected?: boolean; // UI Selection state
}

export interface CycleHeaderData {
  id: string;
  query: string;
  timestamp: number;
  totalRecords?: number; // Added totalRecords
  configSnapshot: {
    vectorMin: number;
    compMin: number;
    probMin: number; // Discovery Probability
    gradingTopics: string[]; // Truncated or count
    
    startRec: number;
    stopRec: number;
    source: string;
    model: string;
    
    speedUp: boolean;
    failFast: boolean;
    speedupSampleCount: number;
    qualifyRate: number;
    
    collection: string;
    mode: string;
    semanticRuleCount: number;
  };
}

export interface TurboGroupData {
  id: string;
  cycleId: string; // Links this group to the header
  items: { paper: Paper; result: ProcessingResult }[];
}

// New Report Interface for Inline Blocks
export interface CycleCompleteData {
  id: string;
  query: string;
  totalFound: number;
  qualifiedCount: number;
  status: 'COMPLETED' | 'FAIL_FAST' | 'HARVEST_DONE';
  failFastReason?: string;
  
  // Context for resumption
  continuationContext?: {
      startRec: number;
      stopRec: number;
      queryVector: number[] | null;
      activeSentenceVectors: any[];
      headerId: string;
      item: QueueItem;
  };
}

export interface HarvestHeaderData {
    id: string;
    startRec: number;
    stopRec: number;
}

export type FeedItem = 
  | { type: 'HEADER'; data: CycleHeaderData }
  | { type: 'PAPER'; data: { paper: Paper; result: ProcessingResult } }
  | { type: 'TURBO_GROUP'; data: TurboGroupData }
  | { type: 'CYCLE_COMPLETE'; data: CycleCompleteData }
  | { type: 'HARVEST_HEADER'; data: HarvestHeaderData };

// New Interface for Network Debugging
export interface NetworkLog {
  id: string;
  timestamp: number;
  source: 'Ollama' | 'Zotero' | 'Gemini';
  type: 'req' | 'res' | 'err';
  method: string;
  url: string;
  status?: number;
  duration?: number;
  details?: string;
  requestBody?: string;
  responseBody?: string;
}

export interface ZoteroResult {
  paperTitle: string;
  status: 'UPLOADED' | 'DUPLICATE' | 'UNCERTAIN' | 'ERROR';
  details?: string;
}

// Kept for type compatibility if needed, but unused in new inline flow
export interface CycleReportData {
  query: string;
  totalFound: number;
  qualifiedCount: number;
  speedupCount: number;
  energySaved: number;
  yieldPercent: number;
  status: 'COMPLETED' | 'FAIL_FAST';
  failFastReason?: string;
}
