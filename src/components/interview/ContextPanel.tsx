import React, { useState } from 'react';
import { InterviewContext } from '@/types/interview';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PdfUploader from '@/components/interview/PdfUploader';
import {
  ChevronDown, ChevronRight, Briefcase, Building, User, FileText, Upload,
} from 'lucide-react';

interface ContextPanelProps {
  context: InterviewContext;
  onChange: (ctx: InterviewContext) => void;
  disabled?: boolean;
}

const STORAGE_KEY = 'sentiwatch-interview-copilot-context';

export function loadSavedContext(): InterviewContext | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}

export function saveContext(ctx: InterviewContext) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ctx)); } catch { /* noop */ }
}

const defaultContext: InterviewContext = {
  jobTitle: '',
  companyName: '',
  jobDescription: '',
  companyInfo: '',
  roleContext: '',
  candidateResume: '',
  candidateCoverLetter: '',
  candidateFacts: '',
  interviewStyle: 'professional',
  responseLength: 'balanced',
};

export function getDefaultContext(): InterviewContext {
  return loadSavedContext() || defaultContext;
}

const ContextPanel: React.FC<ContextPanelProps> = ({ context, onChange, disabled }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    job: true,
    company: false,
    candidate: false,
    settings: false,
  });

  const update = (field: keyof InterviewContext, value: string) => {
    const updated = { ...context, [field]: value };
    onChange(updated);
    saveContext(updated);
  };

  const appendText = (field: keyof InterviewContext, text: string) => {
    const current = context[field] || '';
    const separator = current ? '\n\n---\n\n' : '';
    update(field, current + separator + text);
  };

  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const SectionHeader = ({ icon: Icon, title, section }: { icon: unknown; title: string; section: string }) => (
    <button
      onClick={() => toggle(section)}
      className="flex items-center gap-2 w-full text-left py-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
    >
      {expanded[section] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      <Icon className="w-3.5 h-3.5" />
      {title}
    </button>
  );

  return (
    <div className="space-y-2 p-3 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Context</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={() => {
            onChange(defaultContext);
            localStorage.removeItem(STORAGE_KEY);
          }}
          disabled={disabled}
        >
          Reset
        </Button>
      </div>

      {/* ── Job Section ── */}
      <div>
        <SectionHeader icon={Briefcase} title="Job Details" section="job" />
        {expanded.job && (
          <div className="space-y-2 pl-5 mt-1">
            <PdfUploader
              label="Upload JD as PDF"
              onTextExtracted={(text, name) => {
                appendText('jobDescription', text);
              }}
              disabled={disabled}
            />
            <div>
              <Label className="text-xs">Job Title</Label>
              <Input
                value={context.jobTitle}
                onChange={(e) => update('jobTitle', e.target.value)}
                placeholder="Senior Frontend Engineer"
                className="h-8 text-xs"
                disabled={disabled}
              />
            </div>
            <div>
              <Label className="text-xs">Company</Label>
              <Input
                value={context.companyName}
                onChange={(e) => update('companyName', e.target.value)}
                placeholder="Acme Corp"
                className="h-8 text-xs"
                disabled={disabled}
              />
            </div>
            <div>
              <Label className="text-xs">Job Description</Label>
              <Textarea
                value={context.jobDescription}
                onChange={(e) => update('jobDescription', e.target.value)}
                placeholder="Paste or upload the job description..."
                className="min-h-[100px] text-xs resize-y"
                disabled={disabled}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Company Section ── */}
      <div>
        <SectionHeader icon={Building} title="Company Context" section="company" />
        {expanded.company && (
          <div className="space-y-2 pl-5 mt-1">
            <div>
              <Label className="text-xs">About the Company</Label>
              <Textarea
                value={context.companyInfo}
                onChange={(e) => update('companyInfo', e.target.value)}
                placeholder="Size, industry, culture, recent news, products..."
                className="min-h-[80px] text-xs resize-y"
                disabled={disabled}
              />
            </div>
            <div>
              <Label className="text-xs">Role Context</Label>
              <Textarea
                value={context.roleContext}
                onChange={(e) => update('roleContext', e.target.value)}
                placeholder="Team size, tech stack, reporting structure, challenges..."
                className="min-h-[60px] text-xs resize-y"
                disabled={disabled}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Candidate Section ── */}
      <div>
        <SectionHeader icon={User} title="Your Profile" section="candidate" />
        {expanded.candidate && (
          <div className="space-y-2 pl-5 mt-1">
            <PdfUploader
              label="Upload Resume as PDF"
              onTextExtracted={(text, name) => {
                appendText('candidateResume', text);
              }}
              disabled={disabled}
            />
            <div>
              <Label className="text-xs">Resume / CV</Label>
              <Textarea
                value={context.candidateResume}
                onChange={(e) => update('candidateResume', e.target.value)}
                placeholder="Paste or upload your resume..."
                className="min-h-[120px] text-xs resize-y"
                disabled={disabled}
              />
            </div>
            <div>
              <Label className="text-xs">Cover Letter</Label>
              <Textarea
                value={context.candidateCoverLetter}
                onChange={(e) => update('candidateCoverLetter', e.target.value)}
                placeholder="Your cover letter or personal pitch..."
                className="min-h-[60px] text-xs resize-y"
                disabled={disabled}
              />
            </div>
            <div>
              <Label className="text-xs">Additional Facts</Label>
              <Textarea
                value={context.candidateFacts}
                onChange={(e) => update('candidateFacts', e.target.value)}
                placeholder="Key achievements, projects, certifications, languages..."
                className="min-h-[60px] text-xs resize-y"
                disabled={disabled}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Settings ── */}
      <div>
        <SectionHeader icon={FileText} title="Style & Settings" section="settings" />
        {expanded.settings && (
          <div className="space-y-2 pl-5 mt-1">
            <div>
              <Label className="text-xs">Interview Style</Label>
              <Select
                value={context.interviewStyle}
                onValueChange={(v) => update('interviewStyle', v)}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="casual">Casual / Friendly</SelectItem>
                  <SelectItem value="technical">Technical / Deep</SelectItem>
                  <SelectItem value="startup">Startup / Energetic</SelectItem>
                  <SelectItem value="formal">Formal / Executive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Response Length</Label>
              <Select
                value={context.responseLength}
                onValueChange={(v) => update('responseLength', v as unknown)}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="concise">Concise (~45s)</SelectItem>
                  <SelectItem value="balanced">Balanced (~60s)</SelectItem>
                  <SelectItem value="detailed">Detailed (~90s)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground pt-2 border-t border-border">
        Context auto-saves to this browser. Upload PDFs to auto-extract text.
      </p>
    </div>
  );
};

export default ContextPanel;