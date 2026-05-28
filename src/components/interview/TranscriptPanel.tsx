import React, { useState } from 'react';
import { InterviewMessage } from '@/types/interview';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mic, User as UserIcon, Loader2, Play, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface TranscriptPanelProps {
  segments: InterviewMessage[];
  interimText: string;
  isListening: boolean;
  onManualTrigger?: () => void;
  onClear?: () => void;
}

const TranscriptPanel: React.FC<TranscriptPanelProps> = ({
  segments,
  interimText,
  isListening,
  onManualTrigger,
  onClear,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Mic className={`w-3.5 h-3.5 ${isListening ? 'text-green-500 animate-pulse' : 'text-muted-foreground'}`} />
            Transcript
            {segments.length > 0 && (
              <Badge variant="outline" className="text-[10px] h-4 px-1">
                {segments.length}
              </Badge>
            )}
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setCollapsed(false)}
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
          <span>Transcript collapsed — click to expand</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Mic className={`w-3.5 h-3.5 ${isListening ? 'text-green-500 animate-pulse' : 'text-muted-foreground'}`} />
          Live Transcript
        </h3>
        <div className="flex items-center gap-1">
          {isListening && (
            <span className="text-[10px] text-green-500 font-mono flex items-center gap-1 mr-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              LISTENING
            </span>
          )}
          {onManualTrigger && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] gap-1"
              onClick={onManualTrigger}
              title="Manually trigger response generation"
            >
              <Play className="w-3 h-3" />
              Trigger
            </Button>
          )}
          {onClear && segments.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px]"
              onClick={onClear}
            >
              Clear
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setCollapsed(true)}
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 px-3 py-2">
        <div className="space-y-3">
          {segments.length === 0 && !interimText && (
            <div className="text-xs text-muted-foreground text-center py-8 space-y-2">
              <Mic className="w-6 h-6 mx-auto text-muted-foreground/20" />
              {isListening ? (
                <>
                  <p>Listening...</p>
                  <p className="text-[10px]">
                    Speak clearly. Questions are auto-detected after a 2-second pause.
                  </p>
                  {onManualTrigger && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 h-7 text-[10px]"
                      onClick={onManualTrigger}
                    >
                      <Play className="w-3 h-3 mr-1" />
                      Manual Trigger
                    </Button>
                  )}
                </>
              ) : (
                <p>Start audio capture to begin transcribing</p>
              )}
            </div>
          )}

          {segments.map((seg, idx) => (
            <div
              key={seg.id}
              className={`space-y-1 p-2 rounded-md transition-colors ${
                seg.isQuestion
                  ? 'bg-amber-500/5 border border-amber-500/10'
                  : 'hover:bg-elevated/30'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-mono ${
                    seg.isQuestion ? 'text-amber-600' : 'text-muted-foreground'
                  }`}
                >
                  {seg.isQuestion ? '🔴 QUESTION' : '🎤 SPEAKER'}
                </span>
                <span className="text-[9px] text-muted-foreground/50 font-mono">
                  {seg.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <p className="text-xs text-foreground leading-relaxed">{seg.text}</p>
            </div>
          ))}

          {/* Interim text (in-progress speech) */}
          {interimText && (
            <div className="space-y-1 p-2 rounded-md bg-blue-500/5 border border-blue-500/10">
              <span className="text-[10px] font-mono text-blue-500/70 italic flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                hearing...
              </span>
              <p className="text-xs text-foreground/70 italic leading-relaxed">
                {interimText}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default TranscriptPanel;