export interface InterviewContext {
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  companyInfo: string;
  roleContext: string;
  candidateResume: string;
  candidateCoverLetter: string;
  candidateFacts: string;
  interviewStyle: string; // 'casual' | 'formal' | 'technical' | 'startup'
  responseLength: 'concise' | 'balanced' | 'detailed';
}

export interface InterviewMessage {
  id: string;
  timestamp: Date;
  speaker: 'interviewer' | 'candidate' | 'system';
  text: string;
  isQuestion: boolean;
}

export interface AIResponse {
  id: string;
  timestamp: Date;
  questionId: string;
  responseText: string;
  thinkingPoints: string[];
  confidence: number;
}

export interface AudioState {
  isCapturing: boolean;
  stream: MediaStream | null;
  error: string | null;
  audioLevel: number;
}

export interface TranscriptionState {
  isListening: boolean;
  interimText: string;
  finalText: string;
  segments: InterviewMessage[];
  error: string | null;
}

export type InterviewPhase =
  | 'idle'
  | 'setup'
  | 'capturing'
  | 'listening'
  | 'generating'
  | 'error';

export interface InterviewState {
  phase: InterviewPhase;
  context: InterviewContext;
  audio: AudioState;
  transcription: TranscriptionState;
  responses: AIResponse[];
  history: InterviewMessage[];
}