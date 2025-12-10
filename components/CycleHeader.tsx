
import React, { useEffect, useState } from 'react';
import { CycleHeaderData } from '../types';
import { RefreshCw, Rocket, Settings, ListFilter, Gauge, Database } from 'lucide-react';

interface CycleHeaderProps {
  header: CycleHeaderData;
}

const CycleHeader: React.FC<CycleHeaderProps> = ({ header }) => {
  const { query, timestamp, configSnapshot, totalRecords } = header;

  const StatItem = ({ label, value, sub }: { label: string; value: string | number | boolean; sub?: string }) => (
    <div className="flex flex-col min-w-[80px]">
      <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">{label}</span>
      <span className="text-xs font-semibold text-slate-700 truncate" title={String(value)}>
        {typeof value === 'boolean' ? (value ? 'ON' : 'OFF') : value}
        {sub && <span className="text-[9px] font-normal text-slate-400 ml-1">{sub}</span>}
      </span>
    </div>
  );

  return (
    <div className="mt-8 mb-6 animate-fadeIn border-t-4 border-slate-200 pt-6">
      
      {/* Top Banner / Cycle ID */}
      <div className="flex justify-between items-center mb-2 px-1">
        <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">ID: {header.id.split('-').slice(1).join('-')}</span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs font-mono text-slate-400">{new Date(timestamp).toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Main Header Card */}
      <div className="bg-white rounded-lg border border-slate-300 shadow-sm overflow-hidden">
        
        {/* Title Strip */}
        <div className="bg-slate-50 p-3 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-1.5 rounded-md text-blue-700">
                    <Rocket size={18} />
                </div>
                <div>
                    <h3 className="font-bold text-slate-800 text-base leading-tight">Query: "{query}"</h3>
                    <p className="text-[10px] text-slate-500 font-mono">Run Configuration Audit</p>
                </div>
            </div>
            <div className="text-right hidden sm:block">
                <div className="text-[10px] uppercase font-bold text-slate-400">Model</div>
                <div className="text-xs font-bold text-slate-700">{configSnapshot.model}</div>
            </div>
        </div>

        {/* Detailed Stats Grid */}
        <div className="p-4 bg-slate-50/50">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-6">
                
                {/* Column 1: Thresholds */}
                <div className="space-y-3">
                     <div className="flex items-center gap-1.5 text-slate-400 mb-1 border-b border-slate-200 pb-1">
                        <ListFilter size={10} />
                        <span className="text-[9px] font-bold uppercase">Filtering</span>
                     </div>
                     <StatItem label="Vector Min" value={configSnapshot.vectorMin.toFixed(2)} />
                     <StatItem label="Composite Min" value={configSnapshot.compMin.toFixed(2)} />
                     <StatItem label="Prob. Thresh" value={configSnapshot.probMin} sub="/ 10" />
                     <StatItem label="Semantic Rules" value={configSnapshot.semanticRuleCount} />
                </div>

                {/* Column 2: Automation */}
                <div className="space-y-3">
                     <div className="flex items-center gap-1.5 text-slate-400 mb-1 border-b border-slate-200 pb-1">
                        <Gauge size={10} />
                        <span className="text-[9px] font-bold uppercase">Speedup / FailFast</span>
                     </div>
                     <StatItem label="Fail Fast" value={configSnapshot.failFast} />
                     <StatItem label="Smart Speedup" value={configSnapshot.speedUp} />
                     <StatItem label="Qualify Rate" value={`${(configSnapshot.qualifyRate * 100).toFixed(0)}%`} />
                     <StatItem label="Sample Size" value={configSnapshot.speedupSampleCount} sub="papers" />
                </div>

                {/* Column 3: Source Config */}
                <div className="space-y-3">
                     <div className="flex items-center gap-1.5 text-slate-400 mb-1 border-b border-slate-200 pb-1">
                        <Settings size={10} />
                        <span className="text-[9px] font-bold uppercase">Source / Scope</span>
                     </div>
                     <StatItem label="Source" value={configSnapshot.source} />
                     <StatItem label="Range" value={`${configSnapshot.startRec} - ${configSnapshot.stopRec}`} />
                     {totalRecords !== undefined ? (
                         <StatItem label="DB Total" value={totalRecords.toLocaleString()} sub="records" />
                     ) : (
                         <StatItem label="Collection" value={configSnapshot.collection} />
                     )}
                     <StatItem label="Mode" value={configSnapshot.mode} />
                </div>

                {/* Column 4: Topics (Span full height) */}
                <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-1 border-b border-slate-200 pb-1">
                        <ListFilter size={10} />
                        <span className="text-[9px] font-bold uppercase">Grading Topics</span>
                     </div>
                    <div className="flex flex-wrap gap-1">
                        {configSnapshot.gradingTopics.length > 0 ? (
                            configSnapshot.gradingTopics.slice(0, 8).map((topic, i) => (
                                <span key={i} className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">
                                    {topic}
                                </span>
                            ))
                        ) : <span className="text-[10px] text-slate-400 italic">Default</span>}
                        {configSnapshot.gradingTopics.length > 8 && (
                            <span className="text-[10px] text-slate-400">+{configSnapshot.gradingTopics.length - 8} more</span>
                        )}
                    </div>
                </div>

            </div>
        </div>
      </div>
    </div>
  );
};

export default CycleHeader;
