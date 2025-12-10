
import React, { useState, useEffect, useMemo } from 'react';
import { FeedItem, AppConfig, Paper, ProcessingResult, CycleHeaderData, NetworkLog } from '../types';
import { ZoteroService } from '../services/zoteroService';
import { X, Sliders, RefreshCw, Trash2, Download, CheckCircle, AlertTriangle, CloudUpload, Search, FileText } from 'lucide-react';
import { clsx } from 'clsx';
import { generateRIS, downloadRIS } from '../services/exportService';

interface ExportReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: FeedItem[];
  config: AppConfig;
  onLog: (log: NetworkLog) => void;
}

interface CycleGroup {
  id: string; // Header ID
  query: string;
  header: CycleHeaderData;
  papers: { paper: Paper; result: ProcessingResult }[]; // All papers scanned in this cycle
  
  // Dynamic State
  dynVecMin: number;
  dynCompMin: number;
  excludedIds: Set<string>; // IDs removed via Duplicate Check or Manual Delete
  
  // Status flags
  isCheckingDupes: boolean;
  isUploading: boolean;
  uploadStatus?: string;
}

const ExportReviewModal: React.FC<ExportReviewModalProps> = ({ isOpen, onClose, results, config, onLog }) => {
  const [cycles, setCycles] = useState<CycleGroup[]>([]);

  // Initialize Data Structure on Open
  useEffect(() => {
    if (isOpen && results.length > 0) {
        const groups: CycleGroup[] = [];
        let currentGroup: CycleGroup | null = null;

        results.forEach(item => {
            if (item.type === 'HEADER') {
                // Start new group
                currentGroup = {
                    id: item.data.id,
                    query: item.data.query,
                    header: item.data,
                    papers: [],
                    // Initialize dynamic filters with the snapshot values used during the run
                    dynVecMin: item.data.configSnapshot.vectorMin,
                    dynCompMin: item.data.configSnapshot.compMin,
                    excludedIds: new Set(),
                    isCheckingDupes: false,
                    isUploading: false
                };
                groups.push(currentGroup);
            } else if (item.type === 'PAPER' && currentGroup) {
                currentGroup.papers.push(item.data);
            }
        });
        setCycles(groups);
    }
  }, [isOpen, results]);

  const updateCycle = (index: number, updates: Partial<CycleGroup>) => {
      setCycles(prev => prev.map((c, i) => i === index ? { ...c, ...updates } : c));
  };

  const handleRemoveDuplicate = (cycleIndex: number, paperId: string) => {
      setCycles(prev => {
          const newCycles = [...prev];
          const cycle = newCycles[cycleIndex];
          const newExcluded = new Set(cycle.excludedIds);
          newExcluded.add(paperId);
          cycle.excludedIds = newExcluded;
          return newCycles;
      });
  };

  const handleCheckDuplicates = async (index: number) => {
      const cycle = cycles[index];
      const zotero = new ZoteroService({
          apiKey: config.zoteroApiKey,
          libraryId: config.zoteroLibraryId,
          useLocal: config.useLocalZotero,
          ip: config.zoteroIp,
          port: config.zoteroPort,
          onLog
      });

      updateCycle(index, { isCheckingDupes: true });

      // Only check papers that are currently passing the dynamic filter
      const visiblePapers = getVisiblePapers(cycle);
      const duplicatesFound: string[] = [];

      try {
          // Check in batches to avoid overwhelming Zotero
          const BATCH_SIZE = 5;
          for (let i = 0; i < visiblePapers.length; i += BATCH_SIZE) {
              const batch = visiblePapers.slice(i, i + BATCH_SIZE);
              await Promise.all(batch.map(async (item) => {
                  const status = await zotero.checkDuplicateStatus(item.paper);
                  if (status === 'DUPLICATE') {
                      duplicatesFound.push(item.paper.id);
                  }
              }));
          }
          
          // Update exclusions
          setCycles(prev => {
            const newCycles = [...prev];
            const target = newCycles[index];
            const newExcluded = new Set(target.excludedIds);
            duplicatesFound.forEach(id => newExcluded.add(id));
            target.excludedIds = newExcluded;
            target.isCheckingDupes = false;
            return newCycles;
          });
          
          if (duplicatesFound.length === 0) alert("No duplicates found in Zotero.");

      } catch (e) {
          console.error("Duplicate check failed", e);
          updateCycle(index, { isCheckingDupes: false });
          alert("Error checking duplicates. See network logs.");
      }
  };

  const handleUpload = async (index: number) => {
      const cycle = cycles[index];
      const itemsToUpload = getVisiblePapers(cycle);

      if (itemsToUpload.length === 0) {
          alert("No papers match current filters.");
          return;
      }

      updateCycle(index, { isUploading: true, uploadStatus: undefined });

      try {
        // Determine mode: Zotero API vs RIS
        const useZotero = !(!config.useLocalZotero && (!config.zoteroApiKey || !config.zoteroLibraryId)); // Rough check

        if (useZotero) {
            const zotero = new ZoteroService({
                apiKey: config.zoteroApiKey,
                libraryId: config.zoteroLibraryId,
                useLocal: config.useLocalZotero,
                ip: config.zoteroIp,
                port: config.zoteroPort,
                onLog
            });
            
            const results = await zotero.uploadItems(itemsToUpload);
            const successCount = results.filter(r => r.status === 'UPLOADED').length;
            const errCount = results.filter(r => r.status === 'ERROR').length;
            const dupCount = results.filter(r => r.status === 'DUPLICATE').length;

            updateCycle(index, { 
                isUploading: false, 
                uploadStatus: `Upload Complete. Success: ${successCount}, Duplicates: ${dupCount}, Errors: ${errCount}` 
            });
        } else {
            // Fallback to RIS
            const ris = generateRIS(itemsToUpload);
            downloadRIS(ris, `cycle_export_${cycle.id}.ris`);
            updateCycle(index, { isUploading: false, uploadStatus: "RIS File Downloaded" });
        }

      } catch (e: any) {
          updateCycle(index, { isUploading: false, uploadStatus: `Error: ${e.message}` });
      }
  };

  const getVisiblePapers = (group: CycleGroup) => {
      return group.papers.filter(p => {
          // 1. Must pass DYNAMIC filters
          const passedVec = p.result.vectorScore >= group.dynVecMin;
          const passedComp = p.result.compositeScore >= group.dynCompMin;
          
          // 2. Must not be manually excluded (Duplicate)
          const notExcluded = !group.excludedIds.has(p.paper.id);

          return (passedVec || passedComp) && notExcluded;
      });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center flex-shrink-0">
             <div>
                 <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                     <Sliders size={20} className="text-blue-600" /> Export Review
                 </h2>
                 <p className="text-sm text-slate-500">Dynamically adjust filters and check for duplicates before exporting.</p>
             </div>
             <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500">
                 <X size={24} />
             </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-100">
            {cycles.map((cycle, cIdx) => {
                const visiblePapers = getVisiblePapers(cycle);
                const excludedCount = cycle.excludedIds.size;
                
                return (
                    <div key={cycle.id} className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
                        {/* Cycle Header */}
                        <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cycle Query</div>
                                <h3 className="text-lg font-bold text-slate-800">{cycle.query}</h3>
                            </div>
                            <div className="flex items-center gap-6">
                                {/* Dynamic Filters */}
                                <div className="flex items-center gap-2 bg-white p-2 rounded border border-slate-200 shadow-sm">
                                    <div className="flex flex-col w-24">
                                        <label className="text-[9px] font-bold text-slate-400 uppercase">Min Vector</label>
                                        <input 
                                            type="number" step="0.01" min="0" max="1"
                                            value={cycle.dynVecMin}
                                            onChange={(e) => updateCycle(cIdx, { dynVecMin: parseFloat(e.target.value) })}
                                            className="font-mono font-bold text-sm text-blue-600 outline-none border-b border-slate-200 focus:border-blue-500"
                                        />
                                    </div>
                                    <div className="flex flex-col w-24">
                                        <label className="text-[9px] font-bold text-slate-400 uppercase">Min Composite</label>
                                        <input 
                                            type="number" step="0.1" min="-5" max="5"
                                            value={cycle.dynCompMin}
                                            onChange={(e) => updateCycle(cIdx, { dynCompMin: parseFloat(e.target.value) })}
                                            className="font-mono font-bold text-sm text-green-600 outline-none border-b border-slate-200 focus:border-green-500"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Action Bar */}
                        <div className="p-3 bg-blue-50/30 border-b border-slate-200 flex flex-wrap gap-3 items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-600 bg-white px-2 py-1 rounded border border-slate-200">
                                    Total Scanned: {cycle.papers.length}
                                </span>
                                <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-1 rounded border border-green-200">
                                    Passing Filter: {visiblePapers.length}
                                </span>
                                {excludedCount > 0 && (
                                    <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded border border-red-200">
                                        Duplicates Removed: {excludedCount}
                                    </span>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <button 
                                    onClick={() => handleCheckDuplicates(cIdx)}
                                    disabled={cycle.isCheckingDupes || visiblePapers.length === 0}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded hover:bg-slate-50 disabled:opacity-50"
                                >
                                    {cycle.isCheckingDupes ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                                    Remove Zotero Duplicates
                                </button>
                                
                                <button 
                                    onClick={() => handleUpload(cIdx)}
                                    disabled={cycle.isUploading || visiblePapers.length === 0}
                                    className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white text-xs font-bold rounded shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {cycle.isUploading ? <RefreshCw size={14} className="animate-spin" /> : <CloudUpload size={14} />}
                                    Upload {visiblePapers.length} Papers
                                </button>
                            </div>
                        </div>

                        {/* Status Message */}
                        {cycle.uploadStatus && (
                            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-mono text-slate-700">
                                &gt; {cycle.uploadStatus}
                            </div>
                        )}

                        {/* Paper List */}
                        <div className="max-h-[300px] overflow-y-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 font-bold sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="p-3 w-16 text-center">Action</th>
                                        <th className="p-3">Paper Title</th>
                                        <th className="p-3 w-24 text-right">Vec Score</th>
                                        <th className="p-3 w-24 text-right">Comp Score</th>
                                        <th className="p-3 w-24 text-right">AI Score</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-xs">
                                    {visiblePapers.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                                                No papers match the current filters (Vec &gt;= {cycle.dynVecMin}, Comp &gt;= {cycle.dynCompMin}).<br/>
                                                Try lowering the thresholds above.
                                            </td>
                                        </tr>
                                    ) : (
                                        visiblePapers.map((item, idx) => (
                                            <tr key={item.paper.id} className="hover:bg-blue-50/50 transition-colors group">
                                                <td className="p-2 text-center">
                                                    <button 
                                                        onClick={() => handleRemoveDuplicate(cIdx, item.paper.id)}
                                                        className="text-slate-300 hover:text-red-500 transition-colors"
                                                        title="Mark as duplicate / Remove from export"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                                <td className="p-2 font-medium text-slate-700">
                                                    <div className="truncate max-w-[400px]" title={item.paper.title}>
                                                        {item.paper.title}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 font-mono">
                                                        {item.paper.authors[0]} ({item.paper.year})
                                                    </div>
                                                </td>
                                                <td className={clsx("p-2 text-right font-mono", item.result.vectorScore >= cycle.dynVecMin ? "text-green-600 font-bold" : "text-slate-400")}>
                                                    {item.result.vectorScore.toFixed(3)}
                                                </td>
                                                <td className={clsx("p-2 text-right font-mono", item.result.compositeScore >= cycle.dynCompMin ? "text-green-600 font-bold" : "text-slate-400")}>
                                                    {item.result.compositeScore.toFixed(2)}
                                                </td>
                                                <td className="p-2 text-right font-mono">
                                                    {item.result.aiAnalysis?.score ?? '-'}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })}
            
            {cycles.length === 0 && (
                <div className="text-center p-12 text-slate-400">
                    <AlertTriangle size={48} className="mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-bold">No Data Available</h3>
                    <p>Run a query cycle to populate results for review.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default ExportReviewModal;
