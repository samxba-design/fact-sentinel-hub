import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Link, User, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface AddMentionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

const SOURCE_OPTIONS = [
  { value: "twitter", label: "X (Twitter)" },
  { value: "reddit", label: "Reddit" },
  { value: "youtube", label: "YouTube" },
  { value: "youtube_comment", label: "YouTube Comment" },
  { value: "news", label: "News Article" },
  { value: "blog", label: "Blog" },
  { value: "forum", label: "Forum" },
  { value: "trustpilot", label: "Trustpilot" },
  { value: "g2", label: "G2" },
  { value: "glassdoor", label: "Glassdoor" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" },
  { value: "other", label: "Other" },
];

const SENTIMENT_OPTIONS = [
  { value: "positive", label: "Positive" },
  { value: "negative", label: "Negative" },
  { value: "neutral", label: "Neutral" },
  { value: "mixed", label: "Mixed" },
];

const SEVERITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export default function AddMentionDialog({ open, onOpenChange, onCreated }: AddMentionDialogProps) {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [source, setSource] = useState("twitter");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [authorHandle, setAuthorHandle] = useState("");
  const [sentimentLabel, setSentimentLabel] = useState("neutral");
  const [severity, setSeverity] = useState("low");
  const [postedAt, setPostedAt] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");

  const resetForm = () => {
    setSource("twitter");
    setUrl("");
    setContent("");
    setAuthorName("");
    setAuthorHandle("");
    setSentimentLabel("neutral");
    setSeverity("low");
    setPostedAt(new Date().toISOString().split("T")[0]);
    setNotes("");
  };

  const handleSubmit = async () => {
    if (!currentOrg || !content.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("mentions").insert({
        org_id: currentOrg.id,
        source,
        url: url.trim() || null,
        content: notes.trim() ? `${content.trim()}\n\n---\nContext: ${notes.trim()}` : content.trim(),
        author_name: authorName.trim() || null,
        author_handle: authorHandle.trim() || null,
        sentiment_label: sentimentLabel,
        sentiment_score: sentimentLabel === "positive" ? 0.7 : sentimentLabel === "negative" ? -0.7 : sentimentLabel === "mixed" ? -0.3 : 0,
        sentiment_confidence: 1.0,
        severity,
        language: "en",
        posted_at: postedAt ? new Date(postedAt).toISOString() : new Date().toISOString(),
        status: "new",
        owner_user_id: user?.id || null,
        flags: { manual_entry: true },
        metrics: {},
      });
      if (error) throw error;
      toast({ title: "Mention added", description: "Manual mention has been recorded." });
      resetForm();
      onOpenChange(false);
      onCreated?.();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Add Mention Manually
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2 max-h-[60vh] overflow-y-auto pr-1">
          {/* Source & URL */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Date</Label>
              <Input type="date" value={postedAt} onChange={e => setPostedAt(e.target.value)} />
            </div>
          </div>

          {/* URL */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Link className="h-3 w-3" /> URL / Link
            </Label>
            <Input
              placeholder="https://twitter.com/user/status/123..."
              value={url}
              onChange={e => setUrl(e.target.value)}
            />
          </div>

          {/* Content */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <FileText className="h-3 w-3" /> Content *
            </Label>
            <Textarea
              placeholder="Paste the tweet, post, comment, or article text here..."
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>

          {/* Author */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" /> Author Name
              </Label>
              <Input
                placeholder="John Doe"
                value={authorName}
                onChange={e => setAuthorName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Handle / Username</Label>
              <Input
                placeholder="@johndoe"
                value={authorHandle}
                onChange={e => setAuthorHandle(e.target.value)}
              />
            </div>
          </div>

          {/* Sentiment & Severity */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Sentiment</Label>
              <Select value={sentimentLabel} onValueChange={setSentimentLabel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SENTIMENT_OPTIONS.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Severity</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Additional context */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Additional Context (optional)</Label>
            <Textarea
              placeholder="Why is this important? Any additional context for the team..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || !content.trim()}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Add Mention
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
