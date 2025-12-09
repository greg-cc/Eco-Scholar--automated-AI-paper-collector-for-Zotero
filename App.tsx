
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppConfig, ProcessingResult, Paper, CycleStats, AIService, QueueItem, FeedItem, CycleHeaderData, NetworkLog, ZoteroResult } from './types';
import { DEFAULT_SEMANTIC_SENTENCES, DEFAULT_GRADING_TOPICS } from './constants';
import { GeminiService } from './services/geminiService';
import { OllamaService } from './services/ollamaService';
import { ScraperService } from './services/scraperService';
import { ZoteroService } from './services/zoteroService';
import { cosineSimilarity } from './services/vectorService';
import { searchPapers } from './services/paperService';
import { generateRIS, downloadRIS } from './services/exportService';
import StatsPanel from './components/StatsPanel';
import SettingsPanel from './components/SettingsPanel';
import PaperCard from './components/PaperCard';
import TurboGroupCard from './components/TurboGroupCard';
import CycleHeader from './components/CycleHeader';
import QueuePanel from './components/QueuePanel';
import QueryManager from './components/QueryManager';
import NetworkSidebar from './components/NetworkSidebar';
import { Settings2, CloudUpload, BookOpen, XCircle } from 'lucide-react';
import { clsx } from 'clsx';

const App: React.FC = () => {
  // Config State
  const [config, setConfig] = useState<AppConfig>({
    provider: 'ollama',
    geminiApiKey: process.env.API_KEY || '',
    geminiModel: 'gemini-2.0-flash',
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'openthinker', 
    ollamaEmbeddingModel: 'nomic-embed-text', 
    minVectorScore: 0.59, 
    minCompositeScore: 0.60, // UPDATED: Default to 0.6 Average
    minProbabilityScore: 5, // Normalized from 50 (0-10 scale)
    gradingTopics: DEFAULT_GRADING_TOPICS,
    turboThresholdCount: 10,
    turboQualifyRate: 0.7,
    failFast: true,
    semanticSentences: DEFAULT_SEMANTIC_SENTENCES,
    
    // Zotero Default Config
    zoteroApiKey: '',
    zoteroLibraryId: '',
    useLocalZotero: false,
    zoteroIp: '127.0.0.1',
    zoteroPort: '23119'
  });

  // Runtime State
  const [queue, setQueue] = useState<QueueItem[]>(() => {
    const defaultQueries = [
      "Lyme flavonoids",
      "Lyme Carotenoids",
      "Lyme Plant-Derived",
      "Lyme herbal",
      "Lyme extracts",
      "Lyme phytochemicals",
      "Lyme Bioactive",
      "Lyme Phytonutrient",
      "Lyme Biologically Active",
      "Lyme Compounds",
      "Lyme ALKALOIDS",
      "Lyme TCM",
      "Lyme polyphenols",
      "Lyme plant extracts",
      "Lyme dose-dependent",
      "Lyme receptors",
      "Lyme synergistic",
      "Lyme phenolic acids",
      "Lyme coumarins",
      "Lyme stilbenes",
      "Lyme Terpenoids",
      "Lyme Terpenes",
      "Lyme Glucosinolates",
      "Lyme Organosulfur",
      "Lyme Phytosterols",
      "Lyme Saponins"
    ];

    return defaultQueries.map((q, i) => ({
      id: `q-init-${i}`,
      query: q,
      status: 'READY',
      vecMin: 0.59,
      compMin: 0.60, // UPDATED
      probMin: 5, // Normalized from 50
      startRec: 0,
      stopRec: 1000,
      selected: false
    }));
  });
  
  const [currentProcessingQuery, setCurrentProcessingQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false); 
  const [isQueryManagerOpen, setIsQueryManagerOpen] = useState(true);
  
  // Zotero Controls
  const [uploadToZotero, setUploadToZotero] = useState(true);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [zoteroResults, setZoteroResults] = useState<ZoteroResult[] | null>(null);

  // Results Feed (Polymorphic: Headers + Papers + TurboGroups)
  const [results, setResults] = useState<FeedItem[]>([]);
  
  // Network Logs for Sidebar
  const [networkLogs, setNetworkLogs] = useState<NetworkLog[]>([]);

  const [stats, setStats] = useState<CycleStats>({
    totalScanned: 0,
    passedVector: 0,
    aiAnalyzed: 0,
    qualified: 0,
    turboModeActive: false,
    energySaved: 0
  });

  // Services
  const aiServiceRef = useRef<AIService | null>(null);
  const scraperServiceRef = useRef<ScraperService>(new ScraperService());
  const abortControllerRef = useRef<AbortController | null>(null);

  const cycleRef = useRef({
    processedForTurbo: 0,
    qualifiedForTurbo: 0
  });

  // Logging Callback passed to services
  const handleNetworkLog = useCallback((log: NetworkLog) => {
    setNetworkLogs(prev => {
      const index = prev.findIndex(l => l.id === log.id);
      if (index >= 0) {
        // Update existing log
        const newLogs = [...prev];
        newLogs[index] = { ...newLogs[index], ...log };
        return newLogs;
      }
      // Append new log
      return [...prev, log].slice(-200);
    });
  }, []);

  // Re-initialize service when config changes
  useEffect(() => {
    aiServiceRef.current = null;
    console.log("Initializing AI Service. Provider:", config.provider);

    if (config.provider === 'gemini' && config.geminiApiKey) {
        aiServiceRef.current = new GeminiService(config.geminiApiKey, config.geminiModel);
    } else if (config.provider === 'ollama' && config.ollamaBaseUrl && config.ollamaModel) {
        aiServiceRef.current = new OllamaService(
            config.ollamaBaseUrl, 
            config.ollamaModel, 
            config.ollamaEmbeddingModel || 'nomic-embed-text',
            handleNetworkLog // Inject Logger
        );
    }
  }, [config.provider, config.geminiApiKey, config.geminiModel, config.ollamaBaseUrl, config.ollamaModel, config.ollamaEmbeddingModel, handleNetworkLog]);

  const handleExport = async () => {
    // UPDATED: Flatten results to include papers inside TURBO_GROUP items
    const paperItems = results.flatMap(r => {
        if (r.type === 'PAPER') return [r.data];
        if (r.type === 'TURBO_GROUP') return r.data.items;
        return [];
    }).filter(r => r.result.status === 'QUALIFIED' || r.result.status === 'QUALIFIED_TURBO');

    if (paperItems.length === 0) {
        alert("No qualified papers to process.");
        return;
    }

    if (uploadToZotero) {
        if (!config.useLocalZotero && (!config.zoteroApiKey || !config.zoteroLibraryId)) {
            alert("Cloud Mode: Please configure Zotero API Key and Library ID in settings.");
            return;
        }

        setIsUploading(true);
        setZoteroResults(null);
        
        const zotero = new ZoteroService({
            apiKey: config.zoteroApiKey, 
            libraryId: config.zoteroLibraryId,
            useLocal: config.useLocalZotero,
            ip: config.zoteroIp,
            port: config.zoteroPort,
            onLog: handleNetworkLog // Inject Logger
        });
        
        try {
            const results = await zotero.uploadItems(paperItems);
            setZoteroResults(results);
        } catch (e) {
            console.error(e);
            alert("Upload failed. Check console for details.");
        } finally {
            setIsUploading(false);
        }
    } else {
        const risContent = generateRIS(paperItems);
        if (!risContent) {
            alert("Error generating RIS content.");
            return;
        }
        downloadRIS(risContent);
    }
  };

  const handleCancel = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
          console.log("Process cancelled by user.");
          setQueue(prev => prev.map(item => item.status === 'RUNNING' ? { ...item, status: 'CANCELLED' } : item));
          setIsProcessing(false);
      }
  };

  const updateQueueStatus = (index: number, status: QueueItem['status'], extra?: Partial<QueueItem>) => {
      setQueue(prev => prev.map((item, i) => i === index ? { ...item, status, ...extra } : item));
  };

  const processBatchQueue = async () => {
    if (!aiServiceRef.current) {
      alert(`Please configure your ${config.provider.toUpperCase()} Provider in settings.`);
      return;
    }

    if (queue.length === 0) {
        alert("Queue is empty. Add queries to run.");
        return;
    }

    setIsProcessing(true);
    setIsQueryManagerOpen(false); // Auto-collapse to allow report to fill screen

    setStats({
      totalScanned: 0,
      passedVector: 0,
      aiAnalyzed: 0,
      qualified: 0,
      turboModeActive: false,
      energySaved: 0
    });

    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;
    
    try {
      // SEQUENTIAL EXECUTION FOR SENTENCE VECTORS
      // Local LLMs often choke on parallel embedding requests, returning empty/null responses.
      const activeSentences = config.semanticSentences.filter(s => s.enabled);
      const validSentenceVectors: (typeof activeSentences[0] & { vector: number[] })[] = [];
      
      for (const s of activeSentences) {
        if (signal.aborted) throw new Error("Cancelled by user");
        const vec = await aiServiceRef.current!.getEmbedding(s.text, signal);
        if (vec) {
            validSentenceVectors.push({ ...s, vector: vec });
        }
      }
      
      if (validSentenceVectors.length === 0 && activeSentences.length > 0) {
        throw new Error("Failed to generate embeddings. Check AI Provider connection.");
      }

      for (let i = 0; i < queue.length; i++) {
          if (signal.aborted) throw new Error("Cancelled by user");
          
          const currentItem = queue[i];
          if (currentItem.status === 'COMPLETED') continue;

          updateQueueStatus(i, 'RUNNING');
          setCurrentProcessingQuery(currentItem.query);
          
          const queryTerm = currentItem.query;
          const itemVecMin = currentItem.vecMin ?? config.minVectorScore;
          const itemCompMin = currentItem.compMin ?? config.minCompositeScore;
          
          // AUTO-SCALE FIX: If user entered > 10 (likely percentage), normalize to 0-10 scale
          let itemProbMin = currentItem.probMin ?? config.minProbabilityScore;
          if (itemProbMin > 10) {
             console.warn(`Auto-scaling probability threshold: ${itemProbMin} -> ${itemProbMin/10}`);
             itemProbMin = itemProbMin / 10;
          }

          const headerId = `cycle-${Date.now()}-${i}`;
          const headerData: CycleHeaderData = {
              id: headerId,
              query: queryTerm,
              timestamp: Date.now(),
              configSnapshot: {
                  vectorMin: itemVecMin,
                  compMin: itemCompMin,
                  probMin: itemProbMin,
                  gradingTopics: [...config.gradingTopics],
                  startRec: currentItem.startRec || 0,
                  stopRec: currentItem.stopRec || 20,
                  source: 'Semantic Scholar',
                  model: config.provider === 'gemini' ? config.geminiModel : (config.ollamaModel || 'openthinker'),
                  speedUp: true,
                  failFast: config.failFast,
                  turboThreshold: config.turboThresholdCount,
                  qualifyRate: config.turboQualifyRate,
                  collection: currentItem.collectionId || 'Default',
                  mode: 'Keyword Search',
                  semanticRuleCount: activeSentences.length
              }
          };
          setResults(prev => [...prev, { type: 'HEADER', data: headerData }]);

          cycleRef.current = { processedForTurbo: 0, qualifiedForTurbo: 0 };
          let queryScannedCount = 0;
          let queryQualifiedCount = 0;
          let failFastTriggered = false;

          const queryVector = await aiServiceRef.current!.getEmbedding(queryTerm, signal);
          
          // CRITICAL: Fail batch if query vector is missing. Prevents silent failure where everything gets 0 score.
          if (!queryVector) {
              throw new Error(`Failed to generate embedding for query: "${queryTerm}". Check Ollama status.`);
          }
          
          // --- PAGINATED FETCHING LOOP ---
          let currentOffset = currentItem.startRec || 0;
          const maxRecords = currentItem.stopRec || 1000;
          const BATCH_SIZE = 20;

          while (currentOffset < maxRecords) {
             if (signal.aborted) throw new Error("Cancelled by user");
             if (failFastTriggered) break;

             // Fetch next batch of papers
             const fetchLimit = Math.min(BATCH_SIZE, maxRecords - currentOffset);
             const rawPapers = await searchPapers(queryTerm, 'PubMed', signal, currentOffset, fetchLimit);
             
             if (rawPapers.length === 0) break; // API returned no more results

             const uniquePapers = Array.from(new Map(rawPapers.map(p => [p.id, p])).values());

             for (const paper of uniquePapers) {
                if (signal.aborted) throw new Error("Cancelled by user");
                
                // Break out of inner loop if we triggered fail fast previously
                if (failFastTriggered) break; 

                queryScannedCount++;
                setStats(prev => ({ ...prev, totalScanned: prev.totalScanned + 1 }));

                // --- Analysis Logic ---
                const paperText = `${paper.title} ${paper.abstract}`;
                let vectorScore = 0;
                let paperVector: number[] | null = null;
                
                // 1. Vector Score
                if (queryVector) {
                    paperVector = await aiServiceRef.current!.getEmbedding(paperText, signal);
                    if (paperVector) {
                        vectorScore = cosineSimilarity(queryVector, paperVector);
                    }
                }

                // 2. Composite Score (Updated to Average Top 6)
                let compositeScore = 0;
                const matches: any[] = [];
                const ruleScores: number[] = [];
                
                if (paperVector && validSentenceVectors.length > 0) {
                    for (const sv of validSentenceVectors) {
                        const similarity = cosineSimilarity(sv.vector, paperVector);
                        const weightedScore = sv.positive ? similarity : -similarity;
                        ruleScores.push(weightedScore);

                        if (similarity > 0.35) { 
                            matches.push({
                                sentenceId: sv.id,
                                sentence: sv.text,
                                tag: sv.customTag,
                                netScore: weightedScore,
                                rawScore: similarity
                            });
                        }
                    }

                    // SORT and AVERAGE TOP 6
                    ruleScores.sort((a, b) => b - a); // Descending
                    const top6 = ruleScores.slice(0, 6);
                    const sumTop6 = top6.reduce((acc, val) => acc + val, 0);
                    compositeScore = sumTop6 / 6;
                }
                
                const passedVector = vectorScore >= itemVecMin;
                const passedComposite = compositeScore >= itemCompMin;
                const passedPreFilter = passedVector || passedComposite;
                
                if (passedPreFilter) {
                    setStats(prev => ({ ...prev, passedVector: prev.passedVector + 1 }));
                }

                // 3. AI Analysis Decision (Turbo Logic)
                let aiAnalysis: any = undefined;
                let status: ProcessingResult['status'] = 'FILTERED_OUT';
                let skippedAi = true;
                let turboActiveForThis = false;

                if (passedPreFilter) {
                    cycleRef.current.processedForTurbo++;
                    
                    // Turbo Check
                    const turboYield = cycleRef.current.processedForTurbo > 0 
                        ? cycleRef.current.qualifiedForTurbo / cycleRef.current.processedForTurbo 
                        : 0;
                    turboActiveForThis = cycleRef.current.processedForTurbo > config.turboThresholdCount && turboYield >= config.turboQualifyRate;

                    if (turboActiveForThis) {
                        status = 'QUALIFIED_TURBO';
                        skippedAi = true;
                        setStats(prev => ({ ...prev, qualified: prev.qualified + 1, turboModeActive: true, energySaved: prev.energySaved + 1 }));
                        queryQualifiedCount++;
                        cycleRef.current.qualifiedForTurbo++;
                    } else {
                        skippedAi = false;
                        setStats(prev => ({ ...prev, aiAnalyzed: prev.aiAnalyzed + 1 }));
                        
                        // Run AI
                        aiAnalysis = await aiServiceRef.current!.analyzePaper(paper, config.gradingTopics, signal);
                        
                        // Check Probability Threshold
                        if (aiAnalysis.qualified && aiAnalysis.probability >= itemProbMin) {
                            status = 'QUALIFIED';
                            cycleRef.current.qualifiedForTurbo++;
                            setStats(prev => ({ ...prev, qualified: prev.qualified + 1 }));
                            queryQualifiedCount++;
                        } else {
                            status = 'AI_REJECTED';
                        }
                    }

                    // --- FAIL FAST CHECK (Updated) ---
                    // Only trigger if we have enough CANDIDATES (passed filters) to judge the stream quality.
                    // This ensures we keep downloading until we get 'turboThresholdCount' papers that actually hit the AI.
                    if (config.failFast && !turboActiveForThis && cycleRef.current.processedForTurbo > config.turboThresholdCount + 1) {
                        const currentYield = cycleRef.current.qualifiedForTurbo / cycleRef.current.processedForTurbo;
                        
                        if (currentYield < config.turboQualifyRate) {
                             const yieldPercent = (currentYield * 100).toFixed(1) + '%';
                             
                             const failFastResult: ProcessingResult = {
                                 paperId: `failfast-${paper.id}`,
                                 querySource: queryTerm,
                                 vectorScore: 0,
                                 compositeScore: 0,
                                 matches: [],
                                 passedVectorFilter: false,
                                 passedCompositeFilter: false,
                                 skippedAi: true,
                                 status: 'SKIPPED_FAIL_FAST',
                                 vectorMin: itemVecMin,
                                 compositeMin: itemCompMin,
                                 probabilityMin: itemProbMin
                             };
    
                             setResults(prev => [...prev, { 
                                type: 'PAPER',
                                data: {
                                    paper: { ...paper, title: `Fail Fast: Aborted '${queryTerm}' (Yield ${yieldPercent} < Target ${(config.turboQualifyRate * 100).toFixed(0)}%)` }, 
                                    result: failFastResult
                                }
                             }]);
                             
                             updateQueueStatus(i, 'NEEDS_ADJUSTMENT', { yield: yieldPercent });
                             failFastTriggered = true;
                        }
                    }
                }

                // Capture Statistics for UI
                const currentTurboStats = {
                    processed: cycleRef.current.processedForTurbo,
                    qualified: cycleRef.current.qualifiedForTurbo,
                    yield: cycleRef.current.processedForTurbo > 0 
                        ? cycleRef.current.qualifiedForTurbo / cycleRef.current.processedForTurbo 
                        : 0,
                    active: turboActiveForThis
                };

                const result: ProcessingResult = {
                    paperId: paper.id,
                    querySource: queryTerm,
                    vectorScore,
                    compositeScore,
                    matches: matches.sort((a,b) => b.rawScore - a.rawScore).slice(0, 3),
                    passedVectorFilter: passedVector,
                    passedCompositeFilter: passedComposite,
                    vectorMin: itemVecMin,
                    compositeMin: itemCompMin,
                    probabilityMin: itemProbMin,
                    aiAnalysis,
                    skippedAi,
                    status,
                    turboStatistics: currentTurboStats
                };

                // RESULT HANDLING: Group Turbo records or add normally
                if (status === 'QUALIFIED_TURBO') {
                    setResults(prev => {
                        const last = prev[prev.length - 1];
                        if (last && last.type === 'TURBO_GROUP' && last.data.cycleId === headerId) {
                            const updatedGroup: FeedItem = {
                                type: 'TURBO_GROUP',
                                data: { ...last.data, items: [...last.data.items, { paper, result }] }
                            };
                            return [...prev.slice(0, -1), updatedGroup];
                        } else {
                            return [...prev, {
                                type: 'TURBO_GROUP',
                                data: {
                                    id: `turbo-group-${Date.now()}`,
                                    cycleId: headerId,
                                    items: [{ paper, result }]
                                }
                            }];
                        }
                    });
                } else {
                    setResults(prev => [...prev, { type: 'PAPER', data: { paper, result } }]);
                }
             } // End Inner Loop (Papers)
             
             // Increment Offset for Pagination
             currentOffset += rawPapers.length;

          } // End While Loop (Pagination)

          if (!failFastTriggered) {
              const yieldP = queryScannedCount > 0 ? ((queryQualifiedCount / queryScannedCount) * 100).toFixed(1) + '%' : '0%';
              updateQueueStatus(i, 'COMPLETED', { yield: yieldP });
          }
      }
    } catch (e: any) {
        if (e.name !== 'AbortError') {
            alert(`Process Error: ${e.message}`);
        }
    } finally {
        setIsProcessing(false);
        abortControllerRef.current = null;
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans text-slate-900">
      
      {/* LEFT: Network & Logs Sidebar */}
      <NetworkSidebar 
        logs={networkLogs} 
        isProcessing={isProcessing} 
        onCancel={handleCancel}
        onClearLogs={() => setNetworkLogs([])}
      />

      {/* CENTER: Main Application Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
        
        {/* TOP BAR */}
        <header className="h-14 bg-white border-b border-slate-200 flex justify-between items-center px-6 shadow-sm z-20 shrink-0">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 text-white p-1.5 rounded-lg">
               <BookOpen size={20} strokeWidth={2.5} />
            </div>
            <h1 className="text-lg font-bold text-slate-800 tracking-tight">EcoScholar AI <span className="text-slate-400 font-normal text-xs ml-2">v2.1 Beta</span></h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-xs text-slate-500 hidden md:block">
                 Provider: <span className="font-bold text-slate-700 uppercase">{config.provider}</span>
            </div>
            <div className="h-4 w-px bg-slate-300 hidden md:block"></div>
            
            <button 
                onClick={handleExport}
                className="flex items-center gap-2 text-slate-600 hover:text-blue-600 transition-colors text-xs font-bold bg-slate-50 px-3 py-1.5 rounded border border-slate-200"
            >
                <CloudUpload size={14} /> Export / Zotero
            </button>
            <button 
                onClick={() => setShowSettings(!showSettings)}
                className={clsx(
                    "p-2 rounded-lg transition-all",
                    showSettings ? "bg-slate-200 text-slate-800 shadow-inner" : "hover:bg-slate-100 text-slate-500"
                )}
            >
                <Settings2 size={20} />
            </button>
          </div>
        </header>

        {/* SCROLLABLE CONTENT AREA */}
        <main className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
            <div className="max-w-6xl mx-auto space-y-6">
                
                {/* 1. Statistics Panel */}
                <StatsPanel stats={stats} />

                {/* 2. Settings Panel (Collapsible) */}
                {showSettings && (
                    <SettingsPanel config={config} onUpdate={setConfig} onLog={handleNetworkLog} />
                )}

                {/* 3. Query Manager / Queue */}
                <div className={clsx("transition-all duration-300", isQueryManagerOpen ? "opacity-100" : "opacity-100")}>
                    <div className="flex justify-between items-center mb-2">
                         <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide">Research Queue</h2>
                         <button 
                            onClick={() => setIsQueryManagerOpen(!isQueryManagerOpen)} 
                            className="text-xs text-blue-600 font-bold hover:underline"
                         >
                            {isQueryManagerOpen ? "Hide Manager" : "Show Manager"}
                         </button>
                    </div>
                    
                    {isQueryManagerOpen ? (
                        <QueryManager 
                            queue={queue} 
                            onUpdateQueue={setQueue} 
                            config={config} 
                            onRun={processBatchQueue} 
                            isProcessing={isProcessing}
                        />
                    ) : (
                        <QueuePanel 
                             queue={queue} 
                             onUpdateQueue={setQueue} 
                             isProcessing={isProcessing} 
                             onRun={processBatchQueue} 
                             onCancel={handleCancel}
                             config={config}
                        />
                    )}
                </div>

                {/* 4. Results Feed */}
                <div className="space-y-4 pt-4 border-t border-slate-200 mt-8">
                    {results.length === 0 && !isProcessing && (
                        <div className="text-center py-20 bg-white rounded-xl border border-slate-200 border-dashed">
                            <div className="text-slate-300 mb-4 flex justify-center"><BookOpen size={48} /></div>
                            <h3 className="text-lg font-bold text-slate-600">Ready to Research</h3>
                            <p className="text-slate-400 max-w-md mx-auto mt-2">Add search terms to the queue above and click "Run Cycle" to begin the AI analysis.</p>
                        </div>
                    )}

                    {results.map((item, index) => {
                        if (item.type === 'HEADER') {
                            return <CycleHeader key={item.data.id} header={item.data} />;
                        } else if (item.type === 'TURBO_GROUP') {
                            return <TurboGroupCard key={item.data.id} data={item.data} />;
                        } else {
                            return <PaperCard key={item.data.paper.id} paper={item.data.paper} result={item.data.result} />;
                        }
                    })}

                    {isProcessing && (
                        <div className="flex justify-center py-8">
                            <div className="flex items-center gap-3 text-blue-600 bg-blue-50 px-6 py-3 rounded-full shadow-sm animate-pulse">
                                <span className="font-bold">Analyzing Papers...</span>
                            </div>
                        </div>
                    )}
                </div>
                
                {/* BOTTOM SPACER */}
                <div className="h-20"></div>
            </div>
        </main>

        {/* ZOTERO UPLOAD TOAST/OVERLAY (Optional simple feedback) */}
        {isUploading && (
            <div className="absolute bottom-6 right-6 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-2xl flex items-center gap-3 z-50 animate-bounce">
                <CloudUpload size={20} />
                <div>
                    <div className="font-bold text-sm">Uploading to Zotero...</div>
                    <div className="text-xs text-slate-400">Please wait</div>
                </div>
            </div>
        )}
        {zoteroResults && (
            <div className="absolute inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
                 <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
                     <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-xl">
                         <h3 className="font-bold text-slate-800">Zotero Upload Report</h3>
                         <button onClick={() => setZoteroResults(null)} className="p-2 hover:bg-slate-200 rounded-full"><XCircle size={20} /></button>
                     </div>
                     <div className="p-4 overflow-auto flex-1 space-y-2">
                         {zoteroResults.map((res, i) => (
                             <div key={i} className={clsx("p-2 rounded border text-xs flex justify-between items-center", 
                                res.status === 'UPLOADED' ? "bg-green-50 border-green-200 text-green-800" : 
                                (res.status === 'DUPLICATE' ? "bg-yellow-50 border-yellow-200 text-yellow-800" : 
                                (res.status === 'UNCERTAIN' ? "bg-pink-50 border-pink-200 text-pink-800" : "bg-red-50 border-red-200 text-red-800")))}>
                                <span className="font-medium truncate flex-1 mr-4">{res.paperTitle}</span>
                                <span className="font-bold uppercase whitespace-nowrap">{res.status}</span>
                             </div>
                         ))}
                     </div>
                     <div className="p-4 border-t border-slate-200 text-right">
                         <button onClick={() => setZoteroResults(null)} className="px-4 py-2 bg-blue-600 text-white rounded font-bold text-sm">Close</button>
                     </div>
                 </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default App;
