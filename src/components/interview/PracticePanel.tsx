import React, { useState, useCallback, useRef, useEffect } from 'react';
import { InterviewContext, InterviewMessage } from '@/types/interview';
import { useAudioCapture } from '@/hooks/useAudioCapture';
import { useTranscription } from '@/hooks/useTranscription';
import { useInterviewAI } from '@/hooks/useInterviewAI';
import AudioVisualizer from '@/components/interview/AudioVisualizer';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Play, Square, Mic, Loader2, MessageCircle, ChevronRight,
  Star, Brain, CheckCircle2, AlertCircle, Lightbulb, RefreshCw,
  Keyboard,
} from 'lucide-react';

interface PracticePanelProps {
  context: InterviewContext;
  onComplete?: (session: PracticeSession) => void;
}

export interface PracticeQuestion {
  id: string;
  question: string;
  category: string;
  expectedTopics: string[];
}

export interface PracticeAnswer {
  questionId: string;
  answer: string;
  feedback: string;
  score: number; // 1-10
  strengths: string[];
  improvements: string[];
}

export interface PracticeSession {
  id: string;
  timestamp: Date;
  context: InterviewContext;
  questions: PracticeQuestion[];
  answers: PracticeAnswer[];
  overallScore: number;
  summary: string;
}

type PracticePhase = 'idle' | 'intro' | 'question' | 'answering' | 'feedback' | 'complete';

const PracticePanel: React.FC<PracticePanelProps> = ({ context, onComplete }) => {
  const [phase, setPhase] = useState<PracticePhase>('idle');
  const [currentQuestion, setCurrentQuestion] = useState<PracticeQuestion | null>(null);
  const [currentFeedback, setCurrentFeedback] = useState<PracticeAnswer | null>(null);
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [answers, setAnswers] = useState<PracticeAnswer[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [sessionSummary, setSessionSummary] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [useVoice, setUseVoice] = useState(true);

  const { audioLevel, isCapturing, startCapture, stopCapture } = useAudioCapture();
  const captureRef = useRef<MediaStream | null>(null);

  const { isListening, finalText, interimText, segments, startListening, stopListening, clearTranscript } =
    useTranscription(captureRef.current);

  const {
    isGenerating,
    streamingText,
    generateResponse,
    getCoaching,
    cancelGeneration,
  } = useInterviewAI();

  // Generate practice questions when starting
  const startPractice = useCallback(async () => {
    setPhase('intro');
    setError(null);
    setAnswers([]);
    setQuestionIndex(0);

    try {
      // Generate questions via AI
      const response = await generateResponse({
        transcript: '',
        lastQuestion: `Generate 5 interview questions for a ${context.jobTitle || 'candidate'} position at ${context.companyName || 'the company'}. 
Make them realistic, varied, and based on the job description. 
Return them as a numbered list. Each question should be on a new line starting with a number.`,
        context: {
          ...context,
          interviewStyle: context.interviewStyle || 'professional',
          responseLength: 'detailed',
        },
        history: [],
        previousResponses: [],
      });

      if (response) {
        // Parse questions from the response
        const parsedQuestions = parseQuestionsFromResponse(response.responseText);
        setQuestions(parsedQuestions);

        if (parsedQuestions.length > 0) {
          setCurrentQuestion(parsedQuestions[0]);
          setPhase('question');
        } else {
          // Fallback questions
          const fallback = generateFallbackQuestions(context);
          setQuestions(fallback);
          setCurrentQuestion(fallback[0]);
          setPhase('question');
        }
      } else {
        const fallback = generateFallbackQuestions(context);
        setQuestions(fallback);
        setCurrentQuestion(fallback[0]);
        setPhase('question');
      }
    } catch (err: unknown) {
      setError('Failed to generate questions. Check your Supabase connection.');
      const fallback = generateFallbackQuestions(context);
      setQuestions(fallback);
      setCurrentQuestion(fallback[0]);
      setPhase('question');
    }
  }, [context, generateResponse]);

  // Start voice capture for answering
  const startAnswering = useCallback(async () => {
    setPhase('answering');
    setTypedAnswer('');
    clearTranscript();

    if (useVoice) {
      try {
        const stream = await startCapture();
        if (stream) {
          captureRef.current = stream;
          startListening(() => { /* noop */ }); // No auto-trigger in practice mode
        }
      } catch {
        // Fall back to typing
        setUseVoice(false);
      }
    }
  }, [useVoice, startCapture, startListening, clearTranscript]);

  // Submit answer (voice or typed)
  const submitAnswer = useCallback(async () => {
    const answerText = useVoice ? finalText : typedAnswer;
    if (!answerText.trim() || !currentQuestion) return;

    stopListening();
    stopCapture();
    setPhase('feedback');

    try {
      // Get AI feedback on the answer
      const feedbackResponse = await generateResponse({
        transcript: answerText,
        lastQuestion: currentQuestion.question,
        context: {
          ...context,
          candidateResume: context.candidateResume,
          jobDescription: context.jobDescription,
        },
        history: [
          { speaker: 'interviewer', text: currentQuestion.question },
          { speaker: 'candidate', text: answerText },
        ],
        previousResponses: [],
      });

      // Parse feedback
      const feedback = parseFeedback(feedbackResponse?.responseText || '', currentQuestion.question);
      feedback.questionId = currentQuestion.id;
      feedback.answer = answerText;

      setCurrentFeedback(feedback);
      setAnswers((prev) => [...prev, feedback]);
    } catch (err: unknown) {
      // Fallback feedback
      const fallback: PracticeAnswer = {
        questionId: currentQuestion.id,
        answer: answerText,
        feedback: 'Good effort! Consider structuring your answer with a clear beginning, middle, and end. Use specific examples from your experience.',
        score: 6,
        strengths: ['You engaged with the question directly'],
        improvements: ['Add more specific examples', 'Structure with STAR format'],
      };
      setCurrentFeedback(fallback);
      setAnswers((prev) => [...prev, fallback]);
    }
  }, [useVoice, finalText, typedAnswer, currentQuestion, stopListening, stopCapture, generateResponse, context]);

  // Next question
  const nextQuestion = useCallback(() => {
    const nextIdx = questionIndex + 1;
    if (nextIdx < questions.length) {
      setQuestionIndex(nextIdx);
      setCurrentQuestion(questions[nextIdx]);
      setCurrentFeedback(null);
      setTypedAnswer('');
      clearTranscript();
      setPhase('question');
    } else {
      // Complete session
      finishSession();
    }
  }, [questionIndex, questions, clearTranscript]);

  // Finish practice session
  const finishSession = useCallback(() => {
    const avgScore = answers.length > 0
      ? answers.reduce((sum, a) => sum + a.score, 0) / answers.length
      : 0;

    const summary = generateSummary(answers, avgScore);

    setSessionSummary(summary);
    setPhase('complete');

    const session: PracticeSession = {
      id: `practice-${Date.now()}`,
      timestamp: new Date(),
      context,
      questions,
      answers,
      overallScore: Math.round(avgScore * 10) / 10,
      summary,
    };

    onComplete?.(session);
  }, [answers, context, questions, onComplete]);

  const stopPractice = useCallback(() => {
    stopListening();
    stopCapture();
    cancelGeneration();
    setPhase('idle');
  }, [stopListening, stopCapture, cancelGeneration]);

  // Cleanup
  useEffect(() => {
    return () => {
      stopListening();
      stopCapture();
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <Brain className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Practice Mode</h2>
          {phase !== 'idle' && phase !== 'complete' && (
            <Badge variant="outline" className="text-[10px]">
              Q{questionIndex + 1}/{questions.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {phase === 'idle' ? (
            <Button onClick={startPractice} className="gap-2 bg-primary" disabled={isGenerating}>
              <Play className="w-4 h-4" /> Start Practice Interview
            </Button>
          ) : phase === 'complete' ? (
            <Button onClick={startPractice} variant="outline" className="gap-2">
              <RefreshCw className="w-4 h-4" /> New Session
            </Button>
          ) : (
            <Button onClick={stopPractice} variant="destructive" size="sm" className="gap-2">
              <Square className="w-3.5 h-3.5" /> End
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto p-6 space-y-6">
          {/* ── Idle State ── */}
          {phase === 'idle' && (
            <div className="text-center py-16 space-y-4">
              <Brain className="w-16 h-16 mx-auto text-primary/20" />
              <h3 className="text-xl font-semibold">Mock Interview Practice</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                The AI will act as a realistic interviewer, asking questions based on your job description.
                Answer naturally and get instant feedback on your responses.
              </p>
              <div className="flex items-center justify-center gap-4 pt-4">
                <Button
                  variant={useVoice ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setUseVoice(!useVoice)}
                  className="gap-1"
                >
                  <Mic className="w-3.5 h-3.5" />
                  {useVoice ? 'Voice' : 'Type'}
                </Button>
              </div>
            </div>
          )}

          {/* ── Intro / Generating ── */}
          {phase === 'intro' && (
            <div className="text-center py-16 space-y-4">
              <Loader2 className="w-10 h-10 mx-auto animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Generating personalized interview questions...
              </p>
            </div>
          )}

          {/* ── Question Phase ── */}
          {(phase === 'question') && currentQuestion && (
            <div className="space-y-4 animate-fade-up">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] bg-primary/5">
                  {currentQuestion.category}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  Q{questionIndex + 1} of {questions.length}
                </Badge>
              </div>

              <div className="p-6 rounded-xl bg-primary/5 border border-primary/10">
                <p className="text-lg font-medium text-foreground leading-relaxed">
                  {currentQuestion.question}
                </p>
                {currentQuestion.expectedTopics.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {currentQuestion.expectedTopics.map((t) => (
                      <Badge key={t} variant="outline" className="text-[9px] bg-muted/50">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <Button onClick={startAnswering} className="gap-2 w-full" size="lg">
                <Mic className="w-4 h-4" />
                {useVoice ? 'Start Answering (Voice)' : 'Type Your Answer'}
              </Button>
            </div>
          )}

          {/* ── Answering Phase ── */}
          {phase === 'answering' && (
            <div className="space-y-4 animate-fade-up">
              <div className="p-4 rounded-lg bg-muted/20 border border-border">
                <p className="text-sm font-medium text-muted-foreground mb-2">
                  Question {questionIndex + 1}:
                </p>
                <p className="text-base">{currentQuestion?.question}</p>
              </div>

              {useVoice ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <AudioVisualizer level={audioLevel} isActive={isListening} />
                    <span className="text-xs text-green-500 animate-pulse">
                      ● Recording
                    </span>
                  </div>

                  {/* Live transcript */}
                  <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/10 min-h-[100px]">
                    <p className="text-sm text-foreground whitespace-pre-wrap">
                      {finalText}
                      {interimText && (
                        <span className="text-muted-foreground italic">{interimText}</span>
                      )}
                    </p>
                    {!finalText && !interimText && (
                      <p className="text-xs text-muted-foreground italic">Speak your answer...</p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      className="gap-2 flex-1"
                      onClick={submitAnswer}
                      disabled={!finalText.trim() || isGenerating}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Submit Answer
                    </Button>
                    <Button variant="outline" onClick={() => setPhase('question')}>
                      Skip
                    </Button>
                  </div>

                  <p className="text-[10px] text-muted-foreground text-center">
                    Speak clearly. Click Submit when done.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <Textarea
                    value={typedAnswer}
                    onChange={(e) => setTypedAnswer(e.target.value)}
                    placeholder="Type your answer here..."
                    className="min-h-[150px] resize-y"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      className="gap-2 flex-1"
                      onClick={submitAnswer}
                      disabled={!typedAnswer.trim() || isGenerating}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Submit Answer
                    </Button>
                    <Button variant="outline" onClick={() => setPhase('question')}>
                      Skip
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Feedback Phase ── */}
          {phase === 'feedback' && currentFeedback && (
            <div className="space-y-4 animate-fade-up">
              <div className="text-center">
                <Badge className="text-sm px-4 py-1 bg-primary">
                  Score: {currentFeedback.score}/10
                </Badge>
              </div>

              {/* Strengths */}
              <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/10">
                <p className="text-xs font-mono text-green-600 mb-2 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> STRENGTHS
                </p>
                <ul className="space-y-1">
                  {currentFeedback.strengths.map((s, i) => (
                    <li key={i} className="text-sm text-foreground flex items-start gap-2">
                      <Star className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Improvements */}
              <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/10">
                <p className="text-xs font-mono text-amber-600 mb-2 flex items-center gap-1">
                  <Lightbulb className="w-3.5 h-3.5" /> AREAS TO IMPROVE
                </p>
                <ul className="space-y-1">
                  {currentFeedback.improvements.map((imp, i) => (
                    <li key={i} className="text-sm text-foreground flex items-start gap-2">
                      <ChevronRight className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                      {imp}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Detailed feedback */}
              <div className="p-4 rounded-lg bg-muted/20 border border-border">
                <p className="text-xs font-mono text-muted-foreground mb-2">DETAILED FEEDBACK</p>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {currentFeedback.feedback}
                </p>
              </div>

              <Button onClick={nextQuestion} className="gap-2 w-full" size="lg">
                {questionIndex + 1 < questions.length ? (
                  <>Next Question <ChevronRight className="w-4 h-4" /></>
                ) : (
                  <>View Results <Star className="w-4 h-4" /></>
                )}
              </Button>
            </div>
          )}

          {/* ── Complete ── */}
          {phase === 'complete' && (
            <div className="space-y-6 animate-fade-up">
              <div className="text-center space-y-2">
                <Star className="w-12 h-12 mx-auto text-amber-500" />
                <h3 className="text-xl font-semibold">Practice Complete!</h3>
                <Badge className="text-lg px-6 py-2">
                  Overall: {answers.length > 0
                    ? (answers.reduce((s, a) => s + a.score, 0) / answers.length).toFixed(1)
                    : 'N/A'}/10
                </Badge>
              </div>

              {/* Per-question summary */}
              <div className="space-y-3">
                {answers.map((answer, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-muted/10 border border-border">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium truncate flex-1">
                        Q{idx + 1}: {questions[idx]?.question.slice(0, 60)}...
                      </p>
                      <Badge variant="outline" className="text-xs ml-2">
                        {answer.score}/10
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {answer.feedback.slice(0, 120)}...
                    </p>
                  </div>
                ))}
              </div>

              {/* Summary */}
              {sessionSummary && (
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                  <p className="text-xs font-mono text-primary mb-2">SESSION SUMMARY</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{sessionSummary}</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={startPractice} variant="outline" className="gap-2 flex-1">
                  <RefreshCw className="w-4 h-4" /> Practice Again
                </Button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <AlertCircle className="w-4 h-4 inline mr-2" />
              {error}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

// ── Helpers ──

function parseQuestionsFromResponse(text: string): PracticeQuestion[] {
  const questions: PracticeQuestion[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const match = line.match(/^\d+[.)]\s*(.+)/);
    if (match) {
      const q = match[1].trim();
      if (q.length > 10) {
        questions.push({
          id: `pq-${Date.now()}-${questions.length}`,
          question: q,
          category: detectCategory(q),
          expectedTopics: [],
        });
      }
    }
  }

  return questions.slice(0, 7); // Max 7 questions
}

function detectCategory(question: string): string {
  const q = question.toLowerCase();
  if (/strength|weakness|failure|mistake|challenge/i.test(q)) return 'Behavioral';
  if (/experience|project|worked|built|led|managed/i.test(q)) return 'Experience';
  if (/technical|code|system|architecture|framework/i.test(q)) return 'Technical';
  if (/team|conflict|collaborate|coworker|manager/i.test(q)) return 'Teamwork';
  if (/why.*(here|company|role|join|interest)/i.test(q)) return 'Motivation';
  if (/future|goal|5 year|where.*see/i.test(q)) return 'Career Goals';
  if (/problem|solve|approach|decision/i.test(q)) return 'Problem Solving';
  return 'General';
}

function generateFallbackQuestions(context: InterviewContext): PracticeQuestion[] {
  const role = context.jobTitle || 'this role';
  const company = context.companyName || 'the company';
  return [
    { id: 'f1', question: `Tell me about yourself and why you're interested in the ${role} role at ${company}.`, category: 'Introduction', expectedTopics: ['Background', 'Motivation', 'Relevant experience'] },
    { id: 'f2', question: `What's the most challenging project you've worked on, and what was your approach?`, category: 'Experience', expectedTopics: ['Problem', 'Action', 'Result'] },
    { id: 'f3', question: `Describe a time you disagreed with a teammate or manager. How did you handle it?`, category: 'Teamwork', expectedTopics: ['Situation', 'Resolution', 'Learning'] },
    { id: 'f4', question: `What do you consider your greatest professional strength? Can you give a specific example?`, category: 'Behavioral', expectedTopics: ['Strength', 'Example', 'Impact'] },
    { id: 'f5', question: `Where do you see yourself in five years, and how does this role fit into that vision?`, category: 'Career Goals', expectedTopics: ['Vision', 'Growth', 'Alignment'] },
  ];
}

function parseFeedback(text: string, question: string): PracticeAnswer {
  const strengths: string[] = [];
  const improvements: string[] = [];
  let score = 6;

  const lines = text.split('\n');
  let section: 'strengths' | 'improvements' | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/strength|did well|positive|good/i.test(trimmed) && trimmed.length < 40) {
      section = 'strengths';
      continue;
    }
    if (/improve|area|work on|could be better|suggest/i.test(trimmed) && trimmed.length < 40) {
      section = 'improvements';
      continue;
    }
    if (/score|rating/i.test(trimmed)) {
      const match = trimmed.match(/(\d+)/);
      if (match) score = Math.min(10, Math.max(1, parseInt(match[1])));
    }

    if (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.match(/^\d+[.)]/)) {
      const point = trimmed.replace(/^[-•\d.)\s]+/, '').trim();
      if (point.length > 5) {
        if (section === 'strengths') strengths.push(point);
        else if (section === 'improvements') improvements.push(point);
      }
    }
  }

  if (strengths.length === 0) strengths.push('You answered the question directly');
  if (improvements.length === 0) improvements.push('Consider adding a specific example');

  return {
    questionId: '',
    answer: '',
    feedback: text,
    score,
    strengths: strengths.slice(0, 3),
    improvements: improvements.slice(0, 3),
  };
}

function generateSummary(answers: PracticeAnswer[], avgScore: number): string {
  if (answers.length === 0) return 'No answers recorded.';

  const strengths = answers.flatMap((a) => a.strengths);
  const improvements = answers.flatMap((a) => a.improvements);

  const level =
    avgScore >= 8 ? 'excellent — you are well-prepared and articulate' :
    avgScore >= 6 ? 'good — you have solid fundamentals with room to refine' :
    avgScore >= 4 ? 'developing — focus on structure and specific examples' :
    'needs improvement — practice more and prepare concrete examples';

  return `Overall Assessment: ${avgScore.toFixed(1)}/10 — ${level}.

Key strengths across your answers:
${strengths.slice(0, 3).map((s) => `• ${s}`).join('\n')}

Top areas to work on:
${improvements.slice(0, 3).map((i) => `• ${i}`).join('\n')}

Tip: Use the STAR method (Situation, Task, Action, Result) to structure your answers. Practice makes permanent — run another session to improve.`;
}

export default PracticePanel;