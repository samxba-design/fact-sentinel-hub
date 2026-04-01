import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, Link, User, FileText, Sparkles, Globe, AlertTriangle } from "lucide-react";
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
  { value: "capterra", label: "Capterra" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" },
  { value: "facebook", label: "Facebook" },
  { value: "discord", label: "Discord" },
  { value: "apple-app-store", label: "Apple App Store" },
  { value: "google-play", label: "Google Play" },
  { value: "podcast", label: "Podcast" },
  { value: "other", label: "Other" },
];

const SENTIMENT_OPTIONS = [
  { value: "positive", label: "🟢 Positive" },
  { value: "negative", label: "🔴 Negative" },
  { value: "neutral", label: "⚪ Neutral" },
  { value: "mixed", label: "🟡 Mixed" },
];

const SEVERITY_OPTIONS = [
  { value: "low", label: "🟢 Low" },
  { value: "medium", label: "🟡 Medium" },
  { value: "high", label: "🔴 High" },
  { value: "critical", label: "🚨 Critical" },
];

export default function AddMentionDialog({ open, onOpenChange, onCreated }: AddMentionDialogProps) {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"url" | "manual">("url");

  // Shared fields
  const [source, setSource] = useState("news");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [authorHandle, setAuthorHandle] = useState("");
  const [sentimentLabel, setSentimentLabel] = useState("neutral");
  const [severity, setSeverity] = useState("low");
  const [postedAt, setPostedAt] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");

  // AI extraction state
  const [extracting, setExtracting] = useState(false);
  const [aiExtracted, setAiExtracted] = useState(false);

  const resetForm = () => {
    setSource("news");
    setUrl("");
    setContent("");
    setAuthorName("");
    setAuthorHandle("");
    setSentimentLabel("neutral");
    setSeverity("low");
    setPostedAt(new Date().toISOString().split("T")[0]);
    setNotes("");
    setAiExtracted(false);
    setMode("url");
  };

  // AI-assisted extraction from URL
  const handleExtractFromUrl = async () => {
    if (!url.trim()) {
      toast({ title: "Enter a URL first", variant: "destructive" });
      return;
    }
    setExtracting(true);
    setAiExtracted(false);
    try {
      // Step 1: Scrape the URL via Firecrawl
      const { data: scrapeData, error: scrapeError } = await supabase.functions.invoke("firecrawl-scrape", {
        body: { url: url.trim(), options: { formats: ["markdown"], onlyMainContent: true } },
      });

      if (scrapeError || !scrapeData?.success) {
        throw new Error(scrapeData?.error || scrapeError?.message || "Failed to fetch page");
      }

      const rawContent = scrapeData.data?.markdown || scrapeData.markdown || "";
      const metadata = scrapeData.data?.metadata || scrapeData.metadata || {};

      if (!rawContent || rawContent.length < 50) {
        throw new Error("Could not extract meaningful content from this URL");
      }

      // Step 2: Use AI to analyze & structure the content
      const { data: aiData, error: aiError } = await supabase.functions.invoke("generate-ai-summary", {
        body: {
          type: "extract_mention",
          content: rawContent.slice(0, 3000),
          url: url.trim(),
          title: metadata.title || "",
        },
      });

      if (aiError) throw aiError;

      const analysis = aiData || {};

      // Auto-classify source from URL
      const urlLower = url.toLowerCase();
      let detectedSource = "news";
      if (urlLower.includes("twitter.com") || urlLower.includes("x.com")) detectedSource = "twitter";
      else if (urlLower.includes("reddit.com")) detectedSource = "reddit";
      else if (urlLower.includes("youtube.com")) detectedSource = "youtube";
      else if (urlLower.includes("linkedin.com")) detectedSource = "linkedin";
      else if (urlLower.includes("facebook.com") || urlLower.includes("fb.com")) detectedSource = "facebook";
      else if (urlLower.includes("tiktok.com")) detectedSource = "tiktok";
      else if (urlLower.includes("discord.com") || urlLower.includes("discord.gg")) detectedSource = "discord";
      else if (urlLower.includes("trustpilot.com")) detectedSource = "trustpilot";
      else if (urlLower.includes("g2.com")) detectedSource = "g2";
      else if (urlLower.includes("glassdoor.com")) detectedSource = "glassdoor";
      else if (urlLower.includes("medium.com") || urlLower.includes("substack.com") || urlLower.includes("blog")) detectedSource = "blog";
      else if (urlLower.includes("forum") || urlLower.includes("community")) detectedSource = "forum";

      // Populate fields
      setSource(detectedSource);
      setContent(analysis.summary || rawContent.slice(0, 800));
      setAuthorName(analysis.author || metadata.author || "");
      setSentimentLabel(analysis.sentiment || "neutral");
      setSeverity(analysis.severity || "low");
      if (analysis.published_date) {
        try {
          setPostedAt(new Date(analysis.published_date).toISOString().split("T")[0]);
        } catch { /* keep current */ }
      }
      setAiExtracted(true);
      toast({ title: "Content extracted", description: "Review the details below and edit before saving." });
    } catch (err: any) {
      toast({ title: "Extraction failed", description: err.message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  const handleSubmit = async () => {
    if (!currentOrg || !content.trim()) return;
    setSaving(true);
    try {
      // URL dedup check: prevent adding duplicate URLs
      if (url.trim()) {
        const normalizedUrl = url.trim().toLowerCase().replace(/\/$/, "");
        const { data: existing } = await supabase
          .from("mentions")
          .select("id")
          .eq("org_id", currentOrg.id)
          .eq("url", normalizedUrl)
          .limit(1);
        if (existing && existing.length > 0) {
          toast({ title: "Duplicate URL", description: "A mention with this URL already exists in your library.", variant: "destructive" });
          setSaving(false);
          return;
        }
      }
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
        mention_type: "brand",
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
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Add Mention
          </DialogTitle>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "url" | "manual")} className="mt-2">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="url" className="text-xs gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> From URL (AI-assisted)
            </TabsTrigger>
            <TabsTrigger value="manual" className="text-xs gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Fully Manual
            </TabsTrigger>
          </TabsList>

          <TabsContent value="url" className="space-y-4 mt-3">
            {/* URL input with extract button */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Globe className="h-3 w-3" /> Source URL
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://example.com/article..."
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={handleExtractFromUrl}
                  disabled={extracting || !url.trim()}
                  className="shrink-0"
                >
                  {extracting ? (
                    <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Extracting...</>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Extract</>
                  )}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Paste any URL and AI will extract the content, sentiment, and details for your review.
              </p>
              {url.trim() && /facebook\.com|fb\.com|linkedin\.com|tiktok\.com|discord\.(com|gg)/i.test(url) && !aiExtracted && (
                <div className="flex items-start gap-2 mt-2 rounded-md bg-sentinel-amber/10 border border-sentinel-amber/30 p-2.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-sentinel-amber mt-0.5 shrink-0" />
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">This platform requires login for most content.</strong> We'll attempt to extract public content, but if the post is behind a login wall, extraction may fail. In that case, switch to the <strong>Fully Manual</strong> tab and paste the text content directly.
                  </p>
                </div>
              )}
            </div>

            {aiExtracted && (
              <div className="bg-primary/5 rounded-lg p-3 border border-primary/20">
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="text-xs text-muted-foreground">
                    <strong className="text-foreground">AI extracted content below.</strong> Review and edit any fields before saving.
                    Sentiment and severity are AI-suggested — adjust if needed.
                  </div>
                </div>
              </div>
            )}

            {/* Show editable fields after extraction or allow manual entry */}
            {(aiExtracted || content) && renderEditableFields()}
          </TabsContent>

          <TabsContent value="manual" className="space-y-4 mt-3">
            {renderEditableFields()}
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || !content.trim()}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Add Mention
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  function renderEditableFields() {
    return (
      <div className="space-y-3">
        {/* Source & Date */}
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
            <Label className="text-xs text-muted-foreground">Date Published</Label>
            <Input type="date" value={postedAt} onChange={e => setPostedAt(e.target.value)} />
          </div>
        </div>

        {/* URL (only in manual mode) */}
        {mode === "manual" && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Link className="h-3 w-3" /> URL / Link (optional)
            </Label>
            <Input
              placeholder="https://..."
              value={url}
              onChange={e => setUrl(e.target.value)}
            />
          </div>
        )}

        {/* Content */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            <FileText className="h-3 w-3" /> Content *
          </Label>
          <Textarea
            placeholder="Paste the content here, or it will be filled by AI extraction..."
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={4}
            className="resize-none text-sm"
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
            <Label className="text-xs text-muted-foreground">Handle</Label>
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
            placeholder="Why is this important? Any context for the team..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="resize-none"
          />
        </div>
      </div>
    );
  }
}
