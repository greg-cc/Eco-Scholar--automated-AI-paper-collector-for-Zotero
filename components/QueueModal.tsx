
import React from 'react';
import { QueueItem, AppConfig } from '../types';
import { X, PlayCircle, AlertCircle, CheckCircle, Loader2, FastForward, Edit3, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';

interface QueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  queue: QueueItem[];
  onUpdateQueue: (queue: QueueItem[]) => void;
  isProcessing: boolean;
  onRun: (mode: 'single' | 'cycle') => void;
  onCancel: () => void;
  config: AppConfig;
}

const QueueModal: React.FC<QueueModalProps> = ({ 
  isOpen, onClose, queue, onUpdateQueue, isProcessing, onRun, onCancel, config 
}) => {
  if (!isOpen) return null;

  const handleQueryChange = (id: string, newQuery: string) => {
    if (isProcessing) return; // Lock during processing
    const updated = queue.map(item => item.id === id ? { ...item, query: newQuery } : item);
    onUpdateQueue(updated);
  };

  const handleDelete = (id: string) => {
    if (isProcessing) return;
    onUpdateQueue(queue.filter(item => item.id !== id));
  };

  const getStatusBadge = (item: QueueItem) => {
    switch (item.status) {
      case 'RUNNING':
        return (
          <span className="flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full border border-blue-200">
            <Loader2 size={12} className="animate-spin" /> Running
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-200">
            <CheckCircle size={12} /> Complete
          </span>
        );
      case 'NEEDS_ADJUSTMENT':
        return (
          <span className="flex items-center gap-1 text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-full border border-orange-200">
            <AlertCircle size={12} /> Needs Adjustment
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="text-xs font-bold text-red-500 bg-red-50 px-2 py-1 rounded-full border border-red-200">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full border border-slate-200">
            Ready
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col animate-fadeIn">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-slate-200 bg-slate-50 rounded-t-xl">
          <div className="flex items-center gap-3">
             <div className="bg-blue-600 text-white p-2 rounded-lg">
                <FastForward size={20} />
             </div>
             <div>
                <h2 className="text-lg font-bold text-slate-800">Query Execution Queue (Editable)</h2>
                <p className="text-xs text-slate-500">Manage batch priorities and monitor Fail Fast triggers</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
            <X size={20} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-2 border-b border-slate-200 flex items-center gap-4 bg-white">
            <div className="flex-1"></div>
            {isProcessing ? (
                <button 
                    onClick={onCancel}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg shadow-sm transition-all"
                >
                    Stop Processing
                </button>
            ) : (
                <button 
                    onClick={() => onRun('cycle')}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg shadow-sm transition-all"
                >
                    <PlayCircle size={16} /> Run Queue
                </button>
            )}
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-auto bg-slate-50 p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200">
                  <th className="p-3 w-10 text-center">#</th>
                  <th className="p-3 w-40">Run Status</th>
                  <th className="p-3">Query String</th>
                  <th className="p-3 w-32">Vec Min</th>
                  <th className="p-3 w-24">Yield</th>
                  <th className="p-3 w-24">Info</th>
                  <th className="p-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queue.length === 0 ? (
                    <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                            Queue is empty. Add queries in the main dashboard or paste them here.
                        </td>
                    </tr>
                ) : (
                    queue.map((item, idx) => (
                    <tr key={item.id} className={clsx("hover:bg-slate-50 transition-colors", item.status === 'RUNNING' && "bg-blue-50/30")}>
                        <td className="p-3 text-center text-xs text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-3">
                            {getStatusBadge(item)}
                        </td>
                        <td className="p-3">
                            <div className="relative">
                                <input 
                                    type="text" 
                                    value={item.query}
                                    onChange={(e) => handleQueryChange(item.id, e.target.value)}
                                    disabled={isProcessing || item.status === 'COMPLETED'}
                                    className="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none py-1 text-sm text-slate-800 disabled:text-slate-500"
                                />
                                {!isProcessing && item.status !== 'COMPLETED' && (
                                    <Edit3 size={10} className="absolute right-0 top-2 text-slate-300 pointer-events-none" />
                                )}
                            </div>
                        </td>
                        <td className="p-3 text-xs font-mono text-slate-500">
                            {config.minVectorScore.toFixed(2)}
                        </td>
                        <td className="p-3 text-xs font-mono font-bold text-slate-700">
                            {item.yield || '-'}
                        </td>
                        <td className="p-3 text-xs text-slate-500">
                            {item.status === 'NEEDS_ADJUSTMENT' ? (
                                <span className="text-orange-600 font-bold">Fail Fast Triggered</span>
                            ) : (
                                <span>{config.speedupSampleCount} samples</span>
                            )}
                        </td>
                        <td className="p-3 text-center">
                            {!isProcessing && (
                                <button onClick={() => handleDelete(item.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </td>
                    </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 flex justify-between">
            <span>Total Queries: {queue.length}</span>
            <span>Queries marked "Needs Adjustment" failed the Smart Speedup Qualification Threshold ({config.speedupQualifyRate * 100}%)</span>
        </div>
      </div>
    </div>
  );
};

export default QueueModal;
