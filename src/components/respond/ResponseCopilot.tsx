import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Copy, MessageCircleReply, FileText, Newspaper, Mail, Twitter, Sparkles, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";

interface ResponseCopilotProps {
  prefillText?: string;
  mentionId?: string;
  narrativeContext?: string;
}

const OUTPUT_FORMATS = [
  { value: "tweet", label: "Tweet / X Post", icon: Twitter, maxChars: 280 },
  { value: "press_statement", label: "Press Statement", icon: Newspaper, maxChars: null },
  { value: "internal_memo", label: "Internal Memo", icon: FileText, maxChars: null },
  { value: "email_reply", label: "Email Reply", icon: Mail, maxChars: null },
  { value: "social_post", label: "Social Media Post", icon: MessageCircleReply, maxChars: null },
];

const TONES = ["professional", "empathetic", "authoritative", "urgent", "reassuring"];

export default function ResponseCopilot({ prefillText, mentionId, narrativeContext }: ResponseCopilotProps) {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [context, setContext] = useState(prefillText || "");
  const [format, setFormat] = useState("tweet");
  const [tone, setTone] = useState("professional");
  const [generating, setGenerating] = useState(false);
  const [variants, setVariants] = useState<string[]>([]);

  const handleGenerate = async () => {
    if (!currentOrg || !context.trim()) return;
    setGenerating(true);
    setVariants([]);
    try {
      const { data, error } = await supabase.functions.invoke("generate-copilot-response", {
        body: {
          org_id: currentOrg.id,
          context: context.trim(),
          format,
          tone,
          mention_id: mentionId || null,
          narrative_context: narrativeContext || null,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setVariants(data?.variants || [data?.message || "No response generated"]);
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const selectedFormat = OUTPUT_FORMATS.find(f => f.value === format);

  return (
    <div className="space-y-4">
      <Card className="bg-card border-border p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Response Copilot
        </div>

        <div className="space-y-2">
          <Label>What do you need to respond to?</Label>
          <Textarea
            value={context}
            onChange={e => setContext(e.target.value)}
            placeholder="Paste the negative post, describe the situation, or provide context..."
            className="min-h-[80px] bg-muted border-border"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Output Format</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger className="bg-muted border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTPUT_FORMATS.map(f => (
                  <SelectItem key={f.value} value={f.value}>
                    <span className="flex items-center gap-2">
                      <f.icon className="h-3.5 w-3.5" /> {f.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger className="bg-muted border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map(t => (
                  <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={handleGenerate} disabled={generating || !context.trim()} className="w-full gap-2">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generating ? "Generating variants..." : "Generate Response"}
        </Button>
      </Card>

      {variants.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <MessageCircleReply className="h-4 w-4 text-primary" />
              {variants.length} Variant{variants.length > 1 ? "s" : ""} Generated
            </h3>
            <Button size="sm" variant="ghost" onClick={handleGenerate} disabled={generating} className="gap-1.5 text-xs">
              <RefreshCw className="h-3 w-3" /> Regenerate
            </Button>
          </div>

          {variants.map((v, i) => (
            <Card key={i} className="bg-card border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-[10px] gap-1">
                  {selectedFormat && <selectedFormat.icon className="h-3 w-3" />}
                  Variant {i + 1}
                </Badge>
                <div className="flex items-center gap-2">
                  {selectedFormat?.maxChars && (
                    <span className={`text-[10px] font-mono ${v.length > selectedFormat.maxChars ? "text-destructive" : "text-muted-foreground"}`}>
                      {v.length}/{selectedFormat.maxChars}
                    </span>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => copyText(v)} className="h-7 gap-1 text-xs">
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                </div>
              </div>
              <div className="text-sm text-card-foreground whitespace-pre-wrap leading-relaxed bg-muted/50 rounded-lg p-3 border border-border">
                {v}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
