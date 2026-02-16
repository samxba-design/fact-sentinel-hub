import { useState, useEffect } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Target, Plus, TrendingUp, TrendingDown, Minus, MessageSquareWarning, Network, Search, ExternalLink, ArrowUpDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import EmptyState from "@/components/EmptyState";
import { useToast } from "@/hooks/use-toast";
import SuggestCompetitorsDialog from "@/components/competitors/SuggestCompetitorsDialog";

interface Competitor {
  id: string;
  name: string;
  domain: string | null;
  notes: string | null;
  mentionCount: number;
  narrativeCount: number;
  sentiment: "positive" | "negative" | "neutral" | "mixed";
}

export default function CompetitorsPage() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!currentOrg) return;
    loadCompetitors();
  }, [currentOrg]);

  const loadCompetitors = async () => {
    if (!currentOrg) return;
    setLoading(true);

    // Load keywords that are competitor type, or all keywords for cross-reference
    const { data: keywords } = await supabase
      .from("keywords")
      .select("*")
      .eq("org_id", currentOrg.id)
      .eq("type", "competitor");

    if (!keywords || keywords.length === 0) {
      setCompetitors([]);
      setLoading(false);
      return;
    }

    // For each competitor keyword, count mentions referencing that term
    const comps: Competitor[] = await Promise.all(
      keywords.map(async (kw) => {
        const term = `%${kw.value}%`;
        const [mentionRes, narrativeRes] = await Promise.all([
          supabase.from("mentions").select("id, sentiment_label", { count: "exact" }).eq("org_id", currentOrg.id).ilike("content", term),
          supabase.from("narratives").select("id", { count: "exact" }).eq("org_id", currentOrg.id).ilike("name", term),
        ]);

        const mentions = mentionRes.data || [];
        const sentiments = mentions.map(m => m.sentiment_label).filter(Boolean);
        const negCount = sentiments.filter(s => s === "negative").length;
        const posCount = sentiments.filter(s => s === "positive").length;
        let sentiment: Competitor["sentiment"] = "neutral";
        if (negCount > posCount) sentiment = "negative";
        else if (posCount > negCount) sentiment = "positive";
        else if (negCount > 0 && posCount > 0) sentiment = "mixed";

        return {
          id: kw.id,
          name: kw.value,
          domain: null,
          notes: null,
          mentionCount: mentionRes.count || 0,
          narrativeCount: narrativeRes.count || 0,
          sentiment,
        };
      })
    );

    setCompetitors(comps);
    setLoading(false);
  };

  const addCompetitor = async () => {
    if (!newName.trim() || !currentOrg) return;
    const { error } = await supabase.from("keywords").insert({
      org_id: currentOrg.id,
      type: "competitor",
      value: newName.trim(),
      status: "active",
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Competitor added", description: `Now tracking "${newName.trim()}"` });
    setNewName("");
    setNewDomain("");
    setNewNotes("");
    setAddOpen(false);
    loadCompetitors();
  };

  const sentimentIcon = (s: Competitor["sentiment"]) => {
    if (s === "positive") return <TrendingUp className="h-4 w-4 text-[hsl(var(--sentinel-emerald))]" />;
    if (s === "negative") return <TrendingDown className="h-4 w-4 text-destructive" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const sentimentColor = (s: Competitor["sentiment"]) => {
    if (s === "positive") return "bg-[hsl(var(--sentinel-emerald))]/10 text-[hsl(var(--sentinel-emerald))]";
    if (s === "negative") return "bg-destructive/10 text-destructive";
    if (s === "mixed") return "bg-[hsl(var(--sentinel-amber))]/10 text-[hsl(var(--sentinel-amber))]";
    return "bg-muted/30 text-muted-foreground";
  };

  const filtered = competitors.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalMentions = competitors.reduce((s, c) => s + c.mentionCount, 0);
  const totalNarratives = competitors.reduce((s, c) => s + c.narrativeCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Competitor Analysis</h1>
          <p className="text-sm text-muted-foreground mt-1">Track competitors across your monitored landscape</p>
        </div>
        <div className="flex gap-2">
          <SuggestCompetitorsDialog onAdded={loadCompetitors} />
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Add Manually</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Competitor</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Competitor Name *</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Acme Corp" />
                <p className="text-xs text-muted-foreground mt-1">This name will be tracked across all scans and mentions</p>
              </div>
              <div>
                <Label>Domain (optional)</Label>
                <Input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="acmecorp.com" />
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Key things to watch for..." rows={3} />
              </div>
              <Button onClick={addCompetitor} disabled={!newName.trim()} className="w-full">
                Start Tracking
              </Button>
            </div>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Competitors Tracked</p>
                <p className="text-2xl font-bold text-foreground">{competitors.length}</p>
              </div>
              <Target className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Competitor Mentions</p>
                <p className="text-2xl font-bold text-foreground">{totalMentions}</p>
              </div>
              <MessageSquareWarning className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Related Narratives</p>
                <p className="text-2xl font-bold text-foreground">{totalNarratives}</p>
              </div>
              <Network className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Filter competitors..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Competitor cards */}
      {loading ? (
        <div className="text-sm text-muted-foreground animate-pulse py-12 text-center">Loading competitors...</div>
      ) : competitors.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No competitors tracked yet"
          description="Add competitors to monitor how they're mentioned across your scanned landscape. Compare sentiment, narrative overlap, and mention volume."
          actionLabel="Add First Competitor"
          onAction={() => setAddOpen(true)}
        />
      ) : (
        <div className="grid gap-4">
          {filtered.map(comp => (
            <Card key={comp.id} className="hover:border-primary/30 transition-colors">
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Target className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{comp.name}</h3>
                      {comp.domain && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" />{comp.domain}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">{comp.mentionCount}</p>
                      <p className="text-xs text-muted-foreground">Mentions</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">{comp.narrativeCount}</p>
                      <p className="text-xs text-muted-foreground">Narratives</p>
                    </div>
                    <Badge className={sentimentColor(comp.sentiment)}>
                      {sentimentIcon(comp.sentiment)}
                      <span className="ml-1 capitalize">{comp.sentiment}</span>
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
