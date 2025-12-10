
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppConfig, ProcessingResult, Paper, CycleStats, AIService, QueueItem, FeedItem, CycleHeaderData, NetworkLog, ZoteroResult, CycleCompleteData, HarvestHeaderData } from './types';
import { DEFAULT_SEMANTIC_SENTENCES, DEFAULT_GRADING_TOPICS } from './constants';
import { GeminiService } from './services/geminiService';
import { OllamaService } from './services/ollamaService';
import { ZoteroService } from './services/zoteroService';
import { ScraperService } from './services/scraperService';
import { cosineSimilarity } from './services/vectorService';
import { getPubMedIds, fetchPubMedPapers, searchSemanticScholar } from './services/paperService';
import { generateRIS, downloadRIS } from './services/exportService';
import StatsPanel from './components/StatsPanel';
import SettingsPanel from './components/SettingsPanel';
import PaperCard from './components/PaperCard';
import CycleHeader from './components/CycleHeader';
import CycleCompleteBlock from './components/CycleCompleteBlock';
import HarvestHeader from './components/HarvestHeader';
import QueuePanel from './components/QueuePanel';
import QueueModal from './components/QueueModal';
import QueryManager from './components/QueryManager';
import NetworkSidebar from './components/NetworkSidebar';
import { Settings2, CloudUpload, XCircle, Activity, Database, ToggleLeft, ToggleRight, Search, Globe, Library, FileText, AlertOctagon, FastForward, RotateCcw, Play } from 'lucide-react';
import { clsx } from 'clsx';

type SearchMode = 'PUBMED' | 'SEMANTIC';

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
    minCompositeScore: 0.60, 
    minProbabilityScore: 5, 
    gradingTopics: DEFAULT_GRADING_TOPICS,
    speedupSampleCount: 10,
    speedupQualifyRate: 0.5,
    failFast: false,
    semanticSentences: DEFAULT_SEMANTIC_SENTENCES,
    
    zoteroApiKey: '',
    zoteroLibraryId: '',
    useLocalZotero: false,
    zoteroIp: '127.0.0.1',
    zoteroPort: '23119'
  });

  // Runtime State
  const [searchMode, setSearchMode] = useState<SearchMode>('PUBMED');
  const [useWebScraping, setUseWebScraping] = useState(false); 
  const [showQueueModal, setShowQueueModal] = useState(false); 

  const [queue, setQueue] = useState<QueueItem[]>(() => {
    const defaultQueries = [
      "Lyme flavonoids",
      "Lyme Carotenoids",
      "Lyme Plant-Derived",
      "Lyme herbal",
      "Lyme extracts",
    ];

    return defaultQueries.map((q, i) => ({
      id: `q-init-${i}`,
      query: q,
      status: 'READY',
      vecMin: 0.59,
      compMin: 0.60,
      probMin: 5,
      startRec: 0,
      stopRec: 1000,
      selected: false
    }));
  });
  
  // Ref to keep track of queue state inside async loops
  const queueRef = useRef(queue);
  useEffect(() => { queueRef.current = queue; }, [queue]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false); 
  const [isQueryManagerOpen, setIsQueryManagerOpen] = useState(true);
  
  // Zotero Controls
  const [uploadToZotero, setUploadToZotero] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [zoteroResults, setZoteroResults] = useState<ZoteroResult[] | null>(null);

  // Results Feed
  const [results, setResults] = useState<FeedItem[]>([]);
  
  // Network Logs
  const [networkLogs, setNetworkLogs] = useState<NetworkLog[]>([]);

  // Processing State for Manual Controls
  const [processingState, setProcessingState] = useState<{ id: string; title: string } | null>(null);
  const userActionResolverRef = useRef<((action: 'RETRY' | 'SKIP') => void) | null>(null);

  const [stats, setStats] = useState<CycleStats>({
    totalScanned: 0,
    passedVector: 0,
    aiAnalyzed: 0,
    qualified: 0,
    speedupActive: false,
    energySaved: 0
  });

  const aiServiceRef = useRef<AIService | null>(null);
  const scraperServiceRef = useRef<ScraperService>(new ScraperService());
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const pendingSpeedupExportRef = useRef<{ paper: Paper; result: ProcessingResult }[]>([]);

  // State to track if we have triggered the "Start" header for smart mode visuals
  const hasTriggeredSmartModeRef = useRef(false);

  // Speedup Counters (Reference only, no locking logic)
  const cycleRef = useRef({
    processedCount: 0,
    qualifiedCount: 0,
    failFastTriggered: false
  });

  useEffect(() => {
      setResults([]);
      setStats({ totalScanned: 0, passedVector: 0, aiAnalyzed: 0, qualified: 0, speedupActive: false, energySaved: 0 });
      setQueue(prev => prev.map(q => ({ ...q, status: 'READY', yield: undefined, details: undefined })));
  }, [searchMode]);

  const handleNetworkLog = useCallback((log: NetworkLog) => {
    setNetworkLogs(prev => {
        const exists = prev.some(l => l.id === log.id);
        if (exists) return prev.map(l => l.id === log.id ? { ...l, ...log } : l);
        return [...prev, log].slice(-200);
    });
  }, []);

  const onManualRetry = () => userActionResolverRef.current?.('RETRY');
  const onManualSkip = () => userActionResolverRef.current?.('SKIP');

  useEffect(() => {
    aiServiceRef.current = null;
    if (config.provider === 'gemini' && config.geminiApiKey) {
        aiServiceRef.current = new GeminiService(config.geminiApiKey, config.geminiModel);
    } else if (config.provider === 'ollama' && config.ollamaBaseUrl && config.ollamaModel) {
        aiServiceRef.current = new OllamaService(
            config.ollamaBaseUrl, 
            config.ollamaModel, 
            config.ollamaEmbeddingModel || 'nomic-embed-text',
            handleNetworkLog
        );
    }
  }, [config.provider, config.geminiApiKey, config.geminiModel, config.ollamaBaseUrl, config.ollamaModel, config.ollamaEmbeddingModel, handleNetworkLog]);

  const runSpeedupJobExport = async (items: { paper: Paper; result: ProcessingResult }[]) => {
    if (items.length === 0) return;

    let useZotero = uploadToZotero;
    if (useZotero) {
        const missingKeys = !config.useLocalZotero && (!config.zoteroApiKey || !config.zoteroLibraryId);
        if (missingKeys) {
             const userWantsRis = confirm("Zotero Config Missing. Download RIS?");
             if (userWantsRis) useZotero = false;
             else return;
        }
    }

    if (useZotero) {
        setIsUploading(true);
        const zotero = new ZoteroService({
            apiKey: config.zoteroApiKey, 
            libraryId: config.zoteroLibraryId,
            useLocal: config.useLocalZotero,
            ip: config.zoteroIp,
            port: config.zoteroPort,
            onLog: handleNetworkLog
        });
        
        try {
            const uploadRes = await zotero.uploadItems(items);
            setZoteroResults(prev => [...(prev || []), ...uploadRes]);
        } catch (e) {
            console.error("Upload Error", e);
            alert("Upload failed."); 
        } finally {
            setIsUploading(false);
        }
    } else {
        const risContent = generateRIS(items);
        if (risContent) {
            downloadRIS(risContent, `cycle_export_${Date.now()}.ris`);
        }
    }
  };

  const handleExport = async () => {
    const paperItems = results.flatMap(r => {
        if (r.type === 'PAPER') return [r.data];
        return [];
    }).filter(r => r.result.status === 'QUALIFIED' || r.result.status === 'QUALIFIED_SPEEDUP');

    if (paperItems.length === 0) {
        alert("No qualified papers to export.");
        return;
    }
    await runSpeedupJobExport(paperItems);
  };

  const handleCancel = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
          setQueue(prev => prev.map(item => item.status === 'RUNNING' ? { ...item, status: 'CANCELLED' } : item));
          setIsProcessing(false);
          setProcessingState(null); // Clear manual control UI
      }
  };

  const updateQueueStatus = (index: number, status: QueueItem['status'], extra?: Partial<QueueItem>) => {
      setQueue(prev => prev.map((item, i) => i === index ? { ...item, status, ...extra } : item));
  };

  // Returns TRUE if the batch loop should STOP (e.g. Fail Fast Triggered)
  const processPaperBatch = async (
      papers: Paper[], 
      queryVector: number[] | null, 
      validSentenceVectors: any[], 
      currentItem: QueueItem,
      signal: AbortSignal,
      exportCollector: { paper: Paper; result: ProcessingResult }[]
  ): Promise<boolean> => {
      if (papers.length === 0) return false;

      const paperEmbeddings: (number[] | null)[] = [];
      for (let c = 0; c < papers.length; c += 5) {
          if (signal.aborted) break;
          const chunk = papers.slice(c, c + 5);
          const chunkResults = await Promise.all(chunk.map(p => 
              aiServiceRef.current!.getEmbedding(`${p.title} ${p.abstract}`, signal)
          ));
          paperEmbeddings.push(...chunkResults);
          await new Promise(r => setTimeout(r, 50)); 
      }

      for (let pIdx = 0; pIdx < papers.length; pIdx++) {
           if (signal.aborted) return true;
           if (cycleRef.current.failFastTriggered) return true;

           const paper = papers[pIdx];
           const paperVector = paperEmbeddings[pIdx];
           
           let vectorScore = 0;
           if (paperVector && queryVector) {
               vectorScore = cosineSimilarity(queryVector, paperVector);
           }

           let compositeScore = 0;
           const matches: any[] = [];
           if (paperVector && validSentenceVectors.length > 0) {
                const ruleScores = validSentenceVectors.map(sv => {
                    const similarity = cosineSimilarity(sv.vector, paperVector!);
                    const weightedScore = sv.positive ? similarity : -similarity;
                    if (similarity > 0.35) {
                        matches.push({ 
                            sentenceId: sv.id, sentence: sv.text, tag: sv.customTag, 
                            netScore: weightedScore, rawScore: similarity 
                        });
                    }
                    return weightedScore;
                });
                ruleScores.sort((a, b) => b - a);
                compositeScore = ruleScores.slice(0, 6).reduce((acc, val) => acc + val, 0) / 6;
           }
           
           const passedVector = vectorScore >= (currentItem.vecMin ?? config.minVectorScore);
           const passedComposite = compositeScore >= (currentItem.compMin ?? config.minCompositeScore);
           
           let status: ProcessingResult['status'] = 'FILTERED_OUT';
           let skippedAi = true;
           let aiAnalysis: any = undefined;

           if (passedVector || passedComposite) {
               cycleRef.current.processedCount++;
               
               // --- LOGIC START ---
               
               // 1. FAIL FAST CHECK
               if (config.failFast && 
                   cycleRef.current.processedCount >= config.speedupSampleCount && 
                   cycleRef.current.qualifiedCount === 0) {
                   
                   cycleRef.current.failFastTriggered = true;
                   status = 'SKIPPED_FAIL_FAST';
               } else {
                   // 2. SPEEDUP ELIGIBILITY
                   const targetQualifiedCount = Math.max(1, Math.ceil(config.speedupSampleCount * config.speedupQualifyRate));
                   
                   const isFirstPaper = cycleRef.current.processedCount === 1;
                   const isSpeedupEligible = !isFirstPaper && (cycleRef.current.qualifiedCount >= targetQualifiedCount);

                   // VISUAL HEADER TRIGGER
                   if (isSpeedupEligible && !hasTriggeredSmartModeRef.current) {
                        setResults(prev => [...prev, { 
                            type: 'HARVEST_HEADER', 
                            data: { 
                                id: `harvest-${Date.now()}`, 
                                startRec: cycleRef.current.processedCount, 
                                stopRec: currentItem.stopRec || 1000 
                            } 
                        }]);
                        hasTriggeredSmartModeRef.current = true;
                   }

                   if (isSpeedupEligible) {
                       status = 'QUALIFIED_SPEEDUP';
                       skippedAi = true;
                       cycleRef.current.qualifiedCount++;
                   } else {
                       // AI ANALYSIS
                       skippedAi = false;
                       let contextAbstract = paper.abstract;
                       if (useWebScraping) {
                            try {
                               const fullText = await scraperServiceRef.current.extractWebpageText(paper.url);
                               if (fullText && fullText.length > 500) contextAbstract += `\n\n[FULL TEXT EXTRACT]: ${fullText.substring(0, 10000)}`;
                            } catch (e) { console.warn("Scraping failed", paper.id); }
                       }
                       
                       const analysisPaper = { ...paper, abstract: contextAbstract };
                       
                       // --- ROBUST AI PROCESSING LOOP WITH MANUAL CONTROLS ---
                       let analysisDone = false;
                       while (!analysisDone && !signal.aborted) {
                            setProcessingState({ id: paper.id, title: paper.title });
                            
                            const aiAbort = new AbortController();
                            const aiPromise = aiServiceRef.current!.analyzePaper(analysisPaper, config.gradingTopics, aiAbort.signal)
                                .then(res => ({ type: 'SUCCESS', data: res }))
                                .catch(err => ({ type: 'ERROR', err }));
                            
                            // 70s Timeout (1m 10s)
                            const timeoutPromise = new Promise<{type: 'TIMEOUT'}>((resolve) => {
                                setTimeout(() => resolve({ type: 'TIMEOUT' }), 70000);
                            });

                            // User Manual Action
                            const userPromise = new Promise<{type: 'RETRY' | 'SKIP'}>((resolve) => {
                                userActionResolverRef.current = (action) => resolve({ type: action });
                            });

                            // RACE
                            const result: any = await Promise.race([aiPromise, timeoutPromise, userPromise]);

                            if (result.type === 'SUCCESS') {
                                aiAnalysis = result.data;
                                analysisDone = true;
                            } else if (result.type === 'ERROR') {
                                console.warn("AI Error", result.err);
                                aiAnalysis = { qualified: false, score: 0, summary: "Analysis Failed (Error)", tags: [], probability: 0 };
                                analysisDone = true;
                            } else if (result.type === 'TIMEOUT') {
                                aiAbort.abort();
                                console.warn("AI Timeout - Auto Skipping");
                                aiAnalysis = { qualified: false, score: 0, summary: "Analysis Timed Out (Auto-skipped)", tags: [], probability: 0 };
                                analysisDone = true;
                            } else if (result.type === 'SKIP') {
                                aiAbort.abort();
                                aiAnalysis = { qualified: false, score: 0, summary: "Skipped by User", tags: [], probability: 0 };
                                analysisDone = true;
                            } else if (result.type === 'RETRY') {
                                aiAbort.abort();
                                console.log("Retrying current record...");
                                await new Promise(r => setTimeout(r, 500));
                            }
                       }
                       setProcessingState(null);
                       // -----------------------------------------------------

                       if (aiAnalysis && aiAnalysis.qualified) {
                           status = 'QUALIFIED';
                           cycleRef.current.qualifiedCount++;
                       } else {
                           status = 'AI_REJECTED';
                       }
                   }
               }
           } else {
               status = 'FILTERED_OUT';
           }

           const result: ProcessingResult = {
               paperId: paper.id, 
               querySource: currentItem.query, 
               vectorScore, compositeScore, matches: matches.slice(0, 3),
               passedVectorFilter: passedVector, passedCompositeFilter: passedComposite,
               vectorMin: currentItem.vecMin ?? config.minVectorScore,
               compositeMin: currentItem.compMin ?? config.minCompositeScore,
               probabilityMin: currentItem.probMin ?? config.minProbabilityScore,
               aiAnalysis, skippedAi, status,
               speedupStatistics: {
                   processed: cycleRef.current.processedCount,
                   qualified: cycleRef.current.qualifiedCount,
                   yield: cycleRef.current.processedCount > 0 ? cycleRef.current.qualifiedCount / cycleRef.current.processedCount : 0,
                   active: hasTriggeredSmartModeRef.current
               }
           };

           setResults(prev => [...prev, { type: 'PAPER', data: { paper, result } }]);
           
           if (status === 'QUALIFIED' || status === 'QUALIFIED_SPEEDUP') {
               exportCollector.push({ paper, result });
           }

           setStats(prev => ({
               ...prev,
               totalScanned: prev.totalScanned + 1,
               passedVector: prev.passedVector + (passedVector ? 1 : 0),
               aiAnalyzed: prev.aiAnalyzed + (skippedAi ? 0 : 1),
               qualified: prev.qualified + (status === 'QUALIFIED' || status === 'QUALIFIED_SPEEDUP' ? 1 : 0),
               speedupActive: hasTriggeredSmartModeRef.current,
               energySaved: prev.energySaved + (skippedAi ? 1 : 0)
           }));

           if (cycleRef.current.failFastTriggered) return true;
      }
      return false;
  };

  const handleRunCycle = async (mode: 'single' | 'cycle' = 'single') => {
      if (!aiServiceRef.current) {
          alert("Please configure AI Service first.");
          setShowSettings(true);
          return;
      }
      
      setIsProcessing(true);
      setResults([]); 
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      // Identify which items to run based on mode
      let targetIds: string[] = [];
      const currentQueue = queueRef.current;
      
      if (mode === 'single') {
          const first = currentQueue.find(q => q.status === 'READY' || q.status === 'NEEDS_ADJUSTMENT');
          if (first) targetIds = [first.id];
      } else {
          // Cycle mode: Run all pending items
          targetIds = currentQueue
              .filter(q => q.status === 'READY' || q.status === 'NEEDS_ADJUSTMENT')
              .map(q => q.id);
      }

      if (targetIds.length === 0) {
          alert("No pending queries found in queue.");
          setIsProcessing(false);
          return;
      }
      
      try {
          // Pre-compute sentence vectors once for the whole cycle if they are global config
          const validSentences = config.semanticSentences.filter(s => s.enabled);
          const validSentenceVectors = await Promise.all(
              validSentences.map(async (s) => ({
                  ...s,
                  vector: await aiServiceRef.current!.getEmbedding(s.text, signal)
              }))
          );
          const activeSentenceVectors = validSentenceVectors.filter(s => s.vector !== null);

          // Iterate through identified items
          for (const itemId of targetIds) {
              if (signal.aborted) break;

              // Find current index (it might have shifted if user edited, though processing locks editing)
              const qIdx = queueRef.current.findIndex(q => q.id === itemId);
              if (qIdx === -1) continue;
              
              const item = queueRef.current[qIdx];
              updateQueueStatus(qIdx, 'RUNNING');

              // Reset Cycle-Specific State for this Query
              cycleRef.current = { processedCount: 0, qualifiedCount: 0, failFastTriggered: false };
              hasTriggeredSmartModeRef.current = false;
              pendingSpeedupExportRef.current = []; 

              const STOP_LIMIT = item.stopRec && item.stopRec > 0 ? item.stopRec : 1000;
              const START_REC = item.startRec || 0;

              // Header
              const headerId = `cycle-${Date.now()}`;
              setResults(prev => [...prev, { 
                  type: 'HEADER', 
                  data: {
                    id: headerId,
                    query: item.query,
                    timestamp: Date.now(),
                    totalRecords: 0, // Initial placeholder
                    configSnapshot: {
                        vectorMin: item.vecMin ?? config.minVectorScore,
                        compMin: item.compMin ?? config.minCompositeScore,
                        probMin: item.probMin ?? config.minProbabilityScore,
                        gradingTopics: config.gradingTopics,
                        startRec: START_REC,
                        stopRec: STOP_LIMIT,
                        source: searchMode,
                        model: config.provider === 'gemini' ? config.geminiModel : config.ollamaModel,
                        speedUp: true, failFast: config.failFast,
                        speedupSampleCount: config.speedupSampleCount,
                        qualifyRate: config.speedupQualifyRate,
                        collection: item.collectionId || "Default",
                        mode: mode === 'cycle' ? "Automated Cycle" : "Single Query",
                        semanticRuleCount: activeSentenceVectors.length
                    }
                  }
              }]);

              const queryVector = await aiServiceRef.current!.getEmbedding(item.query, signal);
              
              // --- BATCH LOOP ---
              let currentStart = START_REC;
              const BATCH_SIZE = 20;
              let failFastStop = false;

              while (currentStart < STOP_LIMIT) {
                 if (signal.aborted) break;
                 if (cycleRef.current.failFastTriggered) {
                     failFastStop = true;
                     break;
                 }

                 const currentBatchSize = Math.min(BATCH_SIZE, STOP_LIMIT - currentStart);

                 let papers: Paper[] = [];
                 
                 if (searchMode === 'PUBMED') {
                     const { ids, total } = await getPubMedIds(item.query, currentStart, currentBatchSize, signal);
                     
                     // Update header total if it's the first batch of the cycle
                     if (currentStart === START_REC && total > 0) {
                         setResults(prev => prev.map(r => 
                            r.type === 'HEADER' && r.data.id === headerId 
                            ? { ...r, data: { ...r.data, totalRecords: total } } 
                            : r
                         ));
                     }

                     if (ids.length === 0) {
                         setResults(prev => [...prev, {
                             type: 'CYCLE_COMPLETE',
                             data: { id: 'exhausted-block', query: item.query, totalFound: cycleRef.current.processedCount, qualifiedCount: cycleRef.current.qualifiedCount, status: 'FAIL_FAST', failFastReason: `Source exhausted. No more records found after index ${currentStart}.` }
                         }]);
                         break; 
                     }
                     papers = await fetchPubMedPapers(ids, signal);
                     if (papers.length === 0) {
                         setResults(prev => [...prev, { 
                             type: 'PAPER', 
                             data: { 
                                 paper: { id: `err-${currentStart}`, title: 'Batch Fetch Failed', abstract: `Failed to download details for IDs: ${ids.slice(0,3).join(', ')}...`, authors: [], year: 0, url: '', source: 'PubMed' },
                                 result: { 
                                     paperId: 'error', querySource: item.query, vectorScore: 0, compositeScore: 0, matches: [], 
                                     passedVectorFilter: false, passedCompositeFilter: false, skippedAi: true, status: 'FILTERED_OUT' 
                                } 
                            } 
                         }]);
                         currentStart += BATCH_SIZE;
                         continue;
                     }
                 } else {
                     const { papers: semanticPapers, total } = await searchSemanticScholar(item.query, currentBatchSize, currentStart, signal);
                     papers = semanticPapers;

                     // Update header total if it's the first batch of the cycle
                     if (currentStart === START_REC && total > 0) {
                         setResults(prev => prev.map(r => 
                            r.type === 'HEADER' && r.data.id === headerId 
                            ? { ...r, data: { ...r.data, totalRecords: total } } 
                            : r
                         ));
                     }

                     if (papers.length === 0) {
                          setResults(prev => [...prev, {
                             type: 'CYCLE_COMPLETE',
                             data: { id: 'exhausted-block', query: item.query, totalFound: cycleRef.current.processedCount, qualifiedCount: cycleRef.current.qualifiedCount, status: 'FAIL_FAST', failFastReason: `No more records found in Semantic Scholar after index ${currentStart}.` }
                         }]);
                         break;
                     }
                 }

                 const shouldStop = await processPaperBatch(papers, queryVector, activeSentenceVectors, item, signal, pendingSpeedupExportRef.current);
                 if (shouldStop) {
                     failFastStop = true;
                     break;
                 }

                 currentStart += BATCH_SIZE;
              }

              const yieldStr = cycleRef.current.processedCount > 0 
                  ? `${((cycleRef.current.qualifiedCount / cycleRef.current.processedCount)*100).toFixed(0)}%` 
                  : '0%';
              
              const finalStatus = failFastStop ? 'NEEDS_ADJUSTMENT' : 'COMPLETED';
              updateQueueStatus(qIdx, finalStatus, { yield: yieldStr });

              if (!signal.aborted) {
                  const completeBlock: CycleCompleteData = {
                      id: `end-${headerId}`,
                      query: item.query,
                      totalFound: cycleRef.current.processedCount,
                      qualifiedCount: pendingSpeedupExportRef.current.length,
                      status: failFastStop ? 'FAIL_FAST' : 'COMPLETED',
                      failFastReason: failFastStop ? `Fail Fast Triggered: 0 qualified papers found in the first ${config.speedupSampleCount} processed items.` : undefined
                  };
                  setResults(prev => [...prev, { type: 'CYCLE_COMPLETE', data: completeBlock }]);
              }
          }

      } catch (e: any) {
          if (e.name !== 'AbortError') {
              console.error("Cycle Error:", e);
              alert(`Error: ${e.message}`);
          }
      } finally {
          setIsProcessing(false);
          setProcessingState(null);
          abortControllerRef.current = null;
      }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden font-sans text-slate-900">
      
      {/* NAVBAR */}
      <div className="bg-white border-b border-slate-200 h-14 flex items-center justify-between px-4 shadow-sm z-20 flex-shrink-0">
        <div className="flex items-center gap-3">
            <div className="bg-green-600 p-1.5 rounded-lg text-white shadow-sm">
                <Database size={18} />
            </div>
            <h1 className="font-bold text-lg text-slate-800 tracking-tight hidden md:block">EcoScholar AI <span className="text-slate-400 font-normal text-xs ml-2">v2.1</span></h1>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
             <button onClick={() => setSearchMode('PUBMED')} className={clsx("px-3 py-1 text-xs font-bold rounded-md flex items-center gap-2", searchMode === 'PUBMED' ? "bg-white text-blue-700 shadow-sm" : "text-slate-500")}><Search size={12} /> PubMed</button>
             <button onClick={() => setSearchMode('SEMANTIC')} className={clsx("px-3 py-1 text-xs font-bold rounded-md flex items-center gap-2", searchMode === 'SEMANTIC' ? "bg-white text-blue-700 shadow-sm" : "text-slate-500")}><Globe size={12} /> Semantic</button>
        </div>

        <div className="flex items-center gap-3">
             <button onClick={() => setUseWebScraping(!useWebScraping)} className={clsx("flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold", useWebScraping ? "bg-purple-100 border-purple-300 text-purple-700" : "bg-slate-50 border-slate-200 text-slate-400")}>{useWebScraping ? <ToggleRight size={16} /> : <ToggleLeft size={16} />} Deep Scraping</button>
             <button onClick={() => setUploadToZotero(!uploadToZotero)} className={clsx("flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold", uploadToZotero ? "bg-red-100 border-red-300 text-red-700" : "bg-blue-100 border-blue-300 text-blue-700")}>{uploadToZotero ? <Library size={14} /> : <FileText size={14} />} {uploadToZotero ? "Mode: Zotero" : "Mode: RIS File"}</button>
             <button onClick={handleExport} disabled={results.length === 0 || isProcessing || isUploading} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md disabled:opacity-50"><CloudUpload size={14} /> Export</button>
             <div className="h-6 w-px bg-slate-300 mx-2"></div>
             <button onClick={() => setShowSettings(!showSettings)} className={clsx("p-2 rounded-lg", showSettings ? "bg-slate-200 text-slate-800" : "hover:bg-slate-100 text-slate-500")}><Settings2 size={20} /></button>
        </div>
      </div>

      {/* MAIN */}
      <div className="flex-1 flex overflow-hidden relative">
          <NetworkSidebar logs={networkLogs} isProcessing={isProcessing} onCancel={handleCancel} onClearLogs={() => setNetworkLogs([])} />
          <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
             <div className="max-w-5xl mx-auto">
                {showSettings && <div className="mb-6"><SettingsPanel config={config} onUpdate={(c) => { setConfig(c); setShowSettings(false); }} onLog={handleNetworkLog} /></div>}
                <StatsPanel stats={stats} />
                {zoteroResults && (
                    <div className="mb-6 bg-white border border-slate-200 rounded-lg p-4 shadow-sm animate-fadeIn">
                        <div className="flex justify-between items-center mb-2 border-b border-slate-100 pb-2"><h3 className="font-bold text-sm text-slate-700">Export Results</h3><button onClick={() => setZoteroResults(null)}><XCircle size={16} className="text-slate-400 hover:text-red-500" /></button></div>
                        <div className="max-h-40 overflow-y-auto text-xs space-y-1">{zoteroResults.map((res, i) => (<div key={i} className="flex gap-2"><span className={clsx("font-bold w-20 flex-shrink-0", res.status === 'UPLOADED' ? 'text-green-600' : res.status === 'DUPLICATE' ? 'text-orange-500' : 'text-red-600')}>{res.status}</span><span className="truncate flex-1 text-slate-600">{res.paperTitle}</span></div>))}</div>
                    </div>
                )}
                
                {isQueryManagerOpen && <div className="mb-6"><QueryManager queue={queue} onUpdateQueue={setQueue} config={config} onRun={handleRunCycle} isProcessing={isProcessing} /></div>}

                <div className="space-y-4 pb-20">
                    {results.length === 0 && !isProcessing && (
                        <div className="text-center py-20 text-slate-400">
                            <div className="mb-4 flex justify-center opacity-20"><Database size={64} /></div>
                            <h3 className="text-lg font-bold">Ready to Analyze</h3>
                            <p className="text-sm">Configure your query above and start the cycle.</p>
                        </div>
                    )}

                    {results.map((item, index) => {
                        if (item.type === 'HEADER') return <CycleHeader key={item.data.id} header={item.data} />;
                        if (item.type === 'PAPER') return <PaperCard key={`${item.data.paper.id}-${index}`} paper={item.data.paper} result={item.data.result} />;
                        if (item.type === 'CYCLE_COMPLETE') return <CycleCompleteBlock key={item.data.id} data={item.data} onHarvest={async () => {}} />;
                        if (item.type === 'HARVEST_HEADER') return <HarvestHeader key={item.data.id} data={item.data} />;
                        return null;
                    })}
                    
                    {isProcessing && (
                         <div className="flex items-center justify-center gap-3 p-8 text-slate-500 animate-pulse">
                            <Activity className="animate-spin text-blue-500" />
                            <span className="font-mono text-sm">Processing...</span>
                         </div>
                    )}
                </div>
             </div>
          </div>
          <div className="w-[300px] border-l border-slate-200 bg-slate-50 p-4 hidden xl:flex flex-col gap-4">
              <QueuePanel queue={queue} onUpdateQueue={setQueue} isProcessing={isProcessing} onRun={() => handleRunCycle('cycle')} onCancel={handleCancel} onExpand={() => setShowQueueModal(true)} config={config} />
          </div>
      </div>
      
      {/* MANUAL CONTROLS OVERLAY */}
      {processingState && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-2xl z-50 animate-slideUp flex items-center justify-between gap-4 md:pl-[340px]">
              <div className="flex items-center gap-3 overflow-hidden">
                  <div className="bg-blue-100 p-2 rounded-full text-blue-600 animate-spin"><Activity size={20} /></div>
                  <div className="min-w-0">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">AI Analysis in Progress</div>
                      <div className="text-sm font-bold text-slate-800 truncate">{processingState.title}</div>
                  </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[10px] text-slate-400 italic hidden sm:inline">Auto-skip in 70s...</span>
                  <button 
                    onClick={onManualRetry}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded border border-slate-200"
                  >
                      <RotateCcw size={14} /> Retry Record
                  </button>
                  <button 
                    onClick={onManualSkip}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 font-bold text-xs rounded border border-orange-200"
                  >
                      <FastForward size={14} /> Skip / Abort
                  </button>
              </div>
          </div>
      )}

      <QueueModal isOpen={showQueueModal} onClose={() => setShowQueueModal(false)} queue={queue} onUpdateQueue={setQueue} isProcessing={isProcessing} onRun={() => { setShowQueueModal(false); handleRunCycle('cycle'); }} onCancel={handleCancel} config={config} />
    </div>
  );
};

export default App;
