import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, AlertTriangle, Flag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";

interface Mention {
  id: string;
  source: string;
  author_name: string | null;
  author_handle: string | null;
  content: string | null;
  sentiment_label: string | null;
  severity: string | null;
  posted_at: string | null;
  author_follower_count: number | null;
  flags: any;
}

const severityColors: Record<string, string> = {
  low: "border-sentinel-emerald/30 text-sentinel-emerald bg-sentinel-emerald/5",
  medium: "border-sentinel-amber/30 text-sentinel-amber bg-sentinel-amber/5",
  high: "border-sentinel-red/30 text-sentinel-red bg-sentinel-red/5",
  critical: "border-sentinel-red/50 text-sentinel-red bg-sentinel-red/10",
};

const sentimentColors: Record<string, string> = {
  positive: "text-sentinel-emerald",
  negative: "text-sentinel-red",
  neutral: "text-muted-foreground",
  mixed: "text-sentinel-amber",
};

export default function MentionsPage() {
  const { currentOrg } = useOrg();
  const navigate = useNavigate();
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);
    supabase
      .from("mentions")
      .select("id, source, author_name, author_handle, content, sentiment_label, severity, posted_at, author_follower_count, flags")
      .eq("org_id", currentOrg.id)
      .order("posted_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setMentions(data || []);
        setLoading(false);
      });
  }, [currentOrg]);

  const filtered = search
    ? mentions.filter(m => m.content?.toLowerCase().includes(search.toLowerCase()) || m.author_name?.toLowerCase().includes(search.toLowerCase()))
    : mentions;

  const formatReach = (count: number | null) => {
    if (!count) return "0";
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return String(count);
  };

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return `${Math.floor(diff / 60000)}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mentions</h1>
        <p className="text-sm text-muted-foreground mt-1">All detected mentions across sources</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search mentions..." className="pl-9 bg-card border-border" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)
        ) : filtered.length === 0 ? (
          <Card className="bg-card border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">No mentions found. Run a scan to start collecting data.</p>
          </Card>
        ) : (
          filtered.map(m => {
            const flags = m.flags as any || {};
            return (
              <Card
                key={m.id}
                className="bg-card border-border p-5 hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => navigate(`/mentions/${m.id}`)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{m.source}</Badge>
                      <span className="text-xs text-muted-foreground">by {m.author_name || m.author_handle || "Unknown"}</span>
                      <span className="text-xs text-muted-foreground">· {timeAgo(m.posted_at)}</span>
                      {flags.emergency && (
                        <Badge className="bg-sentinel-red/10 text-sentinel-red border-sentinel-red/30 text-[10px]">
                          <AlertTriangle className="h-3 w-3 mr-1" />Emergency
                        </Badge>
                      )}
                      {flags.false_claim && (
                        <Badge className="bg-sentinel-amber/10 text-sentinel-amber border-sentinel-amber/30 text-[10px]">
                          <Flag className="h-3 w-3 mr-1" />False Claim
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-card-foreground line-clamp-2">{m.content || "No content"}</p>
                  </div>
                  <div className="text-right space-y-2 shrink-0">
                    <Badge variant="outline" className={`text-[10px] ${severityColors[m.severity || "low"]}`}>
                      {m.severity || "low"}
                    </Badge>
                    <div className={`text-xs font-medium ${sentimentColors[m.sentiment_label || "neutral"]}`}>{m.sentiment_label || "neutral"}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{formatReach(m.author_follower_count)} reach</div>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
