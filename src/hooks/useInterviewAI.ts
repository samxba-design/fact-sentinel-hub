import { useState, useCallback, useRef } from 'react';
import { InterviewContext, AIResponse } from '@/types/interview';
import { supabase } from '@/integrations/supabase/client';

interface GenerateResponseParams {
  transcript: string;
  lastQuestion: string;
  context: InterviewContext;
  history: Array<{ speaker: string; text: string }>;
  previousResponses: string[];
}

interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
}

function getSupabaseUrl(): string {
  return import.meta.env.VITE_SUPABASE_URL || '';
}

function getSupabaseAnonKey(): string {
  return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
}

function getAuthHeader(): Promise<string> {
  return new Promise((resolve) => {
    supabase.auth.getSession().then(({ data }) => {
      resolve(data.session?.access_token || '');
    });
  });
}

export function useInterviewAI() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [currentResponse, setCurrentResponse] = useState<AIResponse | null>(null);
  const [responses, setResponses] = useState<AIResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generateResponse = useCallback(async (params: GenerateResponseParams) => {
    setIsGenerating(true);
    setIsStreaming(true);
    setStreamingText('');
    setError(null);

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    let fullText = '';
    const questionId = `q-${Date.now()}`;

    try {
      const token = await getAuthHeader();
      const funcUrl = `${getSupabaseUrl()}/functions/v1/interview-copilot`;

      const response = await fetch(funcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: getSupabaseAnonKey(),
        },
        body: JSON.stringify({
          action: 'generate_response',
          stream: true,
          transcript: params.transcript,
          last_question: params.lastQuestion,
          context: {
            job_title: params.context.jobTitle,
            company_name: params.context.companyName,
            job_description: params.context.jobDescription,
            company_info: params.context.companyInfo,
            role_context: params.context.roleContext,
            candidate_resume: params.context.candidateResume,
            candidate_cover_letter: params.context.candidateCoverLetter,
            candidate_facts: params.context.candidateFacts,
            interview_style: params.context.interviewStyle,
            response_length: params.context.responseLength,
          },
          conversation_history: params.history,
          previous_responses: params.previousResponses,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Edge function error: ${response.status} ${err}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (!json) continue;

          try {
            const event = JSON.parse(json);

            if (event.type === 'chunk' && event.text) {
              fullText += event.text;
              setStreamingText(fullText);
            } else if (event.type === 'done') {
              // Finalize
              const response: AIResponse = {
                id: `resp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                timestamp: new Date(),
                questionId,
                responseText: fullText,
                thinkingPoints: [],
                confidence: 0.85,
              };

              setCurrentResponse(response);
              setResponses((prev) => [...prev, response]);
              setIsStreaming(false);
              setStreamingText('');
              return response;
            } else if (event.type === 'error') {
              throw new Error(event.error);
            }
          } catch (parseErr: unknown) {
            if (parseErr.message && !parseErr.message.includes('JSON')) {
              throw parseErr;
            }
            // skip unparseable events
          }
        }
      }

      // If we got here without a 'done' event, finalize anyway
      if (fullText) {
        const response: AIResponse = {
          id: `resp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date(),
          questionId,
          responseText: fullText,
          thinkingPoints: [],
          confidence: 0.85,
        };
        setCurrentResponse(response);
        setResponses((prev) => [...prev, response]);
        return response;
      }

      throw new Error('Empty response from AI');
    } catch (err: unknown) {
      if (err.name === 'AbortError') return null;
      const message = err.message || 'Failed to generate response';
      setError(message);
      setIsStreaming(false);
      setStreamingText('');
      console.error('Interview AI error:', err);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const analyzeQuestion = useCallback(async (transcript: string, context: InterviewContext) => {
    try {
      const { data, error: fnError } = await supabase.functions.invoke('interview-copilot', {
        body: {
          action: 'analyze_question',
          transcript,
          context: {
            job_title: context.jobTitle,
            company_name: context.companyName,
            job_description: context.jobDescription,
            company_info: context.companyInfo,
            role_context: context.roleContext,
            candidate_resume: context.candidateResume,
            interview_style: context.interviewStyle,
          },
        },
      });

      if (fnError) throw new Error(fnError.message);
      return data?.result || '';
    } catch (err: unknown) {
      console.error('Question analysis error:', err);
      return null;
    }
  }, []);

  const getTalkingPoints = useCallback(async (question: string, context: InterviewContext) => {
    try {
      const { data, error: fnError } = await supabase.functions.invoke('interview-copilot', {
        body: {
          action: 'generate_talking_points',
          last_question: question,
          context: {
            job_title: context.jobTitle,
            job_description: context.jobDescription,
            candidate_resume: context.candidateResume,
            candidate_facts: context.candidateFacts,
          },
        },
      });

      if (fnError) throw new Error(fnError.message);
      return data?.result || '';
    } catch (err: unknown) {
      console.error('Talking points error:', err);
      return null;
    }
  }, []);

  const getCoaching = useCallback(
    async (responseText: string, question: string, context: InterviewContext) => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('interview-copilot', {
          body: {
            action: 'coach',
            transcript: responseText,
            last_question: question,
            context: {
              job_title: context.jobTitle,
              interview_style: context.interviewStyle,
            },
          },
        });

        if (fnError) throw new Error(fnError.message);
        return data?.result || '';
      } catch (err: unknown) {
        console.error('Coaching error:', err);
        return null;
      }
    },
    []
  );

  const cancelGeneration = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsGenerating(false);
    setIsStreaming(false);
    setStreamingText('');
  }, []);

  const clearResponses = useCallback(() => {
    setResponses([]);
    setCurrentResponse(null);
    setStreamingText('');
    setError(null);
  }, []);

  // Add a manual response to history (when user types their own)
  const addManualResponse = useCallback((text: string, questionId?: string) => {
    const response: AIResponse = {
      id: `resp-manual-${Date.now()}`,
      timestamp: new Date(),
      questionId: questionId || `q-manual-${Date.now()}`,
      responseText: text,
      thinkingPoints: [],
      confidence: 1.0,
    };
    setResponses((prev) => [...prev, response]);
    setCurrentResponse(response);
    return response;
  }, []);

  return {
    isGenerating,
    isStreaming,
    streamingText,
    currentResponse,
    responses,
    error,
    generateResponse,
    analyzeQuestion,
    getTalkingPoints,
    getCoaching,
    cancelGeneration,
    clearResponses,
    addManualResponse,
  };
}