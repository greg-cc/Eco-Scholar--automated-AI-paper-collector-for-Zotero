
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
  const avgVec = data.items.reduce((acc, i) => acc + i.result.vectorScore, 0) / count;
  const avgComp = data.items.reduce((acc, i) => acc + i.result.compositeScore, 0) / count;

  return (
    <div className="rounded-md border border-purple-200 shadow-sm bg-purple-50/30 overflow-hidden mb-2">
      {/* Header */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-purple-50 transition-colors select-none"
      >
        <button className="text-purple-400">
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-600">
            <FastForward size={16} fill="currentColor" />
        </div>

        <div className="flex-1">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                Turbo Download Records
                <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200 uppercase tracking-wide">
                    {count} Papers
                </span>
            </h3>
            <p className="text-xs text-slate-500">
                Auto-qualified via Turbo Mode (AI Analysis Skipped)
            </p>
        </div>

        <div className="hidden sm:flex flex-col items-end text-[10px] font-mono text-slate-400 mr-4">
            <div>Avg Vec: <span className="text-slate-600 font-bold">{avgVec.toFixed(2)}</span></div>
            <div>Avg Comp: <span className="text-slate-600 font-bold">{avgComp.toFixed(2)}</span></div>
        </div>

        <div className="bg-white p-2 rounded-full border border-purple-100 shadow-sm">
             <Download size={16} className="text-purple-600" />
        </div>
      </div>

      {/* Expanded List */}
      {isOpen && (
          <div className="border-t border-purple-100 bg-white">
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {data.items.map((item, idx) => (
                      <div key={idx} className="p-3 hover:bg-slate-50 flex items-start gap-3">
                          <div className="mt-0.5">
                              <CheckCircle2 size={14} className="text-purple-400" />
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
