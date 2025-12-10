
import React from 'react';
import { CycleCompleteData } from '../types';
import { Zap, AlertTriangle, Check } from 'lucide-react';
import { clsx } from 'clsx';

interface CycleCompleteBlockProps {
  data: CycleCompleteData;
  onHarvest: (data: CycleCompleteData) => Promise<void>;
}

const CycleCompleteBlock: React.FC<CycleCompleteBlockProps> = ({ data }) => {
  return (
    <div className="my-4 rounded-xl border-2 border-slate-200 bg-white overflow-hidden shadow-sm animate-fadeIn">
      {/* Header Bar */}
      <div className={clsx(
          "px-4 py-3 flex items-center justify-between",
          data.status === 'FAIL_FAST' ? "bg-orange-50 border-b border-orange-100" : "bg-green-50 border-b border-green-100"
      )}>
          <div className="flex items-center gap-3">
              {data.status === 'FAIL_FAST' ? (
                  <div className="bg-orange-100 text-orange-600 p-2 rounded-lg">
                      <AlertTriangle size={20} />
                  </div>
              ) : (
                  <div className="bg-green-100 text-green-600 p-2 rounded-lg">
                      <Zap size={20} fill="currentColor" />
                  </div>
              )}
              <div>
                  <h3 className={clsx("font-bold text-sm uppercase tracking-wide", data.status === 'FAIL_FAST' ? "text-orange-800" : "text-green-800")}>
                      Cycle Complete: {data.status === 'FAIL_FAST' ? "Interrupted" : "Success"}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Query: "{data.query}"</p>
              </div>
          </div>
          <div className="text-right hidden sm:block">
              <div className="text-[10px] uppercase font-bold text-slate-400">Total Scanned</div>
              <div className="text-2xl font-bold text-slate-800 leading-none">{data.totalFound}</div>
          </div>
      </div>

      {/* Stats Body */}
      <div className="p-4 flex flex-col sm:flex-row gap-4 items-center">
          <div className="flex-1 w-full grid grid-cols-2 gap-4">
               <div className="bg-slate-50 p-2 rounded border border-slate-100 text-center">
                   <div className="text-xs text-slate-400 font-bold uppercase">Qualified</div>
                   <div className="text-xl font-bold text-green-600">{data.qualifiedCount}</div>
               </div>
               <div className="bg-slate-50 p-2 rounded border border-slate-100 text-center">
                   <div className="text-xs text-slate-400 font-bold uppercase">Papers Processed</div>
                   <div className="text-xl font-bold text-slate-600">{data.totalFound}</div>
               </div>
          </div>

          {/* Status Indicator (No Action) */}
          <div className="w-full sm:w-auto">
              <div className="px-6 py-3 bg-slate-100 text-slate-400 rounded-lg font-bold text-sm border border-slate-200 flex items-center justify-center gap-2 cursor-default">
                  {data.status === 'FAIL_FAST' ? (
                       <>
                         <AlertTriangle size={16} />
                         <span>Stopped Early</span>
                       </>
                  ) : (
                       <>
                         <Check size={16} />
                         <span>All Records Processed</span>
                       </>
                  )}
              </div>
          </div>
      </div>
      
      {data.failFastReason && (
          <div className="px-4 pb-3">
              <p className="text-xs text-orange-600 bg-orange-50/50 p-2 rounded border border-orange-100">
                  <strong>Reason:</strong> {data.failFastReason}
              </p>
          </div>
      )}
    </div>
  );
};

export default CycleCompleteBlock;
