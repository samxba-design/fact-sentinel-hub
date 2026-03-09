import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, UserPlus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SuggestedPerson {
  author_name: string;
  author_handle: string | null;
  mention_count: number;
  negative_count: number;
  source: string;
}

export default function WatchlistDiscoveryWidget() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [suggestions, setSuggestions] = useState<SuggestedPerson[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    if (!currentOrg) return;
    discoverPeople();
  }, [currentOrg]);

  const discoverPeople = async () => {
    if (!currentOrg) return;
    setLoading(true);

    // Get existing tracked people names to exclude
    const { data: existing } = await supabase
      .from("org_people")
      .select("people(name)")
      .eq("org_id", currentOrg.id);
    const trackedNames = new Set((existing || []).map((e: any) => e.people?.name?.toLowerCase()).filter(Boolean));

    // Find frequently mentioned authors not yet tracked
    const { data: mentions } = await supabase
      .from("mentions")
      .select("author_name, author_handle, source, sentiment_label")
      .eq("org_id", currentOrg.id)
      .not("author_name", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);

    if (!mentions || mentions.length === 0) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    // Aggregate by author
    const authorMap = new Map<string, { handle: string | null; count: number; negCount: number; source: string }>();
    for (const m of mentions) {
      const name = m.author_name?.trim();
      if (!name || trackedNames.has(name.toLowerCase())) continue;
      const existing = authorMap.get(name);
      if (existing) {
        existing.count++;
        if (m.sentiment_label === "negative") existing.negCount++;
      } else {
        authorMap.set(name, {
          handle: m.author_handle,
          count: 1,
          negCount: m.sentiment_label === "negative" ? 1 : 0,
          source: m.source,
        });
      }
    }

    // Sort by count, filter min 2 mentions
    const sorted = Array.from(authorMap.entries())
      .filter(([, v]) => v.count >= 2)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([name, v]) => ({
        author_name: name,
        author_handle: v.handle,
        mention_count: v.count,
        negative_count: v.negCount,
        source: v.source,
      }));

    setSuggestions(sorted);
    setLoading(false);
  };

  const handleAdd = async (s: SuggestedPerson) => {
    if (!currentOrg) return;
    setAdding(s.author_name);

    // Create person
    const { data: person, error: pErr } = await supabase
      .from("people")
      .insert({
        name: s.author_name,
        handles: s.author_handle ? { [s.source]: s.author_handle } : {},
      })
      .select("id")
      .single();

    if (pErr || !person) {
      toast({ title: "Error adding person", description: pErr?.message, variant: "destructive" });
      setAdding(null);
      return;
    }

    const tier = s.negative_count / s.mention_count > 0.5 ? "critic" : "influencer";
    await supabase.from("org_people").insert({
      org_id: currentOrg.id,
      person_id: person.id,
      tier,
      status: "suggested",
      mention_count: s.mention_count,
      negative_ratio: s.mention_count > 0 ? s.negative_count / s.mention_count : 0,
    });

    toast({ title: `${s.author_name} added to watchlist` });
    setSuggestions(prev => prev.filter(p => p.author_name !== s.author_name));
    setAdding(null);
  };

  const handleDismiss = (name: string) => {
    setDismissed(prev => new Set(prev).add(name));
  };

  const visible = suggestions.filter(s => !dismissed.has(s.author_name));

  if (loading) return <Skeleton className="h-48 rounded-lg" />;
  if (visible.length === 0) return null;

  return (
    <Card className="bg-card border-border p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-card-foreground">Suggested People to Track</span>
        <Badge variant="secondary" className="text-[10px]">{visible.length}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Frequently mentioned authors in your mentions who aren't tracked yet.
      </p>
      <div className="space-y-2">
        {visible.map(s => (
          <div key={s.author_name} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/20 border border-border">
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-card-foreground">{s.author_name}</span>
              {s.author_handle && (
                <span className="text-[10px] text-muted-foreground ml-1.5">@{s.author_handle}</span>
              )}
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                <span>{s.mention_count} mentions</span>
                {s.negative_count > 0 && (
                  <span className="text-sentinel-red">{s.negative_count} negative</span>
                )}
                <span className="capitalize">{s.source}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => handleDismiss(s.author_name)}
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                disabled={adding === s.author_name}
                onClick={() => handleAdd(s)}
              >
                <UserPlus className="h-3 w-3" />
                Track
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
