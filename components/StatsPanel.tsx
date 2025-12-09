import React from 'react';
import { CycleStats } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { Zap, Activity, Filter, CheckCircle } from 'lucide-react';

interface StatsPanelProps {
  stats: CycleStats;
}

const StatsPanel: React.FC<StatsPanelProps> = ({ stats }) => {
  const barData = [
    { name: 'Scanned', value: stats.totalScanned },
    { name: 'Passed Vector', value: stats.passedVector },
    { name: 'Qualified', value: stats.qualified },
  ];

  const energyData = [
    { name: 'Used', value: stats.aiAnalyzed, color: '#f87171' },
    { name: 'Saved', value: stats.energySaved, color: '#4ade80' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      
      {/* Metric Cards */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between">
        <div className="flex items-center gap-2 text-slate-500 mb-2">
            <Activity size={18} />
            <span className="text-sm font-medium">Total Scanned</span>
        </div>
        <div className="text-3xl font-bold text-slate-800">{stats.totalScanned}</div>
        <div className="text-xs text-slate-400">Papers processed</div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between">
         <div className="flex items-center gap-2 text-slate-500 mb-2">
            <Filter size={18} />
            <span className="text-sm font-medium">Vector Pass</span>
        </div>
        <div className="text-3xl font-bold text-blue-600">{stats.passedVector}</div>
        <div className="text-xs text-slate-400">Passed semantic filter</div>
      </div>

      <div className={stats.turboModeActive ? "bg-gradient-to-br from-yellow-50 to-orange-50 p-4 rounded-xl shadow-sm border border-orange-200 flex flex-col justify-between" : "bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between"}>
        <div className="flex items-center gap-2 text-slate-500 mb-2">
            <Zap size={18} className={stats.turboModeActive ? "text-orange-500 fill-orange-500 animate-pulse" : ""} />
            <span className="text-sm font-medium">Turbo Status</span>
        </div>
        <div className={`text-xl font-bold ${stats.turboModeActive ? "text-orange-600" : "text-slate-400"}`}>
            {stats.turboModeActive ? "ACTIVE" : "INACTIVE"}
        </div>
        <div className="text-xs text-slate-500">
            {stats.turboModeActive ? "Saving electricity!" : "Verifying accuracy..."}
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between">
        <div className="flex items-center gap-2 text-slate-500 mb-2">
            <CheckCircle size={18} />
            <span className="text-sm font-medium">Energy Efficiency</span>
        </div>
        <div className="h-24 w-full">
             <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={energyData}
                        cx="50%"
                        cy="50%"
                        innerRadius={25}
                        outerRadius={40}
                        paddingAngle={5}
                        dataKey="value"
                    >
                        {energyData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Pie>
                    <Tooltip />
                </PieChart>
            </ResponsiveContainer>
        </div>
        <div className="text-center text-xs font-mono text-green-600">
            {stats.energySaved} calls avoided
        </div>
      </div>
    </div>
  );
};

export default StatsPanel;