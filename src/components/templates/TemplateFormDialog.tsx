import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Template {
  id: string;
  name: string;
  template_text: string;
  scenario_type: string | null;
  tone: string | null;
  platform_length: string | null;
  status: string | null;
}

interface TemplateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: Template | null;
  onSave: (data: Omit<Template, "id">) => Promise<void>;
  saving: boolean;
}

const SCENARIOS = ["Misinformation", "Support Issue", "Scam Warning", "Outage Update", "Regulatory Rumor", "Executive Rumor", "Fee Dispute", "Security Incident"];
const TONES = ["professional", "empathetic", "authoritative", "neutral", "urgent"];
const PLATFORMS = [
  { value: "short", label: "X (short)" },
  { value: "general", label: "General" },
  { value: "long", label: "Long form" },
];
const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "under_review", label: "Under Review" },
  { value: "deprecated", label: "Deprecated" },
];

export default function TemplateFormDialog({ open, onOpenChange, template, onSave, saving }: TemplateFormDialogProps) {
  const [name, setName] = useState("");
  const [templateText, setTemplateText] = useState("");
  const [scenarioType, setScenarioType] = useState("");
  const [tone, setTone] = useState("professional");
  const [platformLength, setPlatformLength] = useState("general");
  const [status, setStatus] = useState("draft");

  useEffect(() => {
    if (template) {
      setName(template.name);
      setTemplateText(template.template_text);
      setScenarioType(template.scenario_type || "");
      setTone(template.tone || "professional");
      setPlatformLength(template.platform_length || "general");
      setStatus(template.status || "draft");
    } else {
      setName("");
      setTemplateText("");
      setScenarioType("");
      setTone("professional");
      setPlatformLength("general");
      setStatus("draft");
    }
  }, [template, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      name,
      template_text: templateText,
      scenario_type: scenarioType || null,
      tone,
      platform_length: platformLength,
      status,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">{template ? "Edit Template" : "Add Response Template"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Template Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Fee clarification response" required className="bg-muted border-border" />
          </div>

          <div className="space-y-2">
            <Label>Template Text *</Label>
            <Textarea value={templateText} onChange={e => setTemplateText(e.target.value)} placeholder="Use {FACT_1}, {FACT_2}, {LINK_1} as placeholders..." required className="min-h-[120px] bg-muted border-border font-mono text-xs" />
            <p className="text-[10px] text-muted-foreground">Use placeholders: {"{FACT_1}"}, {"{FACT_2}"}, {"{LINK_1}"} for approved facts and links.</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Scenario</Label>
              <Select value={scenarioType} onValueChange={setScenarioType}>
                <SelectTrigger className="bg-muted border-border"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {SCENARIOS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tone</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TONES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Platform</Label>
              <Select value={platformLength} onValueChange={setPlatformLength}>
                <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !name || !templateText}>
              {saving ? "Saving..." : template ? "Update Template" : "Create Template"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
