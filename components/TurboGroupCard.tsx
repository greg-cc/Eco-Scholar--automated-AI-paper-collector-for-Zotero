
import React, { useState } from 'react';
import { TurboGroupData } from '../types';
import { FastForward, ChevronDown, ChevronRight, CheckCircle2, Download } from 'lucide-react';
import { clsx } from 'clsx';

interface TurboGroupCardProps {
  data: TurboGroupData;
}

const TurboGroupCard: React.FC<TurboGroupCardProps> = ({ data }) => {
  const [isOpen, setIsOpen] = useState(false);
  const count = data.items.length;

  // Calculate averages for display
  const avgVec = count > 0 ? data.items.reduce((acc, i) => acc + i.result.vectorScore, 0) / count : 0;
  const avgComp = count > 0 ? data.items.reduce((acc, i) => acc + i.result.compositeScore, 0) / count : 0;

  return (
    <div className="rounded-md border-l-4 border-l-purple-500 border-y border-r border-purple-200 shadow-sm bg-purple-50/50 overflow-hidden mb-2 transition-all">
      {/* Header */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-purple-100 transition-colors select-none"
      >
        <button className="text-purple-400 hover:text-purple-600">
            {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </button>

        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-purple-200 text-purple-700 shadow-sm">
            <FastForward size={20} fill="currentColor" />
        </div>

        <div className="flex-1">
            <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-purple-900">Speedup Batch Download</h3>
                <span className="text-[10px] bg-purple-600 text-white px-2 py-0.5 rounded-full font-bold shadow-sm">
                    {count} PAPERS
                </span>
            </div>
            <p className="text-xs text-purple-700/70 mt-0.5">
                AI Analysis Skipped (High Confidence Lock)
            </p>
        </div>

        <div className="hidden sm:flex flex-col items-end text-[10px] font-mono text-purple-400 mr-4">
            <div>Avg Vec: <span className="text-purple-800 font-bold">{avgVec.toFixed(2)}</span></div>
            <div>Avg Comp: <span className="text-purple-800 font-bold">{avgComp.toFixed(2)}</span></div>
        </div>

        <div className="bg-white p-2 rounded-full border border-purple-200 shadow-sm hover:bg-purple-50 hover:border-purple-300">
             <Download size={18} className="text-purple-600" />
        </div>
      </div>

      {/* Expanded List */}
      {isOpen && (
          <div className="border-t border-purple-200 bg-white animate-fadeIn">
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {data.items.map((item, idx) => (
                      <div key={idx} className="p-3 hover:bg-slate-50 flex items-start gap-3">
                          <div className="mt-0.5">
                              <CheckCircle2 size={14} className="text-purple-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-slate-700 truncate">{item.paper.title}</div>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex gap-3">
                                  <span>{item.paper.authors[0]} ({item.paper.year})</span>
                                  <span>Vec: {item.result.vectorScore.toFixed(2)}</span>
                                  <span>Comp: {item.result.compositeScore.toFixed(2)}</span>
                              </div>
                          </div>
                          <a 
                            href={item.paper.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-500 hover:underline whitespace-nowrap"
                          >
                              View Source
                          </a>
                      </div>
                  ))}
              </div>
          </div>
      )}
    </div>
  );
};

export default TurboGroupCard;
