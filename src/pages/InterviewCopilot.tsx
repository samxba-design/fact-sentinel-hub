import React, { useState, useCallback, useRef, useEffect } from 'react';
import { InterviewContext, InterviewPhase } from '@/types/interview';
import { useAudioCapture } from '@/hooks/useAudioCapture';
import { useTranscription } from '@/hooks/useTranscription';
import { useInterviewAI } from '@/hooks/useInterviewAI';
import ContextPanel, { getDefaultContext } from '@/components/interview/ContextPanel';
import TranscriptPanel from '@/components/interview/TranscriptPanel';
import ResponsePanel from '@/components/interview/ResponsePanel';
import PracticePanel from '@/components/interview/PracticePanel';
import AudioVisualizer from '@/components/interview/AudioVisualizer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Play, Square, Settings, Monitor, AlertTriangle, Keyboard,
  Eye, EyeOff, Minimize2, Radio, Brain, HelpCircle,
} from 'lucide-react';

const InterviewCopilot: React.FC = () => {
  const [context, setContext] = useState<InterviewContext>(getDefaultContext);
  const [phase, setPhase] = useState<InterviewPhase>('setup');
  const [activeTab, setActiveTab] = useState<'live' | 'practice'>('live');
  const [showSettings, setShowSettings] = useState(true);
  const [useSystemAudio, setUseSystemAudio] = useState(true);
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [lastQuestion, setLastQuestion] = useState('');
  const [coachingTip, setCoachingTip] = useState('');
  const [talkingPoints, setTalkingPoints] = useState('');
  const [minimized, setMinimized] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const {
    isCapturing, audioLevel, error: audioError, startCapture, stopCapture,
  } = useAudioCapture();
  const captureStreamRef = useRef<MediaStream | null>(null);

  const {
    isListening, segments, interimText, finalText, error: transcribeError,
    startListening, stopListening, clearTranscript,
  } = useTranscription(captureStreamRef.current);

  const {
    isGenerating, isStreaming, streamingText, currentResponse, responses, error: aiError,
    generateResponse, getTalkingPoints, getCoaching, cancelGeneration, clearResponses,
  } = useInterviewAI();

  // ── LIVE MODE LOGIC ──

  const buildHistory = useCallback((): Array<{ speaker: string; text: string }> => {
    return segments.map((s) => ({ speaker: s.speaker, text: s.text }));
  }, [segments]);

  const handleQuestion = useCallback(
    async (question: string, fullTranscript: string) => {
      if (!autoGenerate) return;
      if (isGenerating) { cancelGeneration(); await new Promise((r) => setTimeout(r, 300)); }
      setLastQuestion(question);
      setPhase('generating');
      setCoachingTip('');
      setTalkingPoints('');
      const prevResponseTexts = responses.map((r) => r.responseText);
      await generateResponse({
        transcript: fullTranscript, lastQuestion: question, context,
        history: buildHistory(), previousResponses: prevResponseTexts,
      });
      if (responses.length > 0) {
        const lastResp = responses[responses.length - 1];
        const tip = await getCoaching(lastResp.responseText, lastQuestion || question, context);
        if (tip) setCoachingTip(tip);
      }
      setPhase('listening');
    },
    [autoGenerate, isGenerating, cancelGeneration, responses, buildHistory, generateResponse, context, getCoaching, lastQuestion]
  );

  const handleManualTrigger = useCallback(async () => {
    const question = finalText.split('.').pop()?.trim() || finalText;
    if (!question) return;
    await handleQuestion(question, finalText);
  }, [finalText, handleQuestion]);

  const startSession = useCallback(async () => {
    clearTranscript(); clearResponses();
    setCoachingTip(''); setTalkingPoints('');
    setPhase('capturing');
    if (useSystemAudio) {
      const stream = await startCapture();
      if (stream) { captureStreamRef.current = stream; setPhase('listening'); startListening(handleQuestion); }
      else setPhase('error');
    } else {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        captureStreamRef.current = micStream;
        setPhase('listening'); startListening(handleQuestion);
      } catch { setPhase('error'); }
    }
  }, [useSystemAudio, startCapture, clearTranscript, clearResponses, startListening, handleQuestion]);

  const stopSession = useCallback(() => {
    stopListening(); stopCapture();
    captureStreamRef.current = null; cancelGeneration();
    setPhase('idle');
  }, [stopListening, stopCapture, cancelGeneration]);

  const handleRegenerate = useCallback(async () => {
    if (!lastQuestion) return;
    cancelGeneration(); await new Promise((r) => setTimeout(r, 200));
    setPhase('generating'); setTalkingPoints('');
    const prevResponseTexts = responses.slice(0, -1).map((r) => r.responseText);
    await generateResponse({
      transcript: finalText, lastQuestion, context,
      history: buildHistory(), previousResponses: prevResponseTexts,
    });
    setPhase('listening');
  }, [lastQuestion, cancelGeneration, responses, buildHistory, generateResponse, finalText, context]);

  const handleTalkingPoints = useCallback(async () => {
    if (!lastQuestion) return;
    const points = await getTalkingPoints(lastQuestion, context);
    if (points) setTalkingPoints(points);
  }, [lastQuestion, getTalkingPoints, context]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === ' ' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (phase === 'listening' || phase === 'capturing' || phase === 'generating') stopSession();
        else startSession();
      }
      if (e.key.toLowerCase() === 'r' && e.ctrlKey && phase === 'listening') { e.preventDefault(); handleRegenerate(); }
      if (e.key.toLowerCase() === 'h' && e.ctrlKey) { e.preventDefault(); setMinimized((p) => !p); }
      if (e.key.toLowerCase() === 't' && e.ctrlKey && phase === 'listening') { e.preventDefault(); handleManualTrigger(); }
      if (e.key === 'Escape') setMinimized(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, startSession, stopSession, handleRegenerate, handleManualTrigger]);

  const isActive = phase === 'capturing' || phase === 'listening' || phase === 'generating';

  // Minimized mode
  if (minimized && isActive) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-background border border-border shadow-lg">
        <AudioVisualizer level={audioLevel} isActive={isActive} />
        <span className={`w-2 h-2 rounded-full ${phase === 'listening' ? 'bg-green-500 animate-pulse' : phase === 'generating' ? 'bg-amber-500 animate-pulse' : 'bg-blue-500 animate-pulse'}`} />
        <span className="text-xs font-mono text-muted-foreground">{phase === 'listening' ? 'Listening' : phase === 'generating' ? 'Generating' : 'Capturing'}</span>
        {isStreaming && <span className="text-[10px] text-primary animate-pulse">+{(streamingText.match(/[.!?]/g) || []).length} sent.</span>}
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setMinimized(false)}><Minimize2 className="w-3.5 h-3.5" /></Button>
        <Button variant="destructive" size="sm" className="h-7 text-[10px]" onClick={stopSession}><Square className="w-3 h-3 mr-1" />Stop</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-foreground tracking-wide">Interview Copilot</h1>
          <Badge variant="outline" className="text-[10px] font-mono text-primary border-primary/30">ADMIN</Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Tabs: Live / Practice */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="mr-3">
            <TabsList className="h-8">
              <TabsTrigger value="live" className="text-[11px] gap-1 h-7">
                <Radio className="w-3 h-3" /> Live
              </TabsTrigger>
              <TabsTrigger value="practice" className="text-[11px] gap-1 h-7">
                <Brain className="w-3 h-3" /> Practice
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <AudioVisualizer level={audioLevel} isActive={isActive} />

          {activeTab === 'live' && (
            <>
              <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1" onClick={() => setUseSystemAudio(!useSystemAudio)} disabled={isActive}>
                <Monitor className="w-3 h-3" />{useSystemAudio ? 'System' : 'Mic'}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1" onClick={() => setAutoGenerate(!autoGenerate)}>
                {autoGenerate ? <Eye className="w-3 h-3 text-green-500" /> : <EyeOff className="w-3 h-3" />}Auto
              </Button>
              {isActive && (
                <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1" onClick={() => setMinimized(true)}>
                  <Minimize2 className="w-3 h-3" />Hide
                </Button>
              )}
              <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1" onClick={() => setShowSettings(!showSettings)}>
                <Settings className="w-3 h-3" />{showSettings ? 'Hide' : 'Context'}
              </Button>
              {isActive ? (
                <Button variant="destructive" size="sm" className="h-8 gap-2" onClick={stopSession}><Square className="w-3.5 h-3.5" />Stop</Button>
              ) : (
                <Button variant="default" size="sm" className="h-8 gap-2 bg-green-600 hover:bg-green-700" onClick={startSession}><Play className="w-3.5 h-3.5" />Start Session</Button>
              )}
            </>
          )}

          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowHelp(!showHelp)} title="Help">
            <HelpCircle className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Help Panel ── */}
      {showHelp && (
        <div className="px-4 py-3 bg-blue-500/5 border-b border-blue-500/10 text-xs space-y-2 shrink-0">
          <p className="font-semibold text-blue-600">Getting Started</p>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li><strong>Set up context</strong> — paste your resume, job description, and company info. Upload PDFs to auto-extract text.</li>
            <li><strong>Live Mode:</strong> Share your Zoom/Meet window with audio. The AI listens and generates responses when questions are detected.</li>
            <li><strong>Practice Mode:</strong> AI acts as the interviewer. Answer questions and get scored feedback on each response.</li>
            <li>Use <kbd className="px-1 rounded bg-muted border text-[10px]">Ctrl+H</kbd> to hide the tool discreetly mid-interview.</li>
            <li>Responses appear in a scrollable feed. Click <strong>Teleprompter</strong> for full-screen reading mode.</li>
          </ol>
        </div>
      )}

      {/* ── Status Bar ── */}
      {activeTab === 'live' && (
        <div className="flex items-center gap-3 px-4 py-1.5 bg-muted/30 border-b border-border text-[10px] font-mono shrink-0">
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${
              isStreaming ? 'bg-primary animate-pulse' : phase === 'listening' ? 'bg-green-500 animate-pulse' :
              phase === 'generating' ? 'bg-amber-500 animate-pulse' : isCapturing ? 'bg-blue-500 animate-pulse' : 'bg-muted-foreground/30'
            }`} />
            {phase === 'idle' && 'Ready — set up context below, then click Start'}
            {phase === 'capturing' && 'Capturing system audio...'}
            {phase === 'listening' && isStreaming ? 'Streaming AI response...' : 'Listening & transcribing...'}
            {phase === 'generating' && 'Generating response...'}
            {phase === 'error' && '⚠️ Error'}
          </span>
          <span className="text-muted-foreground truncate">
            {context.jobTitle ? `🎯 ${context.jobTitle} @ ${context.companyName || '...'}` : '⚠️ Configure context →'}
          </span>
          <div className="flex items-center gap-2 ml-auto text-muted-foreground">
            <span>Q: {segments.filter((s) => s.isQuestion).length}</span>
            <span>|</span>
            <span>R: {responses.length}</span>
            {isActive && <><span>|</span><span className="text-green-500/70">● active</span></>}
          </div>
        </div>
      )}

      {/* ── Main Content ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {activeTab === 'live' ? (
          <>
            {/* Context Panel */}
            {showSettings && (
              <div className="w-72 border-r border-border bg-muted/20 shrink-0">
                <ContextPanel context={context} onChange={setContext} disabled={isActive} />
              </div>
            )}

            {/* Transcript Panel */}
            <div className="flex-1 border-r border-border min-w-0">
              <TranscriptPanel
                segments={segments}
                interimText={interimText}
                isListening={isListening}
                onManualTrigger={handleManualTrigger}
                onClear={clearTranscript}
              />
            </div>

            {/* Response Panel */}
            <div className="w-[440px] shrink-0">
              <ResponsePanel
                response={currentResponse}
                responses={responses}
                isGenerating={isGenerating}
                isStreaming={isStreaming}
                streamingText={streamingText}
                error={aiError}
                onRegenerate={handleRegenerate}
                onGetTalkingPoints={handleTalkingPoints}
                talkingPoints={talkingPoints}
                coachingTip={coachingTip}
              />
            </div>
          </>
        ) : (
          /* Practice Mode */
          <div className="flex-1 flex overflow-hidden min-h-0">
            {showSettings && (
              <div className="w-72 border-r border-border bg-muted/20 shrink-0">
                <ContextPanel context={context} onChange={setContext} disabled={false} />
              </div>
            )}
            <div className="flex-1">
              <PracticePanel context={context} />
            </div>
          </div>
        )}
      </div>

      {/* ── Error Banner ── */}
      {(audioError || transcribeError) && (
        <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 border-t border-destructive/20 text-destructive text-xs shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{audioError || transcribeError}</span>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] ml-auto" onClick={() => { stopSession(); setTimeout(startSession, 800); }}>Retry</Button>
        </div>
      )}

      {/* ── Shortcuts Bar ── */}
      {activeTab === 'live' && (
        <div className="flex items-center gap-3 px-4 py-1.5 bg-muted/20 border-t border-border text-[10px] text-muted-foreground shrink-0">
          <span className="flex items-center gap-1"><Keyboard className="w-3 h-3" />Shortcuts:</span>
          <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[9px]">Ctrl+Space</kbd><span>Start/Stop</span>
          <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[9px]">Ctrl+R</kbd><span>Regenerate</span>
          <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[9px]">Ctrl+T</kbd><span>Manual trigger</span>
          <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[9px]">Ctrl+H</kbd><span>Hide</span>
        </div>
      )}
    </div>
  );
};

export default InterviewCopilot;