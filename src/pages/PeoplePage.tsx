import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User2, Plus, Eye, Layers, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import AddPersonDialog from "@/components/people/AddPersonDialog";
import EmptyState from "@/components/EmptyState";
import PageGuide from "@/components/PageGuide";
import InfluencerLeaderboard from "@/components/people/InfluencerLeaderboard";

interface PersonRow {
  person_id: string;
  tier: string | null;
  status: string | null;
  impact_score: number | null;
  reach_multiplier: number | null;
  sentiment_impact: number | null;
  mention_count: number | null;
  negative_ratio: number | null;
  people: {
    id: string;
    name: string;
    titles: string[] | null;
    follower_count: number | null;
  };
}

export default function PeoplePage() {
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const fetchPeople = () => {
    if (!currentOrg) return;
    setLoading(true);
    supabase
      .from("org_people")
      .select("person_id, tier, status, impact_score, reach_multiplier, sentiment_impact, mention_count, negative_ratio, people(id, name, titles, follower_count)")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setPeople((data as any) || []);
        setLoading(false);
      });
  };

  useEffect(() => { fetchPeople(); }, [currentOrg]);

  // Build leaderboard data
  const leaderboardPeople = people
    .filter(p => p.people)
    .map(p => ({
      person_id: p.person_id,
      name: p.people.name,
      tier: p.tier,
      follower_count: p.people.follower_count,
      impact_score: p.impact_score || calculateImpactScore(p),
      reach_multiplier: p.reach_multiplier || calculateReachMultiplier(p.people.follower_count),
      sentiment_impact: p.sentiment_impact,
      mention_count: p.mention_count,
      negative_ratio: p.negative_ratio,
    }));

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">People</h1>
          <p className="text-sm text-muted-foreground mt-1">Executive exposure and people tracking</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Add Person
        </Button>
      </div>

      <PageGuide
        title="How People Tracking Works"
        subtitle="Monitor key individuals across your reputation landscape"
        steps={[
          {
            icon: <User2 className="h-4 w-4 text-primary" />,
            title: "1. Add Key People",
            description: "Add executives, influencers, or public figures. Assign a monitoring tier (Executive, Spokesperson, etc.) to prioritize tracking.",
          },
          {
            icon: <Eye className="h-4 w-4 text-primary" />,
            title: "2. Auto-Linked Mentions",
            description: "When scans detect mentions of tracked people, they're automatically linked to their profile — building a cross-platform exposure timeline.",
          },
          {
            icon: <TrendingUp className="h-4 w-4 text-primary" />,
            title: "3. Track Sentiment & Exposure",
            description: "Each person's profile shows sentiment trends, follower reach, social handles, and all linked mentions across platforms.",
          },
        ]}
        integrations={[
          { label: "Mentions", to: "/mentions", description: "See people-linked mentions" },
          { label: "Scans", to: "/scans", description: "Scans auto-detect people" },
          { label: "Contacts", to: "/contacts", description: "Internal directory" },
        ]}
        tip="People with higher tiers (Executive, Spokesperson) are given priority in risk scoring. Add social handles to improve cross-platform matching accuracy."
      />

      {/* Influencer Leaderboard */}
      {!loading && leaderboardPeople.length > 0 && (
        <InfluencerLeaderboard people={leaderboardPeople} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-lg" />)
        ) : people.length === 0 ? (
          <div className="col-span-full">
            <EmptyState
              icon={User2}
              title="No people tracked yet"
              description="Add key individuals — executives, influencers, or public figures — to track their exposure across your monitored landscape."
              actionLabel="Add Person"
              onAction={() => setAddOpen(true)}
            />
          </div>
        ) : (
          people.map(p => (
            <Card key={p.person_id} className="bg-card border-border p-5 hover:border-primary/30 transition-colors cursor-pointer space-y-4" onClick={() => navigate(`/people/${p.person_id}`)}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-card-foreground">{p.people?.name}</div>
                    <div className="text-xs text-muted-foreground">{p.people?.titles?.[0] || "—"}</div>
                  </div>
                </div>
                {(p.impact_score || 0) > 0 && (
                  <Badge variant="outline" className="text-[10px] border-primary/30 text-primary font-mono">
                    Impact: {Math.round(p.impact_score || 0)}
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Followers</div>
                  <div className="text-sm font-mono text-card-foreground">{p.people?.follower_count ? p.people.follower_count.toLocaleString() : "N/A"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Tier</div>
                  <Badge variant="secondary" className="text-[10px] capitalize">{p.tier || "other"}</Badge>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Mentions</div>
                  <div className="text-sm font-mono text-card-foreground">{p.mention_count || 0}</div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <AddPersonDialog open={addOpen} onOpenChange={setAddOpen} onSaved={fetchPeople} />
    </div>
  );
}

// Client-side impact score calculation (used as fallback when not yet scored by backend)
function calculateImpactScore(p: PersonRow): number {
  const followers = p.people?.follower_count || 0;
  const mentions = p.mention_count || 0;
  const reachScore = Math.min(40, Math.log10(Math.max(followers, 1)) * 10);
  const mentionScore = Math.min(30, mentions * 3);
  const tierBonus = p.tier === "executive" ? 20 : p.tier === "influencer" ? 15 : p.tier === "journalist" ? 10 : p.tier === "critic" ? 12 : 5;
  return Math.round(reachScore + mentionScore + tierBonus);
}

function calculateReachMultiplier(followerCount: number | null): number {
  const f = followerCount || 0;
  if (f >= 1000000) return 5.0;
  if (f >= 100000) return 3.0;
  if (f >= 10000) return 2.0;
  if (f >= 1000) return 1.5;
  return 1.0;
}
