
import React, { useEffect, useState, useRef } from 'react';
import { CycleReportData } from '../types';
import { Rocket, Zap, AlertTriangle, Loader2, Download, PlayCircle, FastForward, Check } from 'lucide-react';
import { clsx } from 'clsx';

interface CycleReportModalProps {
  data: CycleReportData | null;
  onRunTurboJob: (continueQuery?: boolean) => Promise<void>;
}

const CycleReportModal: React.FC<CycleReportModalProps> = ({ data, onRunTurboJob }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState<'normal' | 'continue'>('normal');
  const [harvestComplete, setHarvestComplete] = useState(false);
  const prevQueryRef = useRef<string | undefined>(undefined);
  
  useEffect(() => {
    if (data) {
        // Detect if this is a new cycle or just an update to the current one
        if (data.query !== prevQueryRef.current) {
            setIsProcessing(false);
            setMode('normal');
            setHarvestComplete(false);
            prevQueryRef.current = data.query;
        } else {
            // It's an update to the current cycle (e.g. stats updated after harvest)
            if (mode === 'continue') {
                setIsProcessing(false);
                // Do not reset harvestComplete here, let the action handler set it
            }
        }
    }
  }, [data, mode]);

  const executeJob = async (continueQuery: boolean) => {
      if (isProcessing) return;
      setIsProcessing(true);
      if (continueQuery) setMode('continue');
      
      try {
        await onRunTurboJob(continueQuery);
        if (continueQuery) {
            setHarvestComplete(true);
            // isProcessing is handled by useEffect when data updates, 
            // but if no data update happens (edge case), unlock here:
            setIsProcessing(false);
        }
      } catch (e: any) {
        console.error("Job execution failed:", e);
        setIsProcessing(false); 
        alert(`Job Failed: ${e.message || 'Unknown Error'}`);
      }
  };

  if (!data) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden scale-100 transform transition-all border border-slate-700">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
                <Rocket size={120} />
            </div>
            <h2 className="text-2xl font-bold flex items-center gap-2 relative z-10">
                <Zap className="text-yellow-400 fill-yellow-400" /> Cycle Complete
            </h2>
            <p className="text-slate-400 text-sm mt-1 relative z-10">Review results and confirm export to proceed.</p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
            
            <div className="text-center border-b border-slate-100 pb-4">
                <h3 className="text-xl font-bold text-slate-800 mb-2">{data.query}</h3>
                <div className="flex justify-center items-center gap-2">
                     <span className={clsx("px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider", data.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700')}>
                         {data.status === 'COMPLETED' ? 'Cycle Success' : 'Fail Fast Triggered'}
                     </span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                    <div className="text-3xl font-bold text-slate-700">{data.totalFound}</div>
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">Papers Scanned</div>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                    <div className="text-3xl font-bold text-green-600">{data.qualifiedCount}</div>
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">Qualified Matches</div>
                </div>
            </div>

            {data.failFastReason && !harvestComplete && (
                <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="text-orange-600 shrink-0 mt-0.5" size={20} />
                    <p className="text-sm text-orange-800">
                        <strong>Fail Fast Triggered:</strong> {data.failFastReason}
                    </p>
                </div>
            )}

            <div className="bg-blue-50 border border-blue-100 p-5 rounded-xl flex items-center justify-between">
                <div>
                    <h4 className="font-bold text-blue-900 text-base flex items-center gap-2">
                        <Download size={18} /> Ready to Export
                    </h4>
                    <p className="text-sm text-blue-700 mt-1">
                        {data.qualifiedCount > 0 
                            ? `${data.qualifiedCount} qualified papers waiting for export.`
                            : "No papers qualified in this cycle."}
                    </p>
                </div>
            </div>

            <div className="space-y-3 pt-2">
                {/* PRIMARY ACTION: Export & Next */}
                <button 
                    onClick={() => executeJob(false)}
                    disabled={isProcessing && mode === 'continue'}
                    className={clsx(
                        "w-full py-3 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-3 text-lg border-2",
                        isProcessing && mode === 'normal'
                            ? "bg-slate-400 border-slate-400 cursor-wait opacity-50"
                            : "bg-green-600 border-green-600 hover:bg-green-700 hover:border-green-700 active:scale-95",
                        isProcessing && mode === 'continue' && "opacity-30 cursor-not-allowed"
                    )}
                >
                    {isProcessing && mode === 'normal' ? (
                        <>
                            <Loader2 size={24} className="animate-spin" />
                            <span>Exporting...</span>
                        </>
                    ) : (
                        <>
                            <PlayCircle size={24} fill="currentColor" className="text-green-800" />
                            <span>Run Export & Next Cycle</span>
                        </>
                    )}
                </button>

                {/* SECONDARY ACTION: Harvest Remaining (Speedup) */}
                {/* Show if we are in a COMPLETED state OR Fail Fast state (allowing override) */}
                {!harvestComplete ? (
                    <button 
                        onClick={() => executeJob(true)}
                        disabled={isProcessing}
                        className={clsx(
                            "w-full py-3 font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-3 text-sm border",
                            isProcessing && mode === 'continue'
                                ? "bg-purple-100 border-purple-200 text-purple-400 cursor-wait"
                                : "bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100 hover:border-purple-300",
                            isProcessing && mode === 'normal' && "opacity-30 cursor-not-allowed"
                        )}
                    >
                        {isProcessing && mode === 'continue' ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                <span>Harvesting Remaining Records...</span>
                            </>
                        ) : (
                            <>
                                <FastForward size={18} />
                                <span>Harvest Remaining (Max 1000)</span>
                            </>
                        )}
                    </button>
                ) : (
                    <div className="w-full py-3 bg-green-50 border border-green-200 rounded-xl flex items-center justify-center gap-2 text-green-700 font-bold text-sm animate-fadeIn">
                        <Check size={18} /> Harvest Completed.
                    </div>
                )}
            </div>
            
        </div>
      </div>
    </div>
  );
};

export default CycleReportModal;
