
import React from 'react';
import { QueueItem, AppConfig } from '../types';
import { PlayCircle, AlertCircle, CheckCircle, Loader2, Trash2, Ban, Maximize2 } from 'lucide-react';
import { clsx } from 'clsx';

interface QueuePanelProps {
  queue: QueueItem[];
  onUpdateQueue: (queue: QueueItem[]) => void;
  isProcessing: boolean;
  onRun: (mode: 'single' | 'cycle') => void;
  onCancel: () => void;
  onExpand: () => void; // New Prop
  config: AppConfig;
}

const QueuePanel: React.FC<QueuePanelProps> = ({ 
  queue, onUpdateQueue, isProcessing, onRun, onCancel, onExpand, config 
}) => {

  const updateItem = (id: string, field: keyof QueueItem, value: any) => {
    if (isProcessing) return; // Lock during processing
    const updated = queue.map(item => item.id === id ? { ...item, [field]: value } : item);
    onUpdateQueue(updated);
  };

  const handleDelete = (id: string) => {
    if (isProcessing) return;
    onUpdateQueue(queue.filter(item => item.id !== id));
  };

  const getStatusIcon = (item: QueueItem) => {
    switch (item.status) {
      case 'RUNNING': return <Loader2 size={14} className="animate-spin text-blue-600" />;
      case 'COMPLETED': return <CheckCircle size={14} className="text-green-600" />;
      case 'NEEDS_ADJUSTMENT': return <AlertCircle size={14} className="text-orange-600" />;
      case 'CANCELLED': return <Ban size={14} className="text-red-500" />;
      default: return <div className="w-3 h-3 rounded-full bg-slate-300" />;
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden h-[400px] flex-shrink-0">
      
      {/* Header / Toolbar */}
      <div className="p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
        <div className="flex items-center gap-2">
            <div>
                <h3 className="text-sm font-bold text-slate-800">Execution Queue</h3>
                <p className="text-[10px] text-slate-500">{queue.length} items • FailFast: {config.failFast ? 'ON' : 'OFF'}</p>
            </div>
            <button 
                onClick={onExpand}
                className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-blue-600 transition-colors"
                title="Expand Queue Manager"
            >
                <Maximize2 size={14} />
            </button>
        </div>
        
        {isProcessing ? (
            <button 
                onClick={onCancel}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold rounded transition-colors"
            >
                <Ban size={12} /> Stop
            </button>
        ) : (
            <button 
                onClick={() => onRun('cycle')}
                disabled={queue.length === 0}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold rounded transition-colors"
            >
                <PlayCircle size={12} /> Run All
            </button>
        )}
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto">
        {queue.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                <span className="text-xs italic">Queue empty. <br/>Add queries from search bar.</span>
            </div>
        ) : (
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-10 text-[10px] text-slate-500 uppercase font-semibold">
                <tr>
                    <th className="p-2 w-8 text-center">#</th>
                    <th className="p-2">Query</th>
                    <th className="p-1 w-10 text-center" title="Min Vector Score">Vec</th>
                    <th className="p-1 w-10 text-center" title="Min Composite Score">Comp</th>
                    <th className="p-1 w-10 text-center" title="Min Probability Score">Prob</th>
                    <th className="p-2 w-12 text-right">Yield</th>
                    <th className="p-2 w-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queue.map((item, idx) => (
                    <tr key={item.id} className={clsx("group hover:bg-slate-50 transition-colors", item.status === 'RUNNING' && "bg-blue-50/30")}>
                        <td className="p-2 text-center">
                            <div className="flex justify-center items-center h-full" title={item.status}>
                                {getStatusIcon(item)}
                            </div>
                        </td>
                        <td className="p-2">
                             <div className="relative">
                                <input 
                                    type="text" 
                                    value={item.query}
                                    onChange={(e) => updateItem(item.id, 'query', e.target.value)}
                                    disabled={isProcessing || item.status === 'COMPLETED'}
                                    className="w-full bg-transparent border-none p-0 text-xs font-medium text-slate-700 focus:ring-0 placeholder-slate-400 truncate"
                                />
                                {item.status === 'NEEDS_ADJUSTMENT' && (
                                    <div className="text-[10px] text-orange-600 font-bold mt-0.5">Fail Fast Triggered</div>
                                )}
                            </div>
                        </td>
                        <td className="p-1 text-center">
                            <input 
                                type="number" step="0.01"
                                value={item.vecMin ?? config.minVectorScore}
                                onChange={(e) => updateItem(item.id, 'vecMin', parseFloat(e.target.value))}
                                disabled={isProcessing}
                                className="w-full text-center text-[10px] bg-slate-50 border border-slate-200 rounded p-0.5 focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                        </td>
                        <td className="p-1 text-center">
                            <input 
                                type="number" step="0.1"
                                value={item.compMin ?? config.minCompositeScore}
                                onChange={(e) => updateItem(item.id, 'compMin', parseFloat(e.target.value))}
                                disabled={isProcessing}
                                className="w-full text-center text-[10px] bg-slate-50 border border-slate-200 rounded p-0.5 focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                        </td>
                        <td className="p-1 text-center">
                            <input 
                                type="number" step="1" max="10"
                                value={item.probMin ?? config.minProbabilityScore}
                                onChange={(e) => updateItem(item.id, 'probMin', parseFloat(e.target.value))}
                                disabled={isProcessing}
                                className="w-full text-center text-[10px] bg-slate-50 border border-slate-200 rounded p-0.5 focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                        </td>
                        <td className="p-2 text-right">
                             <span className={clsx(
                                 "text-[10px] font-mono font-bold",
                                 item.status === 'NEEDS_ADJUSTMENT' ? "text-orange-600" : "text-slate-600"
                             )}>
                                {item.yield || '-'}
                             </span>
                        </td>
                        <td className="p-2 text-center">
                            {!isProcessing && (
                                <button onClick={() => handleDelete(item.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                                    <Trash2 size={12} />
                                </button>
                            )}
                        </td>
                    </tr>
                ))}
              </tbody>
            </table>
        )}
      </div>
    </div>
  );
};

export default QueuePanel;
