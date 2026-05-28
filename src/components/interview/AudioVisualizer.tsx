import React from 'react';

interface AudioVisualizerProps {
  level: number;
  isActive: boolean;
}

const BAR_COUNT = 16;

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ level, isActive }) => {
  return (
    <div className="flex items-end gap-[2px] h-8">
      {Array.from({ length: BAR_COUNT }).map((_, i) => {
        // Create a staggered effect where each bar has a slightly different height
        const barPhase = (i / BAR_COUNT) * Math.PI;
        const staggeredLevel = level * (0.3 + 0.7 * Math.abs(Math.sin(barPhase + Date.now() / 500)));
        const height = isActive ? Math.max(3, staggeredLevel * 100) : 3;

        return (
          <div
            key={i}
            className="w-[3px] rounded-full transition-all duration-75"
            style={{
              height: `${height}%`,
              backgroundColor: isActive
                ? `hsl(${220 + i * 5}, ${70 + staggeredLevel * 30}%, ${50 + staggeredLevel * 20}%)`
                : 'hsl(220, 10%, 30%)',
              opacity: isActive ? 0.4 + staggeredLevel * 0.6 : 0.3,
            }}
          />
        );
      })}
    </div>
  );
};

export default AudioVisualizer;