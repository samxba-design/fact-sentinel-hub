import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Sparkles, Target, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";

interface Suggestion {
  name: string;
  domain?: string;
  reason: string;
  confidence: number;
  category: "direct" | "indirect" | "emerging" | "mentioned";
}

interface Props {
  onAdded: () => void;
}

const categoryColors: Record<string, string> = {
  direct: "bg-destructive/10 text-destructive",
  indirect: "bg-[hsl(var(--sentinel-amber))]/10 text-[hsl(var(--sentinel-amber))]",
  emerging: "bg-[hsl(var(--sentinel-cyan))]/10 text-[hsl(var(--sentinel-cyan))]",
  mentioned: "bg-[hsl(var(--sentinel-purple))]/10 text-[hsl(var(--sentinel-purple))]",
};

export default function SuggestCompetitorsDialog({ onAdded }: Props) {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const fetchSuggestions = async () => {
    if (!currentOrg) return;
    setLoading(true);
    setSuggestions([]);
    setSelected(new Set());

    try {
      const { data, error } = await supabase.functions.invoke("suggest-competitors", {
        body: { org_id: currentOrg.id },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const comps = data.competitors || [];
      setSuggestions(comps);
      // Pre-select high confidence ones
      setSelected(new Set(comps.filter((c: Suggestion) => c.confidence >= 0.7).map((c: Suggestion) => c.name)));
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(suggestions.map(s => s.name)));
  const selectNone = () => setSelected(new Set());

  const addSelected = async () => {
    if (!currentOrg || selected.size === 0) return;
    setAdding(true);

    const toAdd = suggestions.filter(s => selected.has(s.name));
    const inserts = toAdd.map(s => ({
      org_id: currentOrg.id,
      type: "competitor" as const,
      value: s.name,
      status: "active" as const,
    }));

    const { error } = await supabase.from("keywords").insert(inserts);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Competitors added", description: `${selected.size} competitor${selected.size !== 1 ? "s" : ""} now being tracked` });
      setOpen(false);
      onAdded();
    }
    setAdding(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v && suggestions.length === 0) fetchSuggestions(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Sparkles className="h-4 w-4 mr-2" />
          Auto-Detect Competitors
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Competitor Suggestions
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Analyzing your industry, mentions, and market landscape...</p>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No suggestions yet. Click to analyze.</p>
            <Button className="mt-3" onClick={fetchSuggestions}>
              <Sparkles className="h-4 w-4 mr-2" /> Analyze Now
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">{suggestions.length} competitors found</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs h-7">Select All</Button>
                <Button variant="ghost" size="sm" onClick={selectNone} className="text-xs h-7">Clear</Button>
              </div>
            </div>

            <div className="space-y-2 overflow-y-auto flex-1 pr-1">
              {suggestions
                .sort((a, b) => b.confidence - a.confidence)
                .map((s) => (
                  <div
                    key={s.name}
                    className={`p-3 rounded-lg border transition-all cursor-pointer ${
                      selected.has(s.name) ? "border-primary/50 bg-primary/5" : "border-border hover:border-muted-foreground/30"
                    }`}
                    onClick={() => toggleSelect(s.name)}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox checked={selected.has(s.name)} className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-foreground">{s.name}</span>
                          <Badge className={`text-[10px] ${categoryColors[s.category] || "bg-muted/30 text-muted-foreground"}`}>
                            {s.category}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground font-mono">{Math.round(s.confidence * 100)}%</span>
                        </div>
                        {s.domain && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <ExternalLink className="h-2.5 w-2.5" />{s.domain}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">{s.reason}</p>
                      </div>
                    </div>
                  </div>
                ))}
            </div>

            <div className="flex gap-2 pt-3 border-t border-border">
              <Button variant="outline" className="flex-1" onClick={() => { setSuggestions([]); fetchSuggestions(); }}>
                <Sparkles className="h-4 w-4 mr-2" /> Re-analyze
              </Button>
              <Button className="flex-1" onClick={addSelected} disabled={selected.size === 0 || adding}>
                {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Target className="h-4 w-4 mr-2" />}
                Add {selected.size} Competitor{selected.size !== 1 ? "s" : ""}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
