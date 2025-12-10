
import React from 'react';
import { HarvestHeaderData } from '../types';
import { FastForward } from 'lucide-react';

interface HarvestHeaderProps {
  data: HarvestHeaderData;
}

const HarvestHeader: React.FC<HarvestHeaderProps> = ({ data }) => {
  return (
    <div className="my-6 border-b-2 border-purple-200 pb-2 flex items-center gap-3 animate-fadeIn">
       <div className="bg-purple-100 p-2 rounded-lg text-purple-600">
            <FastForward size={24} />
       </div>
       <div>
            <h3 className="text-lg font-bold text-purple-900">Harvest Phase Initiated</h3>
            <p className="text-xs text-purple-600 font-medium">
                Speedup Active. Bypassing AI Analysis for records <strong>#{data.startRec + 1}</strong> through <strong>#{data.stopRec}</strong>.
            </p>
       </div>
    </div>
  );
};

export default HarvestHeader;
