import { useState, useRef, useCallback, useEffect } from 'react';
import { InterviewMessage, TranscriptionState } from '@/types/interview';

// Web Speech API type declarations (not in standard TS lib)
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

const SILENCE_THRESHOLD_MS = 2000; // 2 seconds of silence = end of question
const QUESTION_INDICATORS = /\?$|^what\b|^how\b|^why\b|^when\b|^where\b|^who\b|^can you\b|^could you\b|^would you\b|^tell me\b|^describe\b|^explain\b|^walk me\b|^share\b/i;

function isQuestion(text: string): boolean {
  return QUESTION_INDICATORS.test(text.trim());
}

export function useTranscription(audioStream: MediaStream | null) {
  const [state, setState] = useState<TranscriptionState>({
    isListening: false,
    interimText: '',
    finalText: '',
    segments: [],
    error: null,
  });

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const segmentsRef = useRef<InterviewMessage[]>([]);
  const currentSegmentRef = useRef<string>('');
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSpeechRef = useRef<number>(Date.now());
  const onQuestionCallbackRef = useRef<((question: string, fullTranscript: string) => void) | null>(null);

  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    lastSpeechRef.current = Date.now();

    silenceTimerRef.current = setTimeout(() => {
      const silenceDuration = Date.now() - lastSpeechRef.current;
      if (silenceDuration >= SILENCE_THRESHOLD_MS && currentSegmentRef.current.trim()) {
        // Silence detected — finalize the current segment as a potential question
        const segment = currentSegmentRef.current.trim();
        if (isQuestion(segment) && onQuestionCallbackRef.current) {
          const allSegments = segmentsRef.current.map((s) => s.text).join('\n');
          onQuestionCallbackRef.current(segment, allSegments);
        }
      }
    }, SILENCE_THRESHOLD_MS);
  }, []);

  const startListening = useCallback(
    (onQuestion: (question: string, fullTranscript: string) => void) => {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognitionAPI) {
        setState((prev) => ({
          ...prev,
          error: 'Speech recognition not supported. Please use Chrome or Edge.',
        }));
        return;
      }

      onQuestionCallbackRef.current = onQuestion;

      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setState((prev) => ({ ...prev, isListening: true, error: null }));
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            final += result[0]?.transcript || '';
          } else {
            interim += result[0]?.transcript || '';
          }
        }

        if (final) {
          currentSegmentRef.current += ' ' + final;
          currentSegmentRef.current = currentSegmentRef.current.trim();

          // Create a segment message
          const segment: InterviewMessage = {
            id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: new Date(),
            speaker: 'interviewer',
            text: final.trim(),
            isQuestion: isQuestion(final.trim()),
          };

          segmentsRef.current = [...segmentsRef.current, segment];
          resetSilenceTimer();

          setState((prev) => ({
            ...prev,
            interimText: interim,
            finalText: segmentsRef.current.map((s) => s.text).join(' '),
            segments: [...segmentsRef.current],
          }));
        } else {
          resetSilenceTimer();
          setState((prev) => ({ ...prev, interimText: interim }));
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        // 'no-speech' is common and ignorable — just means silence
        if (event.error === 'no-speech') return;
        // 'aborted' is expected when we stop
        if (event.error === 'aborted') return;

        setState((prev) => ({
          ...prev,
          error: `Recognition error: ${event.error}`,
        }));
        console.warn('Speech recognition error:', event.error);
      };

      recognition.onend = () => {
        // Auto-restart if still listening (Web Speech API stops after pauses)
        if (recognitionRef.current && state.isListening) {
          try {
            recognition.start();
          } catch {
            // Already started, ignore
          }
        }
      };

      recognitionRef.current = recognition;

      try {
        recognition.start();
      } catch (err: any) {
        setState((prev) => ({
          ...prev,
          error: `Failed to start: ${err.message}`,
          isListening: false,
        }));
      }
    },
    [resetSilenceTimer, state.isListening]
  );

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current) {
      recognitionRef.current.onend = null; // prevent auto-restart
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setState((prev) => ({
      ...prev,
      isListening: false,
      interimText: '',
    }));
  }, []);

  const clearTranscript = useCallback(() => {
    segmentsRef.current = [];
    currentSegmentRef.current = '';
    setState((prev) => ({
      ...prev,
      finalText: '',
      interimText: '',
      segments: [],
    }));
  }, []);

  // Auto-start/stop with stream
  useEffect(() => {
    if (audioStream && !state.isListening) {
      // We won't auto-start — caller controls this
    }
    if (!audioStream && state.isListening) {
      stopListening();
    }
  }, [audioStream, state.isListening, stopListening]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  return {
    ...state,
    startListening,
    stopListening,
    clearTranscript,
  };
}