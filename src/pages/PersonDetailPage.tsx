import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Breadcrumbs from "@/components/Breadcrumbs";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  User2, ArrowLeft, MessageSquareWarning, Globe, Shield,
  TrendingUp, Users, Gauge, Hash, ExternalLink, StickyNote, Plus
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import PersonTrendChart from "@/components/people/PersonTrendChart";

interface Person {
  id: string;
  name: string;
  titles: string[] | null;
  follower_count: number | null;
  handles: any;
  links: string[] | null;
}

interface OrgPerson {
  tier: string | null;
  status: string | null;
  confidence: number | null;
  evidence: string | null;
}

interface LinkedMention {
  id: string;
  content: string | null;
  source: string;
  sentiment_label: string | null;
  severity: string | null;
  posted_at: string | null;
}

const SENTIMENT_COLORS: Record<string, string> = {
  negative: "hsl(0, 84%, 60%)",
  neutral: "hsl(220, 9%, 46%)",
  positive: "hsl(142, 71%, 45%)",
  mixed: "hsl(35, 92%, 50%)",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg p-2 shadow-lg text-xs">
      <p className="text-muted-foreground capitalize">{label}</p>
      <p className="font-medium" style={{ color: payload[0]?.fill }}>{payload[0]?.value} mentions</p>
    </div>
  );
};

export default function PersonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [person, setPerson] = useState<Person | null>(null);
  const [orgPerson, setOrgPerson] = useState<OrgPerson | null>(null);
  const [mentions, setMentions] = useState<LinkedMention[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (!id || !currentOrg) return;
    setLoading(true);

    const [personRes, orgPersonRes, linksRes] = await Promise.all([
      supabase.from("people").select("*").eq("id", id).single(),
      supabase.from("org_people").select("tier, status, confidence, evidence").eq("person_id", id).eq("org_id", currentOrg.id).maybeSingle(),
      supabase.from("mention_people").select("mention_id").eq("person_id", id),
    ]);

    setPerson(personRes.data as Person | null);
    setOrgPerson(orgPersonRes.data as OrgPerson | null);

    const mentionIds = (linksRes.data || []).map((l: any) => l.mention_id);
    if (mentionIds.length > 0) {
      const { data } = await supabase
        .from("mentions")
        .select("id, content, source, sentiment_label, severity, posted_at")
        .in("id", mentionIds)
        .eq("org_id", currentOrg.id)
        .order("posted_at", { ascending: false })
        .limit(50);
      setMentions(data || []);
    } else {
      setMentions([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id, currentOrg]);

  const handleTierChange = async (newTier: string) => {
    if (!id || !currentOrg || !orgPerson) return;
    const { error } = await supabase
      .from("org_people")
      .update({ tier: newTier })
      .eq("person_id", id)
      .eq("org_id", currentOrg.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setOrgPerson({ ...orgPerson, tier: newTier });
      toast({ title: "Tier updated" });
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!id || !currentOrg || !orgPerson) return;
    const { error } = await supabase
      .from("org_people")
      .update({ status: newStatus })
      .eq("person_id", id)
      .eq("org_id", currentOrg.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setOrgPerson({ ...orgPerson, status: newStatus });
      toast({ title: "Status updated" });
    }
  };

  const timeAgo = (d: string | null) => d ? formatDistanceToNow(new Date(d), { addSuffix: true }) : "—";

  // Sentiment distribution
  const sentimentCounts = mentions.reduce<Record<string, number>>((acc, m) => {
    const label = m.sentiment_label || "neutral";
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  const sentimentData = Object.entries(sentimentCounts).map(([name, value]) => ({ name, value }));

  // Parse handles
  const handles = person?.handles || {};
  const handleEntries = Object.entries(handles as Record<string, string>).filter(([, v]) => v);

  const confidencePct = orgPerson?.confidence != null 
    ? (Number(orgPerson.confidence) > 1 ? Math.round(Number(orgPerson.confidence)) : Math.round(Number(orgPerson.confidence) * 100))
    : null;

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-up">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!person) {
    return (
      <div className="space-y-4 animate-fade-up">
        <Button variant="ghost" size="sm" onClick={() => navigate("/people")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Card className="bg-card border-border p-8 text-center">
          <p className="text-muted-foreground">Person not found.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Breadcrumbs */}
      <Breadcrumbs items={[
        { label: "People", href: "/people" },
        { label: person.name },
      ]} />

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <User2 className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">{person.name}</h1>
          {person.titles && person.titles.length > 0 && (
            <p className="text-sm text-muted-foreground">{person.titles.join(" · ")}</p>
          )}
        </div>
        {orgPerson && (
          <div className="flex items-center gap-2">
            <Select value={orgPerson.tier || "other"} onValueChange={handleTierChange}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="executive">Executive</SelectItem>
                <SelectItem value="influencer">Influencer</SelectItem>
                <SelectItem value="journalist">Journalist</SelectItem>
                <SelectItem value="critic">Critic</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Select value={orgPerson.status || "suggested"} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="suggested">Suggested</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Profile + Stats row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Profile card */}
        <Card className="bg-card border-border p-5 space-y-5 lg:col-span-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <span className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Followers</span>
              <span className="text-lg font-bold font-mono text-card-foreground">{(person.follower_count ?? 0).toLocaleString()}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground flex items-center gap-1"><MessageSquareWarning className="h-3 w-3" /> Mentions</span>
              <span className="text-lg font-bold font-mono text-card-foreground">{mentions.length}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3" /> Tier</span>
              <Badge variant="secondary" className="text-xs capitalize mt-1">{orgPerson?.tier || "other"}</Badge>
            </div>
            <div>
              <span className="text-xs text-muted-foreground flex items-center gap-1"><Gauge className="h-3 w-3" /> Confidence</span>
              <span className={`text-lg font-bold font-mono ${
                confidencePct != null ? (confidencePct >= 70 ? "text-sentinel-emerald" : confidencePct >= 40 ? "text-sentinel-amber" : "text-muted-foreground") : "text-muted-foreground"
              }`}>
                {confidencePct != null ? `${confidencePct}%` : "—"}
              </span>
            </div>
          </div>

          {/* Handles */}
          {handleEntries.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Hash className="h-3.5 w-3.5" /> Handles Across Platforms
              </h3>
              <div className="flex flex-wrap gap-2">
                {handleEntries.map(([platform, handle]) => (
                  <Badge key={platform} variant="outline" className="text-xs py-1.5 px-3">
                    <Globe className="h-3 w-3 mr-1.5" />
                    <span className="text-muted-foreground capitalize mr-1">{platform}:</span>
                    <span className="text-card-foreground">{handle}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Links */}
          {person.links && person.links.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Links</h3>
              <div className="space-y-1">
                {person.links.map((link, i) => (
                  <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> {link}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Notes / Evidence */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <StickyNote className="h-3.5 w-3.5" /> Monitoring Notes
            </h3>
            <Textarea
              placeholder="Add notes about this person — why they're tracked, known affiliations, past incidents..."
              value={orgPerson?.evidence || ""}
              onChange={async (e) => {
                if (!id || !currentOrg || !orgPerson) return;
                const val = e.target.value;
                setOrgPerson({ ...orgPerson, evidence: val });
                await supabase.from("org_people").update({ evidence: val }).eq("person_id", id).eq("org_id", currentOrg.id);
              }}
              className="min-h-[80px] text-sm"
            />
          </div>
        </Card>

        {/* Sentiment chart */}
        <Card className="bg-card border-border p-5">
          <h3 className="text-sm font-medium text-card-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" /> Sentiment Distribution
          </h3>
          {sentimentData.length === 0 ? (
            <p className="text-xs text-muted-foreground">No mention data yet.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={sentimentData}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {sentimentData.map((entry) => (
                      <Cell key={entry.name} fill={SENTIMENT_COLORS[entry.name] || "hsl(220, 9%, 46%)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1.5">
                {sentimentData.map(s => (
                  <div key={s.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: SENTIMENT_COLORS[s.name] }} />
                      <span className="text-card-foreground capitalize">{s.name}</span>
                    </div>
                    <span className="font-mono text-muted-foreground">{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Trend Charts */}
      <PersonTrendChart mentions={mentions} />

      {/* Linked Mentions */}
      <Card className="bg-card border-border p-5">
        <h3 className="text-sm font-medium text-card-foreground mb-4 flex items-center gap-2">
          <MessageSquareWarning className="h-4 w-4 text-primary" /> Linked Mentions ({mentions.length})
        </h3>
        {mentions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No mentions linked to this person yet.</p>
        ) : (
          <div className="space-y-2">
            {mentions.map(m => (
              <div
                key={m.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => navigate(`/mentions/${m.id}`)}
              >
                <div className="flex-1 min-w-0 mr-4">
                  <p className="text-sm text-card-foreground truncate">{m.content || "No content"}</p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                    <span className="capitalize">{m.source}</span>
                    {m.posted_at && <><span>·</span><span>{timeAgo(m.posted_at)}</span></>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className={`text-[10px] capitalize ${
                    m.sentiment_label === "negative" ? "border-sentinel-red/30 text-sentinel-red" :
                    m.sentiment_label === "positive" ? "border-sentinel-emerald/30 text-sentinel-emerald" :
                    "border-muted-foreground/30 text-muted-foreground"
                  }`}>
                    {m.sentiment_label || "neutral"}
                  </Badge>
                  {m.severity && m.severity !== "low" && (
                    <Badge variant="outline" className={`text-[10px] capitalize ${
                      m.severity === "critical" ? "border-sentinel-red/30 text-sentinel-red" :
                      m.severity === "high" ? "border-sentinel-amber/30 text-sentinel-amber" :
                      "border-muted-foreground/30 text-muted-foreground"
                    }`}>
                      {m.severity}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
