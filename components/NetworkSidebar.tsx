
import React, { useEffect, useRef, useState } from 'react';
import { NetworkLog } from '../types';
import { Activity, ArrowUp, ArrowDown, XCircle, Clock, Terminal, Octagon, Maximize2, Minimize2, ChevronDown, ChevronRight, ZapOff, Eye, EyeOff } from 'lucide-react';
import { clsx } from 'clsx';

interface NetworkSidebarProps {
  logs: NetworkLog[];
  isProcessing: boolean;
  onCancel: () => void;
  onClearLogs: () => void;
}

const NetworkSidebar: React.FC<NetworkSidebarProps> = ({ logs, isProcessing, onCancel, onClearLogs }) => {
  const endRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [showFullDetails, setShowFullDetails] = useState(false);

  // Auto-scroll to bottom if not viewing history
  useEffect(() => {
    if (!selectedLogId) {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, selectedLogId]);

  const toggleLog = (id: string) => {
      setSelectedLogId(selectedLogId === id ? null : id);
  }

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'GET': return 'text-blue-400';
      case 'POST': return 'text-green-400';
      case 'INFO': return 'text-purple-400';
      default: return 'text-slate-400';
    }
  };

  const getStatusColor = (status?: number) => {
    if (!status) return 'text-slate-500';
    if (status >= 200 && status < 300) return 'text-green-500';
    if (status >= 400) return 'text-red-500';
    return 'text-yellow-500';
  };

  return (
    <div className={clsx(
        "bg-[#0b1120] text-slate-200 flex flex-col h-full border-r border-slate-700 shadow-xl z-30 transition-all duration-300",
        isExpanded ? "w-full md:w-2/3 lg:w-1/2 absolute left-0 h-full" : "w-[320px] relative"
    )}>
      
      {/* Header / Control */}
      <div className="p-4 border-b border-slate-700 bg-[#0f172a] flex flex-col gap-2">
        <div className="flex justify-between items-center mb-1">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Terminal size={14} /> Network Stream
            </h2>
            <button onClick={() => setIsExpanded(!isExpanded)} className="text-slate-500 hover:text-white transition-colors">
                {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
        </div>

        {/* 1. Main Process Abort */}
        <button
          onClick={onCancel}
          disabled={!isProcessing}
          className={clsx(
            "w-full py-2 rounded font-bold text-xs shadow-md flex items-center justify-center gap-2 transition-all",
            isProcessing 
              ? "bg-red-600 hover:bg-red-700 text-white animate-pulse" 
              : "bg-slate-800 text-slate-600 cursor-not-allowed"
          )}
        >
          <Octagon size={14} fill={isProcessing ? "currentColor" : "none"} />
          {isProcessing ? "ABORT PROCESS" : "IDLE"}
        </button>

        <div className="grid grid-cols-2 gap-2 mt-1">
            {/* 2. Force Kill Button */}
            <button
                onClick={onCancel}
                className="py-2 bg-red-900/40 hover:bg-red-900/60 border border-red-900/50 text-red-400 rounded text-[10px] font-bold flex items-center justify-center gap-1 transition-colors"
                title="Force cancellation signal to stop hanging Ollama requests"
            >
                <ZapOff size={12} /> KILL OLLAMA
            </button>

            {/* 3. Toggle Details Button */}
            <button
                onClick={() => setShowFullDetails(!showFullDetails)}
                className={clsx(
                    "py-2 border rounded text-[10px] font-bold flex items-center justify-center gap-1 transition-colors",
                    showFullDetails 
                        ? "bg-blue-900/40 border-blue-800 text-blue-300" 
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                )}
                title="Automatically show request/response bodies"
            >
                {showFullDetails ? <EyeOff size={12} /> : <Eye size={12} />} 
                {showFullDetails ? "HIDE DETAILS" : "SHOW DETAILS"}
            </button>
        </div>
      </div>

      {/* Log Feed */}
      <div className="flex-1 overflow-y-auto p-2 font-mono text-[10px] space-y-2 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
        {logs.length === 0 && (
          <div className="text-center text-slate-600 mt-10 italic">
            Waiting for network traffic...
          </div>
        )}
        
        {logs.map((log) => {
          const d = new Date(log.timestamp);
          const timeStr = d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
          const msStr = d.getMilliseconds().toString().padStart(3, '0');
          const isOpen = selectedLogId === log.id || showFullDetails;

          return (
          <div 
            key={log.id} 
            className={clsx(
                "rounded p-2 border transition-all cursor-pointer", 
                isOpen ? "bg-[#1e293b] border-slate-500" : "bg-[#0f172a] border-slate-700/50 hover:border-slate-600"
            )}
            onClick={() => toggleLog(log.id)}
          >
            
            {/* Row 1: Time & Source */}
            <div className="flex justify-between items-center mb-1 text-slate-500 pointer-events-none">
               <span className="flex items-center gap-1">
                 {isOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                 {`${timeStr}.${msStr}`}
               </span>
               <span className={clsx("font-bold uppercase px-1 rounded text-[9px]", log.source === 'Ollama' ? "bg-orange-900/30 text-orange-400" : (log.source === 'Zotero' ? "bg-red-900/30 text-red-400" : "bg-blue-900/30 text-blue-400"))}>
                 {log.source}
               </span>
            </div>

            {/* Row 2: Type & URL */}
            <div className="flex items-start gap-2 mb-1 pointer-events-none">
               <div className="mt-0.5">
                 {log.type === 'req' && <ArrowUp size={10} className="text-blue-400" />}
                 {log.type === 'res' && <ArrowDown size={10} className="text-green-400" />}
                 {log.type === 'err' && <XCircle size={10} className="text-red-500" />}
               </div>
               <div className="break-all leading-tight">
                 <span className={clsx("font-bold mr-1", getMethodColor(log.method))}>{log.method}</span>
                 <span className="text-slate-300 opacity-80">{log.url}</span>
               </div>
            </div>

            {/* Row 3: Details / Status */}
            <div className="flex justify-between items-center mt-1 border-t border-slate-800 pt-1 pointer-events-none">
                <span className={clsx("font-bold", getStatusColor(log.status))}>
                   {log.status ? `HTTP ${log.status}` : (log.type === 'req' ? 'Pending...' : (log.type === 'err' ? 'FAILED' : 'INFO'))}
                </span>
                {log.duration && (
                   <span className="flex items-center gap-1 text-slate-500">
                      <Clock size={8} /> {log.duration.toFixed(0)}ms
                   </span>
                )}
            </div>
            
            {/* Details Field (Visible for ALL types now) */}
            {log.details && (
                <div className="mt-1 text-slate-400 italic break-words bg-slate-800/50 p-1 rounded pointer-events-none border-l-2 border-slate-600">
                    {log.details}
                </div>
            )}

            {/* Expanded Details: Payloads */}
            {isOpen && (
                <div className="mt-2 pt-2 border-t border-slate-700 space-y-2 cursor-text" onClick={e => e.stopPropagation()}>
                    {log.requestBody && (
                        <div>
                            <div className="text-[9px] font-bold text-blue-300 mb-1">Verbose Request Dump:</div>
                            <pre className="text-[9px] bg-black/50 p-2 rounded text-slate-300 overflow-x-auto max-h-[800px] scrollbar-thin whitespace-pre-wrap break-all border border-slate-800/50">
                                {log.requestBody}
                            </pre>
                        </div>
                    )}
                    {log.responseBody && (
                        <div>
                            <div className="text-[9px] font-bold text-green-300 mb-1">Verbose Response Dump:</div>
                            <pre className="text-[9px] bg-black/50 p-2 rounded text-slate-300 overflow-x-auto max-h-[800px] scrollbar-thin whitespace-pre-wrap break-all border border-slate-800/50">
                                {log.responseBody}
                            </pre>
                        </div>
                    )}
                    {!log.requestBody && !log.responseBody && (
                        <div className="text-slate-600 italic text-[9px]">No additional binary/text payload captured.</div>
                    )}
                </div>
            )}
          </div>
        )})}
        <div ref={endRef} />
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-slate-700 bg-[#0f172a] flex justify-between">
          <button onClick={onClearLogs} className="text-[10px] text-slate-500 hover:text-white transition-colors">
              Clear Logs
          </button>
          <div className="text-[10px] text-slate-500 flex items-center gap-1">
              <Activity size={10} className={isProcessing ? "text-green-500 animate-pulse" : "text-slate-600"} />
              {isProcessing ? "Live" : "Standby"}
          </div>
      </div>

    </div>
  );
};

export default NetworkSidebar;
