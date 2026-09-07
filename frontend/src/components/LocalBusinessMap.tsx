import React from 'react';
import { LocationProfile, BusinessItem } from '../providers/types';

interface LocalBusinessMapProps {
  location: LocationProfile;
  business: BusinessItem;
}

export default function LocalBusinessMap({ location, business }: LocalBusinessMapProps) {
  // A stylized abstract map to represent the geo-data safely without relying on paid APIs

  const competitors = business.competitorDensity === 'high' ? 8 : business.competitorDensity === 'medium' ? 4 : 1;

  // Generate some random positions for competitors and demand anchors around the center
  const generateNodes = (count: number, type: 'competitor' | 'demand') => {
    return Array.from({ length: count }).map((_, i) => ({
      id: `${type}-${i}`,
      top: 20 + Math.random() * 60, // 20% to 80%
      left: 10 + Math.random() * 80, // 10% to 90%
      type,
    }));
  };

  const compNodes = generateNodes(competitors, 'competitor');
  const demandNodes = generateNodes(5, 'demand');
  const allNodes = [...compNodes, ...demandNodes];

  return (
    <div className="w-full bg-surface-container rounded-2xl border border-outline-variant/10 overflow-hidden relative" style={{ minHeight: '400px' }}>
      
      {/* Map Overlay Pattern */}
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: 'radial-gradient(rgb(var(--on-surface)) 1px, transparent 1px)',
        backgroundSize: '20px 20px'
      }}></div>

      <div className="absolute top-4 left-4 z-10 bg-surface-container-high/90 backdrop-blur p-3 rounded-xl border border-outline-variant/20 shadow-lg text-xs">
        <h4 className="font-bold text-on-surface mb-2">{location.village || location.block || location.district} Radius</h4>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-3 h-3 rounded-full bg-blue-500 border-2 border-background shadow"></span>
          <span className="text-on-surface-variant">Proposed Location</span>
        </div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-3 h-3 rounded bg-red-500 border border-background shadow"></span>
          <span className="text-on-surface-variant">Estimated Competitors ({competitors})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full border-2 border-[#00FFA3] bg-[#00FFA3]/20 shadow"></span>
          <span className="text-on-surface-variant">Demand Anchors (Markets, Schools)</span>
        </div>
      </div>
      
      {/* Center Node */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
        <div className="relative">
          <div className="absolute -inset-4 bg-blue-500/20 rounded-full animate-ping"></div>
          <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-background shadow-[0_0_15px_rgba(59,130,246,0.8)] z-10 relative"></div>
          <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-surface-container-highest px-2 py-1 rounded text-[10px] font-bold text-on-surface whitespace-nowrap shadow-md">
            Your Proposed Site
          </div>
        </div>
      </div>

      {/* 5km Radius Circle */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[250px] h-[250px] rounded-full border border-blue-500/20 bg-blue-500/5 z-0">
      </div>
      {/* 10km Radius Circle */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full border border-blue-500/10 z-0">
      </div>

      {/* Plotted Nodes */}
      {allNodes.map(node => (
        <div 
          key={node.id}
          className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
          style={{ top: `${node.top}%`, left: `${node.left}%` }}
        >
          {node.type === 'competitor' ? (
            <div className="w-3 h-3 rounded bg-red-500 border border-background/50 shadow-md tooltip-trigger relative group">
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-surface-container-highest px-2 py-1 rounded text-[9px] text-on-surface opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                Estimated {business.name} competitor
              </div>
            </div>
          ) : (
            <div className="w-3 h-3 rounded-full border border-[#00FFA3] bg-[#00FFA3]/20 shadow-md"></div>
          )}
        </div>
      ))}

      <div className="absolute bottom-4 right-4 text-[10px] text-on-surface/40 bg-surface-container-high/80 px-2 py-1 rounded backdrop-blur border border-outline-variant/10">
        Representative Data • Not to scale
      </div>

    </div>
  );
}
