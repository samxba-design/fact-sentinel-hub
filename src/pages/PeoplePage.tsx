import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";

interface PersonRow {
  person_id: string;
  tier: string | null;
  status: string | null;
  people: {
    id: string;
    name: string;
    titles: string[] | null;
    follower_count: number | null;
  };
}

export default function PeoplePage() {
  const { currentOrg } = useOrg();
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);
    supabase
      .from("org_people")
      .select("person_id, tier, status, people(id, name, titles, follower_count)")
      .eq("org_id", currentOrg.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setPeople((data as any) || []);
        setLoading(false);
      });
  }, [currentOrg]);

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-foreground">People</h1>
        <p className="text-sm text-muted-foreground mt-1">Executive exposure and people tracking</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-lg" />)
        ) : people.length === 0 ? (
          <Card className="bg-card border-border p-8 text-center col-span-full">
            <p className="text-sm text-muted-foreground">No people tracked yet. Add people via Settings or let scans detect them.</p>
          </Card>
        ) : (
          people.map(p => (
            <Card key={p.person_id} className="bg-card border-border p-5 hover:border-primary/30 transition-colors cursor-pointer space-y-4">
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
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Followers</div>
                  <div className="text-sm font-mono text-card-foreground">{p.people?.follower_count ?? 0}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Tier</div>
                  <Badge variant="secondary" className="text-[10px] capitalize">{p.tier || "other"}</Badge>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
