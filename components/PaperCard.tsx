
import React, { useState } from 'react';
import { Paper, ProcessingResult } from '../types';
import { Check, X, AlertTriangle, ChevronRight, ChevronDown, PenTool, Leaf, FlaskConical, Sprout } from 'lucide-react';
import { clsx } from 'clsx';

interface PaperCardProps {
  paper: Paper;
  result: ProcessingResult;
}

const PaperCard: React.FC<PaperCardProps> = ({ paper, result }) => {
  const [isOpen, setIsOpen] = useState(false);

  const isQualified = result.status === 'QUALIFIED' || result.status === 'QUALIFIED_TURBO';
  const isRejected = result.status === 'AI_REJECTED';
  const isFiltered = result.status === 'FILTERED_OUT';
  const isTurbo = result.status === 'QUALIFIED_TURBO';
  const ai = result.aiAnalysis;

  // Determine status color/icon
  let statusColor = 'text-slate-500';
  let statusBg = 'bg-white';
  let statusBorder = 'border-slate-200';
  let Icon = AlertTriangle;

  if (isQualified || isTurbo) {
    statusColor = 'text-green-600';
    statusBg = 'bg-white';
    statusBorder = 'border-green-200';
    Icon = Check;
  } else if (isRejected) {
    statusColor = 'text-blue-600';
    Icon = AlertTriangle;
  } else if (isFiltered) {
    statusColor = 'text-slate-400';
    Icon = X;
  }

  // Helper to split comma separated strings into plain text lists
  const renderList = (text: string | undefined) => {
    if (!text || text === 'None') return <span className="text-slate-400 italic">None</span>;
    return <span className="text-slate-800">{text}</span>;
  };

  const renderMultiLineList = (text: string | undefined) => {
      if (!text || text === 'None') return <span className="text-slate-400 italic">None</span>;
      return <div className="text-slate-800 whitespace-pre-line">{text}</div>;
  }

  // Helper to process summary bullets (from AI) - HARDENED against undefined
  const renderSummary = (summary: string | undefined) => {
      if (!summary) return <span className="text-slate-400 italic">No summary generated.</span>;
      
      try {
        const formatted = String(summary)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br/>');
        return <p className="text-xs text-slate-700 leading-relaxed" dangerouslySetInnerHTML={{__html: formatted}} />;
      } catch (e) {
          return <span className="text-red-400 text-xs">Error displaying summary.</span>;
      }
  };
  
  // Formatters for header stats
  const formatStat = (actual: number, min?: number) => {
      if (min === undefined) return actual.toFixed(2);
      return `${actual.toFixed(2)}/${min.toFixed(2)}`;
  };
  
  const formatProb = (actual?: number, min?: number) => {
      const actVal = actual !== undefined ? actual : '-';
      const minVal = min !== undefined ? min : '-';
      return `${actVal}/${minVal}`;
  };

  return (
    <div className={clsx("rounded-md border shadow-sm transition-all overflow-hidden mb-2", statusBorder)}>
      
      {/* HEADER */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
            "flex items-center gap-2 p-2 cursor-pointer hover:bg-slate-50 transition-colors text-xs font-mono select-none border-b",
            statusBg,
            statusBorder
        )}
      >
        <button className="text-slate-400">
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        
        {/* Status Icon Box */}
        <div className={clsx("flex items-center justify-center w-5 h-5 rounded text-white font-bold flex-shrink-0", isQualified ? "bg-green-500" : (isRejected ? "bg-blue-500" : "bg-slate-300"))}>
            <Icon size={12} strokeWidth={4} />
        </div>

        {/* Title */}
        <div className="flex-1 truncate flex items-center gap-2 min-w-0">
            <span className={clsx("font-bold flex-shrink-0", isQualified ? "text-green-700" : "text-blue-700")}>
                [Score: {ai?.score ?? 0}/10]
            </span>
            <span className="text-slate-700 truncate font-sans font-medium" title={paper.title}>{paper.title}</span>
        </div>
        
        {/* Detailed Metrics in Header */}
        <div className="hidden sm:flex items-center gap-3 text-[10px] text-slate-500 font-mono">
            <div className={clsx("flex flex-col items-end leading-none", result.passedVectorFilter ? "text-green-600" : "text-red-400")}>
                <span className="text-[8px] uppercase font-bold text-slate-400">Vec</span>
                <span>{formatStat(result.vectorScore, result.vectorMin)}</span>
            </div>
            <div className={clsx("flex flex-col items-end leading-none", result.passedCompositeFilter ? "text-green-600" : "text-red-400")}>
                <span className="text-[8px] uppercase font-bold text-slate-400">Comp</span>
                <span>{formatStat(result.compositeScore, result.compositeMin)}</span>
            </div>
            {ai && (
                <div className={clsx("flex flex-col items-end leading-none", (ai.probability || 0) >= (result.probabilityMin || 0) ? "text-green-600" : "text-orange-400")}>
                    <span className="text-[8px] uppercase font-bold text-slate-400">Prob</span>
                    <span>{formatProb(ai.probability, result.probabilityMin)}</span>
                </div>
            )}
        </div>

        {/* Saved Tag */}
        <div className="text-slate-400 font-bold ml-2 flex-shrink-0">
            {isQualified ? "SAVED" : isFiltered ? "FILTERED" : "REJECTED"}
        </div>
      </div>

      {/* REPORT BODY */}
      {isOpen && (
        <div className="p-4 bg-white space-y-6">
            
            {/* 1. CITATION DATA */}
            <section>
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1 mb-2">1. Citation Data</h3>
                <div className="text-xs text-slate-600 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
                    <div><span className="font-bold">Authors:</span> {paper.authors?.join(', ') || 'Unknown'}</div>
                    <div><span className="font-bold">Year:</span> {paper.year}</div>
                    {paper.doi && <div><span className="font-bold">DOI:</span> <a href={`https://doi.org/${paper.doi}`} className="text-blue-600 hover:underline">{paper.doi}</a></div>}
                    <div><span className="font-bold">Source:</span> {paper.source}</div>
                    <div className="col-span-2"><span className="font-bold">Link:</span> <a href={paper.url} target="_blank" className="text-blue-600 hover:underline">{paper.url}</a></div>
                </div>
            </section>

            {/* 2. ABSTRACTS */}
            <section>
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1 mb-2">2. Abstracts</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left: Source */}
                    <div className="bg-slate-50 p-3 rounded border border-slate-100">
                        <h4 className="text-[10px] text-slate-400 uppercase font-bold mb-1">Source Abstract</h4>
                        <div className="text-xs text-slate-800 leading-relaxed text-justify">
                            {paper.abstract}
                        </div>
                    </div>
                    {/* Right: AI */}
                    <div className="bg-blue-50/30 p-3 rounded border border-blue-100">
                        <h4 className="text-[10px] text-slate-400 uppercase font-bold mb-1">AI Abstract / Summary</h4>
                        {ai ? (
                            <div className="text-xs text-blue-900">
                                {renderSummary(ai.summary)}
                            </div>
                        ) : (
                            <span className="text-xs text-slate-400 italic">
                                {isFiltered ? "Filtered by Pre-screen Rules" : "Pending Analysis..."}
                            </span>
                        )}
                    </div>
                </div>
            </section>

            {/* 3. CATEGORIZATION */}
            <section>
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1 mb-2">3. Categorization</h3>
                <div className="flex items-start gap-2 text-xs">
                    <span className="font-bold text-slate-800 min-w-[40px]">Tags:</span>
                    <div className="flex flex-wrap gap-1">
                        {ai && ai.tags && ai.tags.length > 0 ? (
                            ai.tags.map((tag, i) => (
                                <span key={i} className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                                    {tag}
                                </span>
                            ))
                        ) : (
                            <span className="text-slate-400 italic">None</span>
                        )}
                    </div>
                </div>
            </section>

            {/* 4. SUBSTANCES & PLANTS */}
            <section>
                 <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-1 mb-2">4. Substances & Plants</h3>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div>
                        <h4 className="font-bold text-green-700 flex items-center gap-1 mb-1"><FlaskConical size={12}/> Phytochemicals</h4>
                        <div className="pl-2 border-l-2 border-green-100">
                            {renderList(ai?.phytochemicals)}
                        </div>
                    </div>
                    <div>
                        <h4 className="font-bold text-green-700 flex items-center gap-1 mb-1"><Leaf size={12}/> Plants</h4>
                        <div className="pl-2 border-l-2 border-green-100">
                            {renderList(ai?.plants)}
                        </div>
                    </div>
                    <div>
                        <h4 className="font-bold text-green-700 flex items-center gap-1 mb-1"><Sprout size={12}/> Possible Plants</h4>
                        <div className="pl-2 border-l-2 border-green-100">
                            {renderMultiLineList(ai?.possible_plants)}
                        </div>
                    </div>
                 </div>
            </section>

            {/* TUNING & DEBUG */}
            <section className="bg-slate-50 p-3 rounded-lg border border-slate-200 mt-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Tuning & Debug Information</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Top Semantic Sentences */}
                    <div>
                        <h4 className="text-[10px] font-bold text-slate-400 mb-2">Top 3 Semantic Matches</h4>
                        <div className="space-y-2">
                        {result.matches && result.matches.length > 0 ? result.matches.map((m, i) => (
                            <div key={i} className="text-xs border-b border-slate-100 last:border-0 pb-2">
                                <div className="flex justify-between font-mono text-[10px] text-slate-500 mb-1">
                                    <span>Net: {m.netScore?.toFixed(3) || '0.000'}</span>
                                    <span>Raw: {m.rawScore?.toFixed(3) || '0.000'}</span>
                                </div>
                                <div className="font-bold text-slate-700 flex items-center gap-2">
                                    S-Tag: <span className="bg-yellow-100 text-yellow-800 px-1 rounded">{m.tag || 'Unknown'}</span>
                                </div>
                                <div className="italic text-slate-500 mt-1">"{m.sentence}"</div>
                            </div>
                        )) : (
                            <div className="text-xs text-slate-400 italic">No semantic matches found.</div>
                        )}
                        </div>
                    </div>

                    {/* Other Stats */}
                    <div className="text-xs space-y-2">
                        <div className="flex justify-between border-b border-slate-200 pb-1">
                            <span className="font-bold text-slate-600">Vector Similarity (Query):</span>
                            <span className="font-mono">{result.vectorScore?.toFixed(4) ?? '0.0000'}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-200 pb-1">
                            <span className="font-bold text-slate-600">Composite Score:</span>
                            <span className="font-mono">{result.compositeScore?.toFixed(4) ?? '0.0000'}</span>
                        </div>
                        {ai && (
                            <div className="flex justify-between border-b border-slate-200 pb-1">
                                <span className="font-bold text-slate-600">Discovery Probability:</span>
                                <span className="font-mono">{ai.probability ?? 0}/10</span>
                            </div>
                        )}
                    </div>
                </div>
            </section>

        </div>
      )}
    </div>
  );
};

export default PaperCard;
