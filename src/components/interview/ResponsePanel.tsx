import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AIResponse } from '@/types/interview';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Copy,
  RefreshCw,
  Lightbulb,
  Loader2,
  Check,
  AlertTriangle,
  Monitor,
  MonitorOff,
  ChevronDown,
  ChevronUp,
  Type,
  Type as TypeIcon,
  Maximize2,
  Minimize2,
  ArrowDown,
  Volume2,
  Eye,
} from 'lucide-react';

interface ResponsePanelProps {
  response: AIResponse | null;
  responses: AIResponse[];
  isGenerating: boolean;
  isStreaming: boolean;
  streamingText: string;
  error: string | null;
  onRegenerate: () => void;
  onGetTalkingPoints?: () => void;
  talkingPoints?: string;
  coachingTip?: string;
  onMarkUsed?: (responseId: string) => void;
}

const FONT_SIZES = {
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
} as const;

type FontSize = keyof typeof FONT_SIZES;

const ResponsePanel: React.FC<ResponsePanelProps> = ({
  response,
  responses,
  isGenerating,
  isStreaming,
  streamingText,
  error,
  onRegenerate,
  onGetTalkingPoints,
  talkingPoints,
  coachingTip,
  onMarkUsed,
}) => {
  const [teleprompterMode, setTeleprompterMode] = useState(false);
  const [fontSize, setFontSize] = useState<FontSize>('xl');
  const [showTalkingPoints, setShowTalkingPoints] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [usedIds, setUsedIds] = useState<Set<string>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest response
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [responses, streamingText, isStreaming, autoScroll]);

  const copyToClipboard = useCallback(async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }, []);

  const markUsed = useCallback(
    (id: string) => {
      setUsedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      onMarkUsed?.(id);
    },
    [onMarkUsed]
  );

  const readingTime = (text: string) => {
    return Math.ceil(text.split(' ').length / 2.5);
  };

  // Teleprompter overlay
  if (teleprompterMode && (currentResponse || streamingText)) {
    const displayText = streamingText || currentResponse?.responseText || '';
    return (
      <div className="fixed inset-0 z-50 bg-background/98 backdrop-blur-sm flex flex-col">
        {/* Teleprompter toolbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-elevated/30">
          <div className="flex items-center gap-3">
            <Monitor className="w-5 h-5 text-primary" />
            <span className="text-sm font-semibold">Teleprompter Mode</span>
            {isStreaming && (
              <Badge variant="outline" className="text-[10px] animate-pulse text-primary border-primary/30">
                STREAMING
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {Object.keys(FONT_SIZES).map((size) => (
              <Button
                key={size}
                variant={fontSize === size ? 'default' : 'ghost'}
                size="sm"
                className="h-7 text-[10px] px-2"
                onClick={() => setFontSize(size as FontSize)}
              >
                {size === 'sm' ? 'A' : size === '2xl' ? 'AA' : size === 'xl' ? 'Aa' : 'A'}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] gap-1"
              onClick={() => setTeleprompterMode(false)}
            >
              <Minimize2 className="w-3.5 h-3.5" />
              Exit
            </Button>
          </div>
        </div>

        {/* Teleprompter content */}
        <div className="flex-1 flex items-center justify-center p-12 overflow-y-auto">
          <div className="max-w-3xl w-full">
            <p
              className={`${FONT_SIZES[fontSize]} leading-relaxed whitespace-pre-wrap font-medium text-foreground text-center`}
            >
              {displayText}
            </p>
          </div>
        </div>

        {/* Teleprompter footer */}
        <div className="flex items-center justify-center gap-4 px-6 py-3 border-t border-border bg-elevated/30 text-xs text-muted-foreground">
          <span>~{readingTime(displayText)}s reading time</span>
          {isStreaming && (
            <span className="flex items-center gap-1 text-primary">
              <Loader2 className="w-3 h-3 animate-spin" />
              Generating...
            </span>
          )}
          <span className="font-mono text-[10px]">
            Press <kbd className="px-1 rounded bg-elevated border">Esc</kbd> to exit
          </span>
        </div>
      </div>
    );
  }

  const currentResponse = response;
  const streamingResponseText = streamingText;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Volume2 className="w-3.5 h-3.5 text-primary" />
          Responses
          {responses.length > 0 && (
            <Badge variant="outline" className="text-[10px] h-4 px-1 ml-1">
              {responses.length}
            </Badge>
          )}
        </h3>
        <div className="flex items-center gap-1">
          {/* Auto-scroll toggle */}
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 text-[10px] ${autoScroll ? 'text-primary' : ''}`}
            onClick={() => setAutoScroll(!autoScroll)}
            title="Auto-scroll to latest"
          >
            <ArrowDown className={`w-3 h-3 ${autoScroll ? '' : 'text-muted-foreground'}`} />
          </Button>

          {onGetTalkingPoints && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => {
                setShowTalkingPoints(!showTalkingPoints);
                if (!talkingPoints) onGetTalkingPoints();
              }}
            >
              <Lightbulb className="w-3 h-3 mr-1" />
              Points
            </Button>
          )}

          {currentResponse && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px]"
              onClick={onRegenerate}
              disabled={isGenerating}
            >
              <RefreshCw className={`w-3 h-3 mr-1 ${isGenerating ? 'animate-spin' : ''}`} />
              Retry
            </Button>
          )}
        </div>
      </div>

      {/* Response History — scrollable */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="px-3 py-3 space-y-4">
          {/* Loading state */}
          {isGenerating && !isStreaming && (
            <div className="flex items-center gap-3 text-primary py-12 justify-center">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Generating...</span>
            </div>
          )}

          {/* Error state */}
          {error && !isGenerating && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Error</p>
                <p className="text-destructive/80">{error}</p>
                <Button variant="outline" size="sm" className="mt-2 h-6 text-[10px]" onClick={onRegenerate}>
                  Try Again
                </Button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isGenerating && responses.length === 0 && !error && (
            <div className="text-xs text-muted-foreground text-center py-16 space-y-2">
              <Volume2 className="w-10 h-10 mx-auto text-muted-foreground/20" />
              <p>AI responses appear here</p>
              <p className="text-[10px]">Start your session to begin</p>
            </div>
          )}

          {/* Talking Points */}
          {showTalkingPoints && talkingPoints && (
            <div className="p-3 rounded-md bg-amber-500/5 border border-amber-500/10">
              <p className="text-[10px] font-mono text-amber-600 mb-2 flex items-center gap-1">
                <Lightbulb className="w-3 h-3" />
                TALKING POINTS
              </p>
              <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                {talkingPoints}
              </p>
            </div>
          )}

          {/* Coaching Tip */}
          {coachingTip && (
            <div className="p-3 rounded-md bg-blue-500/5 border border-blue-500/10">
              <p className="text-[10px] font-mono text-blue-500 mb-1">💡 COACHING TIP</p>
              <p className="text-xs text-foreground">{coachingTip}</p>
            </div>
          )}

          {/* Response History */}
          {responses.map((resp, idx) => (
            <div key={resp.id} className="space-y-2">
              {/* Question number + timestamp */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-muted-foreground">
                  Q{idx + 1}
                </span>
                <span className="text-[10px] text-muted-foreground/60">
                  {resp.timestamp.toLocaleTimeString()}
                </span>
                <span className="text-[10px] text-muted-foreground/60">
                  ~{readingTime(resp.responseText)}s
                </span>
                {usedIds.has(resp.id) && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1 text-green-600 border-green-600/30 bg-green-500/5">
                    <Eye className="w-2.5 h-2.5 mr-0.5" /> Read
                  </Badge>
                )}
              </div>

              {/* Response card */}
              <div
                className={`p-4 rounded-lg border transition-colors ${
                  idx === responses.length - 1
                    ? 'bg-primary/5 border-primary/20'
                    : 'bg-elevated/30 border-border hover:bg-elevated/50'
                }`}
              >
                <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                  {resp.responseText}
                </p>

                {/* Actions row */}
                <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/50">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px]"
                    onClick={() => copyToClipboard(resp.responseText, resp.id)}
                  >
                    {copiedId === resp.id ? (
                      <Check className="w-3 h-3 mr-1 text-green-500" />
                    ) : (
                      <Copy className="w-3 h-3 mr-1" />
                    )}
                    {copiedId === resp.id ? 'Copied' : 'Copy'}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-6 text-[10px] ${usedIds.has(resp.id) ? 'text-green-500' : ''}`}
                    onClick={() => markUsed(resp.id)}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    {usedIds.has(resp.id) ? 'Read' : 'Mark Read'}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px]"
                    onClick={() => {
                      const text = resp.responseText;
                      copyToClipboard(text, resp.id);
                      setTeleprompterMode(true);
                    }}
                  >
                    <Maximize2 className="w-3 h-3 mr-1" />
                    Teleprompter
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {/* Streaming response (in-progress) */}
          {isStreaming && streamingResponseText && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-primary">
                  Q{responses.length + 1}
                </span>
                <Badge variant="outline" className="text-[9px] h-4 px-1 animate-pulse text-primary border-primary/30">
                  STREAMING
                </Badge>
              </div>
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 ring-1 ring-primary/10">
                <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                  {streamingResponseText}
                  <span className="inline-block w-1.5 h-4 ml-0.5 bg-primary animate-pulse align-middle" />
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() => setTeleprompterMode(true)}
                >
                  <Maximize2 className="w-3 h-3 mr-1" />
                  Teleprompter
                </Button>
                <span className="text-[10px] text-muted-foreground">
                  ~{readingTime(streamingResponseText)}s so far
                </span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Bottom bar: teleprompter shortcut */}
      {currentResponse && !isStreaming && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-border bg-elevated/10 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              {responses.length} response{responses.length !== 1 ? 's' : ''}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px]"
            onClick={() => setTeleprompterMode(true)}
          >
            <Maximize2 className="w-3 h-3 mr-1" />
            Open Teleprompter
          </Button>
        </div>
      )}
    </div>
  );
};

export default ResponsePanel;