
import React, { useState, useEffect, useRef } from 'react';
import { QueueItem, AppConfig, QueueStatus } from '../types';
import { PlayCircle, Trash2, Save, FolderOpen, RefreshCcw, Plus, CheckSquare, Square, Check, RotateCcw, Wrench, Download, Upload } from 'lucide-react';
import { clsx } from 'clsx';

interface QueryManagerProps {
  queue: QueueItem[];
  onUpdateQueue: (queue: QueueItem[]) => void;
  config: AppConfig;
  onRun: (mode: 'single' | 'cycle') => void;
  isProcessing: boolean;
}

interface SavedQueueConfig {
  name: string;
  queue: QueueItem[];
  date: number;
}

const QueryManager: React.FC<QueryManagerProps> = ({ queue, onUpdateQueue, config, onRun, isProcessing }) => {
  // UI State
  const [queryMode, setQueryMode] = useState<'single' | 'cycle'>('cycle');
  
  // Bulk Adjust State
  const [globalVecAdjust, setGlobalVecAdjust] = useState<string>('0.00');
  const [globalCompAdjust, setGlobalCompAdjust] = useState<string>('0.00');
  const [globalProbAdjust, setGlobalProbAdjust] = useState<string>('0');

  const [globalStart, setGlobalStart] = useState<number>(0);
  const [globalStop, setGlobalStop] = useState<number>(1000);
  
  const [configName, setConfigName] = useState('');
  const [selectedConfig, setSelectedConfig] = useState('');
  const [savedConfigs, setSavedConfigs] = useState<SavedQueueConfig[]>([]);

  // File Input Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load saved configs on mount
  useEffect(() => {
    const saved = localStorage.getItem('ecoscholar_queue_configs');
    if (saved) {
      try {
        setSavedConfigs(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load queue configs");
      }
    }
  }, []);

  const handleBulkVecApply = () => {
    const adjustment = parseFloat(globalVecAdjust);
    if (isNaN(adjustment)) return;

    const updated = queue.map(item => {
      if (item.selected || !queue.some(q => q.selected)) { // Apply to selected or ALL if none selected
        const currentVec = item.vecMin ?? config.minVectorScore;
        return { ...item, vecMin: parseFloat((currentVec + adjustment).toFixed(2)) };
      }
      return item;
    });
    onUpdateQueue(updated);
  };

  const handleBulkCompApply = () => {
    const adjustment = parseFloat(globalCompAdjust);
    if (isNaN(adjustment)) return;

    const updated = queue.map(item => {
      if (item.selected || !queue.some(q => q.selected)) {
        const currentComp = item.compMin ?? config.minCompositeScore;
        return { ...item, compMin: parseFloat((currentComp + adjustment).toFixed(2)) };
      }
      return item;
    });
    onUpdateQueue(updated);
  };

  const handleBulkProbApply = () => {
    const adjustment = parseFloat(globalProbAdjust);
    if (isNaN(adjustment)) return;

    const updated = queue.map(item => {
      if (item.selected || !queue.some(q => q.selected)) {
        const currentProb = item.probMin ?? config.minProbabilityScore;
        const newProb = currentProb + adjustment;
        // Probability is typically an integer 0-10, but we allow float adjustments if user desires
        // We'll round to 1 decimal place to be safe
        return { ...item, probMin: parseFloat(newProb.toFixed(1)) };
      }
      return item;
    });
    onUpdateQueue(updated);
  };

  const handleBulkRangeApply = () => {
    const updated = queue.map(item => {
      if (item.selected || !queue.some(q => q.selected)) {
        return { ...item, startRec: globalStart, stopRec: globalStop };
      }
      return item;
    });
    onUpdateQueue(updated);
  };

  const handleResetDefaults = () => {
    if (confirm("Reset all selected items to global defaults?")) {
      const updated = queue.map(item => {
         if (item.selected || !queue.some(q => q.selected)) {
            return { 
                ...item, 
                vecMin: undefined, 
                compMin: undefined, 
                probMin: undefined, 
                startRec: 0, 
                stopRec: 1000 
            };
         }
         return item;
      });
      onUpdateQueue(updated);
    }
  };

  const handleSelectAll = () => {
    const allSelected = queue.every(q => q.selected);
    const updated = queue.map(q => ({ ...q, selected: !allSelected }));
    onUpdateQueue(updated);
  };

  const handleDeleteSelected = () => {
    const updated = queue.filter(q => !q.selected);
    onUpdateQueue(updated);
  };

  // CSV Operations
  const handleExportCSV = () => {
    const headers = ["Query", "CollectionID", "VecMin", "CompMin", "ProbMin", "StartRec", "StopRec"];
    const csvRows = [
        headers.join(","),
        ...queue.map(item => {
             const q = (item.query || "").replace(/"/g, '""');
             const c = (item.collectionId || "").replace(/"/g, '""');
             const v = item.vecMin ?? config.minVectorScore;
             const cm = item.compMin ?? config.minCompositeScore;
             const p = item.probMin ?? config.minProbabilityScore;
             const start = item.startRec ?? 0;
             const stop = item.stopRec ?? 1000;
             return `"${q}","${c}",${v},${cm},${p},${start},${stop}`;
        })
    ];

    const blob = new Blob([csvRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `queue_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportClick = () => {
      fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
          const text = e.target?.result as string;
          if (!text) return;
          
          const lines = text.split('\n');
          const newItems: QueueItem[] = [];
          
          // Basic CSV Parsing (assuming matching structure)
          for (let i = 1; i < lines.length; i++) {
              const line = lines[i].trim();
              if (!line) continue;
              
              // Simple regex to parse CSV taking quoted strings into account
              // Matches quoted strings OR non-comma sequences
              const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
              
              // Fallback split if regex fails or simple structure
              let parts: string[] = [];
              if (!line.includes('"')) {
                  parts = line.split(',');
              } else {
                  // Manual parse for robustness with quotes
                  let current = '';
                  let inQuotes = false;
                  for (let j = 0; j < line.length; j++) {
                      const char = line[j];
                      if (char === '"' && (j === 0 || line[j-1] !== '\\')) {
                           inQuotes = !inQuotes;
                      } else if (char === ',' && !inQuotes) {
                           parts.push(current);
                           current = '';
                      } else {
                           current += char;
                      }
                  }
                  parts.push(current);
              }

              // Clean quotes
              const cleanParts = parts.map(p => p.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
              
              if (cleanParts.length >= 7) {
                  newItems.push({
                      id: `q-imp-${Date.now()}-${i}`,
                      query: cleanParts[0],
                      collectionId: cleanParts[1],
                      vecMin: parseFloat(cleanParts[2]),
                      compMin: parseFloat(cleanParts[3]),
                      probMin: parseFloat(cleanParts[4]),
                      startRec: parseInt(cleanParts[5]),
                      stopRec: parseInt(cleanParts[6]),
                      status: 'READY',
                      selected: false
                  });
              }
          }
          
          if (newItems.length > 0) {
              if (confirm(`Found ${newItems.length} items. Append to current queue? (Click Cancel to Replace)`)) {
                   onUpdateQueue([...queue, ...newItems]);
              } else {
                   onUpdateQueue(newItems);
              }
          } else {
              alert("Could not parse valid queue items from file.");
          }

          if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsText(file);
  };

  const addNewRow = () => {
    const newItem: QueueItem = {
      id: `q-${Date.now()}`,
      query: "New Query...",
      status: 'READY',
      vecMin: config.minVectorScore,
      compMin: config.minCompositeScore,
      probMin: config.minProbabilityScore,
      startRec: 0,
      stopRec: 1000,
      selected: false
    };
    onUpdateQueue([...queue, newItem]);
  };

  // Field Updates
  const updateItem = (id: string, field: keyof QueueItem, value: any) => {
    const updated = queue.map(item => item.id === id ? { ...item, [field]: value } : item);
    onUpdateQueue(updated);
  };

  const toggleSelect = (id: string) => {
      const updated = queue.map(item => item.id === id ? { ...item, selected: !item.selected } : item);
      onUpdateQueue(updated);
  }

  // File I/O
  const saveConfig = () => {
    if (!configName) return;
    const newConfig: SavedQueueConfig = { name: configName, queue, date: Date.now() };
    const updated = [...savedConfigs.filter(c => c.name !== configName), newConfig];
    setSavedConfigs(updated);
    localStorage.setItem('ecoscholar_queue_configs', JSON.stringify(updated));
    alert("Queue configuration saved.");
    setConfigName('');
  };

  const loadConfig = () => {
    const target = savedConfigs.find(c => c.name === selectedConfig);
    if (target) {
        if(confirm(`Load configuration '${target.name}'? Current queue will be replaced.`)) {
            onUpdateQueue(target.queue);
        }
    }
  };

  return (
    <div className="bg-white border-b border-slate-200 shadow-sm">
      
      {/* 1. QUERY MODE */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-6">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <RefreshCcw size={14} /> Query Mode
        </h3>
        <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
                <input 
                    type="radio" name="queryMode" 
                    checked={queryMode === 'single'} 
                    onChange={() => setQueryMode('single')}
                    className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-700">Single Query</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
                <input 
                    type="radio" name="queryMode" 
                    checked={queryMode === 'cycle'} 
                    onChange={() => setQueryMode('cycle')}
                    className="text-red-600 focus:ring-red-500"
                />
                <span className="text-sm font-bold text-slate-800">Automated Cycle</span>
            </label>
        </div>
      </div>

      {/* 2. GLOBAL BULK ADJUSTMENTS */}
      <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
         <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Wrench size={14} /> Global Bulk Adjustments
         </h3>
         
         <div className="flex flex-wrap items-end gap-4">
             {/* Vector Adjust */}
             <div className="flex-1 min-w-[140px] max-w-xs">
                 <label className="block text-xs font-semibold text-slate-600 mb-1">Vector Adjust (+/-)</label>
                 <div className="flex">
                    <input 
                        type="number" step="0.01"
                        value={globalVecAdjust}
                        onChange={(e) => setGlobalVecAdjust(e.target.value)}
                        className="w-full p-2 text-sm border border-r-0 border-slate-300 rounded-l focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                    <button 
                        onClick={handleBulkVecApply}
                        className="bg-white border border-slate-300 px-2 text-[10px] font-bold text-slate-700 hover:bg-slate-100 rounded-r uppercase"
                    >
                        Apply
                    </button>
                 </div>
             </div>

             {/* Composite Adjust */}
             <div className="flex-1 min-w-[140px] max-w-xs">
                 <label className="block text-xs font-semibold text-slate-600 mb-1">Composite Adjust (+/-)</label>
                 <div className="flex">
                    <input 
                        type="number" step="0.1"
                        value={globalCompAdjust}
                        onChange={(e) => setGlobalCompAdjust(e.target.value)}
                        className="w-full p-2 text-sm border border-r-0 border-slate-300 rounded-l focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                    <button 
                        onClick={handleBulkCompApply}
                        className="bg-white border border-slate-300 px-2 text-[10px] font-bold text-slate-700 hover:bg-slate-100 rounded-r uppercase"
                    >
                        Apply
                    </button>
                 </div>
             </div>

             {/* Probability Adjust */}
             <div className="flex-1 min-w-[140px] max-w-xs">
                 <label className="block text-xs font-semibold text-slate-600 mb-1">Prob Adjust (+/-)</label>
                 <div className="flex">
                    <input 
                        type="number" step="1"
                        value={globalProbAdjust}
                        onChange={(e) => setGlobalProbAdjust(e.target.value)}
                        className="w-full p-2 text-sm border border-r-0 border-slate-300 rounded-l focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                    <button 
                        onClick={handleBulkProbApply}
                        className="bg-white border border-slate-300 px-2 text-[10px] font-bold text-slate-700 hover:bg-slate-100 rounded-r uppercase"
                    >
                        Apply
                    </button>
                 </div>
             </div>

             {/* Range Set */}
             <div className="flex-1 min-w-[280px] max-w-md">
                 <label className="block text-xs font-semibold text-slate-600 mb-1">Set All Start # / Stop #</label>
                 <div className="flex gap-2">
                    <div className="flex items-center flex-1 bg-white border border-slate-300 rounded px-2">
                        <span className="text-xs text-slate-400 mr-2">Start</span>
                        <input 
                            type="number" 
                            value={globalStart}
                            onChange={(e) => setGlobalStart(parseInt(e.target.value))}
                            className="w-full py-1.5 text-sm outline-none"
                        />
                    </div>
                    <div className="flex items-center flex-1 bg-white border border-slate-300 rounded px-2">
                        <span className="text-xs text-slate-400 mr-2">Stop</span>
                        <input 
                            type="number" 
                            value={globalStop}
                            onChange={(e) => setGlobalStop(parseInt(e.target.value))}
                            className="w-full py-1.5 text-sm outline-none"
                        />
                    </div>
                 </div>
             </div>
             
             <button 
                onClick={handleBulkRangeApply}
                className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded hover:bg-slate-50 shadow-sm"
            >
                Apply Range to All
             </button>

             <div className="flex-1 text-right">
                <button 
                    onClick={handleResetDefaults}
                    className="px-4 py-2 bg-white border border-slate-300 text-slate-500 text-xs font-bold rounded hover:text-red-600 hover:border-red-200 shadow-sm transition-colors"
                >
                    Reset Defaults
                </button>
             </div>
         </div>
      </div>

      {/* 3. QUEUE TABLE */}
      <div className="p-6">
        <div className="flex justify-between items-center mb-2">
             <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <ListIcon /> Query Execution Queue (Editable)
             </h3>
        </div>

        <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm bg-white">
            <div className="overflow-auto max-h-[300px]">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase">
                            <th className="p-3 w-10 text-center cursor-pointer hover:bg-slate-100" onClick={handleSelectAll}>
                                <CheckSquare size={14} className="mx-auto" />
                            </th>
                            <th className="p-3 w-24">Run Status</th>
                            <th className="p-3 min-w-[200px]">Query String</th>
                            <th className="p-3 w-32">Collection ID</th>
                            <th className="p-3 w-24 text-center">Vec Min</th>
                            <th className="p-3 w-24 text-center">Comp Min</th>
                            <th className="p-3 w-24 text-center">Prob Min</th>
                            <th className="p-3 w-24 text-center">Start #</th>
                            <th className="p-3 w-24 text-center">Stop #</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {queue.map((item) => (
                            <tr key={item.id} className={clsx("hover:bg-slate-50 transition-colors", item.selected && "bg-blue-50/50")}>
                                <td className="p-3 text-center">
                                    <button onClick={() => toggleSelect(item.id)} className="text-slate-400 hover:text-blue-600">
                                        {item.selected ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}
                                    </button>
                                </td>
                                <td className="p-3">
                                    <StatusBadge status={item.status} />
                                </td>
                                <td className="p-3">
                                    <input 
                                        type="text" 
                                        value={item.query} 
                                        onChange={(e) => updateItem(item.id, 'query', e.target.value)}
                                        className="w-full bg-transparent border-none text-sm focus:ring-0 p-0 font-medium text-slate-800"
                                        placeholder="Enter query..."
                                    />
                                </td>
                                <td className="p-3">
                                    <input 
                                        type="text" 
                                        value={item.collectionId || ''} 
                                        onChange={(e) => updateItem(item.id, 'collectionId', e.target.value)}
                                        className="w-full bg-transparent border-b border-transparent hover:border-slate-300 text-xs focus:ring-0 p-1"
                                        placeholder="Default"
                                    />
                                </td>
                                <td className="p-3 text-center">
                                    <input 
                                        type="number" step="0.01"
                                        value={item.vecMin ?? config.minVectorScore}
                                        onChange={(e) => updateItem(item.id, 'vecMin', parseFloat(e.target.value))}
                                        className="w-16 text-center text-xs bg-slate-50 border border-slate-200 rounded p-1"
                                    />
                                </td>
                                <td className="p-3 text-center">
                                    <input 
                                        type="number" step="0.1"
                                        value={item.compMin ?? config.minCompositeScore}
                                        onChange={(e) => updateItem(item.id, 'compMin', parseFloat(e.target.value))}
                                        className="w-16 text-center text-xs bg-slate-50 border border-slate-200 rounded p-1"
                                    />
                                </td>
                                <td className="p-3 text-center">
                                    <input 
                                        type="number" step="1" max="10"
                                        value={item.probMin ?? config.minProbabilityScore}
                                        onChange={(e) => updateItem(item.id, 'probMin', parseFloat(e.target.value))}
                                        className="w-16 text-center text-xs bg-slate-50 border border-slate-200 rounded p-1"
                                    />
                                </td>
                                <td className="p-3 text-center">
                                    <input 
                                        type="number"
                                        value={item.startRec ?? 0}
                                        onChange={(e) => updateItem(item.id, 'startRec', parseInt(e.target.value))}
                                        className="w-16 text-center text-xs bg-white border-none p-0 focus:ring-0"
                                    />
                                </td>
                                <td className="p-3 text-center">
                                    <input 
                                        type="number"
                                        value={item.stopRec ?? 1000}
                                        onChange={(e) => updateItem(item.id, 'stopRec', parseInt(e.target.value))}
                                        className="w-16 text-center text-xs bg-white border-none p-0 focus:ring-0"
                                    />
                                </td>
                            </tr>
                        ))}
                        {queue.length === 0 && (
                            <tr>
                                <td colSpan={10} className="p-8 text-center text-slate-400 italic bg-slate-50">
                                    Queue is empty. Add a query below or load a configuration.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        <div className="mt-3 flex gap-2">
            <button onClick={addNewRow} className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded text-xs font-bold hover:bg-blue-100">
                <Plus size={14} /> Add Query Row
            </button>
            <button onClick={handleDeleteSelected} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-500 rounded text-xs font-bold hover:text-red-600 hover:border-red-200">
                <Trash2 size={14} /> Delete Selected
            </button>
            
            <div className="h-6 w-px bg-slate-300 mx-2"></div>

            <button onClick={handleExportCSV} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded text-xs font-bold hover:bg-slate-50">
                <Download size={14} /> Export CSV
            </button>
            
            <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden" 
                accept=".csv"
            />
            <button onClick={handleImportClick} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded text-xs font-bold hover:bg-slate-50">
                <Upload size={14} /> Import CSV
            </button>

            <div className="flex-1"></div>
            <button 
                onClick={() => onRun(queryMode)} 
                disabled={isProcessing || queue.length === 0}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded shadow-sm font-bold text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <PlayCircle size={16} /> Run {queryMode === 'cycle' ? 'Cycle' : 'Query'}
            </button>
        </div>
      </div>

      {/* 4. LOAD / SAVE CONFIGURATION */}
      <div className="px-6 py-6 bg-slate-50 border-t border-slate-200">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <FolderOpen size={14} /> Load / Save Full Configuration
        </h3>
        
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col md:flex-row gap-6 items-end">
            <div className="flex-1 w-full">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Select Config</label>
                <div className="flex gap-2">
                    <select 
                        className="flex-1 p-2 text-sm border border-slate-300 rounded bg-slate-50 focus:ring-1 focus:ring-blue-500"
                        value={selectedConfig}
                        onChange={(e) => setSelectedConfig(e.target.value)}
                    >
                        <option value="">-- Choose saved config --</option>
                        {savedConfigs.map(c => <option key={c.name} value={c.name}>{c.name} ({new Date(c.date).toLocaleDateString()})</option>)}
                    </select>
                </div>
            </div>

            <div className="flex-1 w-full">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Or create new file name</label>
                <input 
                    type="text" 
                    placeholder="my_research_config"
                    value={configName}
                    onChange={(e) => setConfigName(e.target.value)}
                    className="w-full p-2 text-sm border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 bg-slate-50"
                />
            </div>
            
            <div className="flex gap-2">
                <button 
                    onClick={saveConfig}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded hover:bg-slate-50 shadow-sm"
                >
                    <Save size={14} /> Save
                </button>
                <button 
                    onClick={loadConfig}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold rounded hover:bg-amber-100 shadow-sm"
                >
                    <FolderOpen size={14} /> Load
                </button>
            </div>
        </div>
      </div>

    </div>
  );
};

const StatusBadge = ({ status }: { status: QueueStatus }) => {
    const styles = {
        'READY': 'bg-slate-100 text-slate-500 border-slate-200',
        'RUNNING': 'bg-blue-100 text-blue-700 border-blue-200',
        'COMPLETED': 'bg-green-100 text-green-700 border-green-200',
        'NEEDS_ADJUSTMENT': 'bg-orange-100 text-orange-700 border-orange-200',
        'CANCELLED': 'bg-red-100 text-red-700 border-red-200',
    };
    
    return (
        <span className={clsx("text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 w-fit", styles[status])}>
            {status === 'COMPLETED' && <Check size={10} />}
            {status}
        </span>
    );
}

const ListIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
        <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
)

export default QueryManager;
