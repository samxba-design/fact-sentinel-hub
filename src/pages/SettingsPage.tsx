import { useEffect, useState } from "react";
import BulkScanSchedulingTab from "@/components/settings/BulkScanSchedulingTab";
import SourceConnectionsTab from "@/components/settings/SourceConnectionsTab";
import TeamManagementTab from "@/components/settings/TeamManagementTab";
import CustomSourcesTab from "@/components/settings/CustomSourcesTab";
import IntegrationsTab from "@/components/settings/IntegrationsTab";
import DangerZoneTab from "@/components/settings/DangerZoneTab";
import SharedLinksTab from "@/components/settings/SharedLinksTab";
import KeywordsTab from "@/components/settings/KeywordsTab";
import AlertSettingsTab from "@/components/settings/AlertSettingsTab";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Key, Layers, Globe, Bell, Link2, Plus, Database, Loader2, X, Trash2, Save,
  CreditCard, Plug, Users, Settings2, Shield, Mail, Info, HelpCircle, Send,
  CheckCircle2, MessageSquare, Building2, Zap, Upload, ExternalLink, ChevronDown, ChevronUp, Clock
} from "lucide-react";
import NotificationPreferencesTab from "@/components/settings/NotificationPreferencesTab";
import PageGuide from "@/components/PageGuide";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import InfoTooltip from "@/components/InfoTooltip";

interface Keyword { id: string; type: string; value: string; locked: boolean | null }
interface Topic { id: string; name: string; org_id: string | null; is_default: boolean | null }
interface Source { id: string; type: string; enabled: boolean | null }

// ─── Info Banner Component ───
function TabInfoBanner({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 mb-5">
      <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-card-foreground">{title}</p>
        {children}
      </div>
    </div>
  );
}

// ─── Suggested topics ───
const SUGGESTED_TOPICS = [
  "Security", "Compliance", "Product / Outage", "Support", "Leadership",
  "Scams / Impersonation", "Fees / Pricing", "Withdrawals", "Listing / Delisting",
  "Partnerships", "Regulatory", "ESG / Sustainability", "Data Privacy",
  "Employee Culture", "Legal / Litigation", "Marketing / Brand"
];

// ─── Source type options with tier metadata ───
type SourceTier = "auto" | "api" | "web" | "manual";
interface SourceTypeOption {
  value: string;
  label: string;
  description: string;
  tier: SourceTier;
  tierLabel: string;
  setupNote?: string;
  setupSteps?: string[];
  apiKeyName?: string;
  fallbackNote?: string;
}

const SOURCE_TYPE_OPTIONS: SourceTypeOption[] = [
  { value: "web", label: "Web / News", description: "General websites and news articles via web crawling", tier: "auto", tierLabel: "Auto" },
  { value: "google-news", label: "Google News", description: "Mainstream press and media coverage", tier: "auto", tierLabel: "Auto" },
  { value: "reviews", label: "Review Sites", description: "Trustpilot, G2, Capterra, BBB, etc.", tier: "auto", tierLabel: "Auto", setupNote: "Crawls public review sites for your brand keywords. For specific review platforms, add them as custom sources in the Custom Sources tab." },
  { value: "app-store", label: "App Stores", description: "Apple App Store & Google Play reviews", tier: "auto", tierLabel: "Auto", setupNote: "Scans public app store listings. For best results, add your exact app store URL in the Custom Sources tab." },
  { value: "rss", label: "RSS Feeds", description: "Blog and news RSS/Atom feeds", tier: "auto", tierLabel: "Auto", setupNote: "Enables RSS feed scanning. You must add specific feed URLs in the Custom Sources tab — this toggle activates the RSS engine.", setupSteps: [
    "Enable this source to activate RSS scanning",
    "Go to the Custom Sources tab to add specific feed URLs",
    "Each feed will be checked for your keywords during scans"
  ] },
  { value: "forums", label: "Forums", description: "Community forums and discussion boards", tier: "auto", tierLabel: "Auto" },
  { value: "podcasts", label: "Podcasts", description: "Podcast titles and show notes on Spotify, Apple, etc.", tier: "web", tierLabel: "Web Discovery", setupNote: "Searches podcast directories (Spotify, Apple Podcasts, Podbean) for brand mentions in episode titles and descriptions. Cannot access full audio transcripts — accuracy depends on show notes quality." },
  { value: "reddit", label: "Reddit", description: "Reddit posts and comments", tier: "auto", tierLabel: "Auto", setupNote: "Discovers Reddit mentions via web search by default. For deeper coverage (full comment threads, subreddit monitoring), add Reddit API credentials.", setupSteps: [
    "Works immediately via web discovery — no setup needed",
    "For enhanced coverage: create a Reddit app at reddit.com/prefs/apps",
    "Choose 'script' type and note the client ID and secret",
    "Add credentials in Settings → Connections"
  ], fallbackNote: "Currently using web discovery. Add API credentials in Connections for deeper Reddit coverage." },
  { value: "youtube", label: "YouTube", description: "Video titles, descriptions, and comments", tier: "api", tierLabel: "API Key", setupNote: "Requires a free YouTube Data API key for full access to video metadata and comments. Without it, falls back to web search which only catches titles.", setupSteps: [
    "Go to Google Cloud Console → APIs & Services",
    "Enable the YouTube Data API v3",
    "Create an API key (no OAuth needed — it's free)",
    "Add it in Settings → Connections as YOUTUBE_API_KEY"
  ], apiKeyName: "YOUTUBE_API_KEY", fallbackNote: "Without API key, falls back to web search — catches video titles but misses comments and descriptions." },
  { value: "twitter", label: "X (Twitter)", description: "Tweets, threads, and replies", tier: "api", tierLabel: "API Key", setupNote: "Requires X/Twitter API credentials (Basic plan: $100/mo) for direct tweet access. Without credentials, falls back to web search which has significant gaps due to X's restrictions.", setupSteps: [
    "Apply for access at developer.x.com (Basic plan required)",
    "Create a project and app in the Developer Portal",
    "Generate API Key, API Secret, Access Token, and Access Token Secret",
    "Add all four in Settings → Connections"
  ], apiKeyName: "TWITTER_BEARER_TOKEN", fallbackNote: "Without API credentials, uses web search — catches some tweets but misses replies, threads, and real-time mentions." },
  { value: "linkedin", label: "LinkedIn", description: "Posts, articles, and company mentions", tier: "manual", tierLabel: "Manual Import", setupNote: "LinkedIn blocks automated scraping and has no public search API. Monitor LinkedIn manually and use 'Add Mention' to import — paste a public LinkedIn URL and our AI will attempt to extract what it can, or paste content directly.", setupSteps: [
    "Search LinkedIn for your brand name or monitor your company page",
    "When you find a relevant post, copy the URL or text content",
    "Go to Mentions → Add Mention → paste the URL (AI will try to extract public content)",
    "If the URL is login-gated, switch to manual mode and paste the text directly"
  ] },
  { value: "tiktok", label: "TikTok", description: "Video mentions and comments", tier: "manual", tierLabel: "Manual Import", setupNote: "TikTok has no public content search API and video content can't be scraped automatically. Browse TikTok manually and import mentions you discover.", setupSteps: [
    "Search TikTok for your brand name or hashtags",
    "Copy the video URL and/or transcribe relevant content",
    "Go to Mentions → Add Mention and paste the content",
    "Include the video URL so it's linked for reference"
  ] },
  { value: "discord", label: "Discord", description: "Server messages and threads", tier: "manual", tierLabel: "Manual Import", setupNote: "Discord content is only accessible within servers you belong to. There's no public search or API for monitoring. Copy relevant discussions manually.", setupSteps: [
    "Monitor relevant Discord servers you've joined",
    "Copy message content or use a Discord export tool (e.g. DiscordChatExporter)",
    "Go to Mentions → Add Mention to import relevant discussions",
    "For automated alerts from Discord, set up a webhook in Integrations"
  ] },
  { value: "facebook", label: "Facebook", description: "Page posts, comments, and group discussions", tier: "manual", tierLabel: "Manual Import", setupNote: "Facebook requires login to view most content and blocks all automated scraping. Their API requires a Meta-approved app with business verification — not practical for monitoring. Use 'Add Mention' to import: paste a public Facebook URL (AI will attempt extraction) or paste content directly.", setupSteps: [
    "Log into Facebook and search for your brand name",
    "Check your company page mentions, relevant groups, and public posts",
    "Go to Mentions → Add Mention → paste the post URL (works for public posts)",
    "If the post is login-gated, switch to manual mode and paste the text content instead"
  ] },
];
// ─── Source Tier Badge ───
function SourceTierBadge({ tier, label }: { tier: SourceTier; label: string }) {
  const styles: Record<SourceTier, string> = {
    auto: "bg-sentinel-emerald/10 text-sentinel-emerald border-sentinel-emerald/30",
    web: "bg-sentinel-cyan/10 text-sentinel-cyan border-sentinel-cyan/30",
    api: "bg-sentinel-amber/10 text-sentinel-amber border-sentinel-amber/30",
    manual: "bg-sentinel-purple/10 text-sentinel-purple border-sentinel-purple/30",
  };
  const icons: Record<SourceTier, React.ReactNode> = {
    auto: <Zap className="h-2.5 w-2.5" />,
    web: <Globe className="h-2.5 w-2.5" />,
    api: <Key className="h-2.5 w-2.5" />,
    manual: <Upload className="h-2.5 w-2.5" />,
  };
  return (
    <Badge variant="outline" className={`text-[9px] font-medium gap-0.5 ${styles[tier]}`}>
      {icons[tier]} {label}
    </Badge>
  );
}

export default function SettingsPage() {
  const { currentOrg, refetchOrgs } = useOrg();
  const navigate = useNavigate();
  const { user, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      toast({ title: "Subscription activated!", description: "Welcome to Pro. Your subscription is now active." });
      searchParams.delete("success");
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const [newKwValue, setNewKwValue] = useState("");
  const [newKwType, setNewKwType] = useState("brand");
  const [addingKw, setAddingKw] = useState(false);

  const [newTopicName, setNewTopicName] = useState("");
  const [addingTopic, setAddingTopic] = useState(false);

  const [newSourceType, setNewSourceType] = useState("");
  const [addingSource, setAddingSource] = useState(false);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);

  const fetchData = async () => {
    if (!currentOrg) return;
    setLoading(true);
    const [kw, tp, sr] = await Promise.all([
      supabase.from("keywords").select("id, type, value, locked").eq("org_id", currentOrg.id).order("type"),
      supabase.from("topics").select("id, name, org_id, is_default").or(`org_id.eq.${currentOrg.id},org_id.is.null`).order("name"),
      supabase.from("sources").select("id, type, enabled").eq("org_id", currentOrg.id),
    ]);
    setKeywords(kw.data || []);
    setTopics(tp.data || []);
    setSources(sr.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [currentOrg]);

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      const { data, error } = await supabase.functions.invoke("seed-demo");
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast({ title: "Demo data seeded!", description: `${data.mentions_created} mentions created` });
      await refetchOrgs();
      await fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  };

  // --- Keyword CRUD ---
  const addKeyword = async () => {
    if (!currentOrg || !newKwValue.trim()) return;
    setAddingKw(true);
    const { data, error } = await supabase.from("keywords")
      .insert({ org_id: currentOrg.id, type: newKwType, value: newKwValue.trim() })
      .select("id, type, value, locked")
      .single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (data) {
      setKeywords(prev => [...prev, data]);
      setNewKwValue("");
      toast({ title: "Keyword added" });
    }
    setAddingKw(false);
  };

  const deleteKeyword = async (kw: Keyword) => {
    const { error } = await supabase.from("keywords").delete().eq("id", kw.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setKeywords(prev => prev.filter(k => k.id !== kw.id));
      toast({ title: "Keyword removed" });
    }
  };

  // --- Topic CRUD ---
  const addTopic = async (name?: string) => {
    const topicName = name || newTopicName;
    if (!currentOrg || !topicName.trim()) return;
    if (topics.some(t => t.name.toLowerCase() === topicName.trim().toLowerCase())) {
      toast({ title: "Already exists", description: `"${topicName}" is already in your topics.`, variant: "destructive" });
      return;
    }
    setAddingTopic(true);
    const { data, error } = await supabase.from("topics")
      .insert({ org_id: currentOrg.id, name: topicName.trim() })
      .select("id, name, org_id, is_default")
      .single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (data) {
      setTopics(prev => [...prev, data]);
      if (!name) setNewTopicName("");
      toast({ title: "Topic added", description: `"${topicName}" will now be used to categorize mentions.` });
    }
    setAddingTopic(false);
  };

  const deleteTopic = async (t: Topic) => {
    const { error } = await supabase.from("topics").delete().eq("id", t.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setTopics(prev => prev.filter(tp => tp.id !== t.id));
      toast({ title: "Topic removed" });
    }
  };

  // --- Source CRUD ---
  const toggleSource = async (s: Source) => {
    const newEnabled = !s.enabled;
    const { error } = await supabase.from("sources").update({ enabled: newEnabled }).eq("id", s.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setSources(prev => prev.map(src => src.id === s.id ? { ...src, enabled: newEnabled } : src));
    }
  };

  const addSource = async () => {
    if (!currentOrg || !newSourceType) return;
    if (sources.some(s => s.type === newSourceType)) {
      toast({ title: "Already added", description: `${newSourceType} is already in your sources.`, variant: "destructive" });
      return;
    }
    setAddingSource(true);
    const { data, error } = await supabase.from("sources")
      .insert({ org_id: currentOrg.id, type: newSourceType, enabled: true })
      .select("id, type, enabled")
      .single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (data) {
      setSources(prev => [...prev, data]);
      setNewSourceType("");
      toast({ title: "Source added", description: `${newSourceType} will be included in future scans.` });
    }
    setAddingSource(false);
  };

  const deleteSource = async (s: Source) => {
    const { error } = await supabase.from("sources").delete().eq("id", s.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setSources(prev => prev.filter(src => src.id !== s.id));
      toast({ title: "Source removed" });
    }
  };

  const groupedKeywords = keywords.reduce<Record<string, Keyword[]>>((acc, k) => {
    (acc[k.type] = acc[k.type] || []).push(k);
    return acc;
  }, {});

  const existingTopicNames = new Set(topics.map(t => t.name.toLowerCase()));

  return (
    <div className="space-y-6 animate-fade-up">
      <PageGuide
        title="Settings — Monitoring configuration"
        subtitle="Configure keywords, sources, alerts, and team access."
        steps={[
          { icon: <Key className="h-4 w-4 text-primary" />, title: "Keywords by type", description: "Brand/risk/product keywords drive auto-scans. Competitor keywords are scanned separately via the Competitors page." },
          { icon: <Bell className="h-4 w-4 text-primary" />, title: "Alert thresholds", description: "Set severity thresholds and quiet hours so you only get notified when it matters." },
          { icon: <Users className="h-4 w-4 text-primary" />, title: "Team members", description: "Invite team members with roles: View (read-only), Write, Edit, or Manage (full admin)." },
        ]}
        tip="Competitor keywords won't appear in brand scans — they're always kept separate to protect your metrics."
      />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Tracking profile and organization settings</p>
        </div>
        {isSuperAdmin && (
          <Button variant="outline" onClick={handleSeedDemo} disabled={seeding}>
            {seeding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Database className="h-4 w-4 mr-2" />}
            {seeding ? "Seeding..." : "Seed Demo Data"}
          </Button>
        )}
      </div>

      <Tabs defaultValue={searchParams.get("tab") || "keywords"} className="space-y-4">
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <TabsList className="bg-muted border border-border w-max min-w-full flex-nowrap">
            <TabsTrigger value="keywords"><Key className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Keywords</span></TabsTrigger>
            <TabsTrigger value="topics"><Layers className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Topics</span></TabsTrigger>
            <TabsTrigger value="sources"><Globe className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Sources</span></TabsTrigger>
            <TabsTrigger value="scan-scheduling"><Clock className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Scan Scheduling</span></TabsTrigger>
            <TabsTrigger value="custom-sources"><Settings2 className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Custom Sources</span></TabsTrigger>
            <TabsTrigger value="alerts"><Bell className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Alerts</span></TabsTrigger>
            <TabsTrigger value="notifications"><Mail className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Notifications</span></TabsTrigger>
            <TabsTrigger value="connections"><Plug className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Connections</span></TabsTrigger>
            <TabsTrigger value="team"><Shield className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Team</span></TabsTrigger>
            <TabsTrigger value="subscription"><CreditCard className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Subscription</span></TabsTrigger>
            <TabsTrigger value="integrations"><Link2 className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Integrations</span></TabsTrigger>
            <TabsTrigger value="support"><HelpCircle className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Support</span></TabsTrigger>
            <TabsTrigger value="shared-links"><Link2 className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Shared Links</span></TabsTrigger>
            <TabsTrigger value="danger"><Trash2 className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Danger Zone</span></TabsTrigger>
          </TabsList>
        </div>

        {/* ═══ KEYWORDS TAB ═══ */}
        <TabsContent value="keywords">
          <KeywordsTab />
        </TabsContent>

                {/* ═══ TOPICS TAB ═══ */}
        <TabsContent value="topics">
          <Card className="bg-card border-border p-6 space-y-5">
            <TabInfoBanner icon={Info} title="How topics work">
              <p>Topics are <strong>categories</strong> used to organize and filter your mentions. When AI analyzes a mention, it assigns it to one or more of your topics — making it easy to filter by theme (e.g., show only "Security" or "Pricing" mentions).</p>
              <p className="mt-1">Default topics are shared across all organizations. Custom topics you add here are specific to your organization and will appear in mention filters, dashboards, and reports.</p>
            </TabInfoBanner>

            <h3 className="text-sm font-medium text-card-foreground">Topic Taxonomy</h3>

            {/* Custom topic input */}
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  Custom Topic
                  <InfoTooltip text="Create a custom topic to categorize mentions in a way that's specific to your industry or brand. Topics appear as filters throughout the platform." />
                </Label>
                <Input
                  placeholder="e.g. Product Launches, Investor Relations..."
                  value={newTopicName}
                  onChange={e => setNewTopicName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addTopic()}
                />
              </div>
              <Button size="sm" onClick={() => addTopic()} disabled={addingTopic || !newTopicName.trim()}>
                {addingTopic ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                Add
              </Button>
            </div>

            {/* Suggested topics */}
            {SUGGESTED_TOPICS.filter(t => !existingTopicNames.has(t.toLowerCase())).length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Suggested Topics — click to add</Label>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_TOPICS.filter(t => !existingTopicNames.has(t.toLowerCase())).map(t => (
                    <button
                      key={t}
                      onClick={() => addTopic(t)}
                      disabled={addingTopic}
                      className="text-xs px-2.5 py-1 rounded-md border border-dashed border-primary/30 text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Plus className="h-3 w-3 inline mr-1" />{t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Active Topics</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {topics.map(t => (
                    <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-lg border border-border bg-muted/30">
                      <span className="text-xs text-card-foreground">{t.name}</span>
                      <div className="flex items-center gap-1.5">
                        {t.is_default && <Badge variant="outline" className="text-[9px] px-1">default</Badge>}
                        {t.org_id && (
                          <button onClick={() => deleteTopic(t)} className="text-muted-foreground hover:text-destructive transition-colors p-0.5">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {topics.length === 0 && <p className="text-sm text-muted-foreground col-span-full">No topics found. Add topics above to start categorizing mentions.</p>}
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ═══ SOURCES TAB ═══ */}
        <TabsContent value="sources">
          <Card className="bg-card border-border p-6 space-y-5">
            <TabInfoBanner icon={Info} title="Source Catalog">
              <p>All available monitoring sources are shown below. <strong>Enable</strong> a source to include it in scans. Sources that require setup will guide you through the process.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <SourceTierBadge tier="auto" label="Auto — no setup" />
                <SourceTierBadge tier="web" label="Web Discovery" />
                <SourceTierBadge tier="api" label="API Key Required" />
                <SourceTierBadge tier="manual" label="Manual Import" />
              </div>
            </TabInfoBanner>

            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <>
                {/* Group sources by tier */}
                {(["auto", "web", "api", "manual"] as SourceTier[]).map(tier => {
                  const tierSources = SOURCE_TYPE_OPTIONS.filter(opt => opt.tier === tier);
                  const tierLabels: Record<SourceTier, { title: string; subtitle: string; icon: React.ReactNode }> = {
                    auto: { title: "Automatic Sources", subtitle: "Works out of the box — enable and scan", icon: <Zap className="h-4 w-4 text-sentinel-emerald" /> },
                    web: { title: "Web Discovery", subtitle: "Searches the web for mentions — good coverage", icon: <Globe className="h-4 w-4 text-sentinel-cyan" /> },
                    api: { title: "API-Connected Sources", subtitle: "Full access with an API key — setup guide included", icon: <Key className="h-4 w-4 text-sentinel-amber" /> },
                    manual: { title: "Manual Import Sources", subtitle: "Platform blocks scraping — paste or upload content", icon: <Upload className="h-4 w-4 text-sentinel-purple" /> },
                  };
                  const { title, subtitle, icon } = tierLabels[tier];

                  return (
                    <div key={tier} className="space-y-3">
                      <div className="flex items-center gap-2">
                        {icon}
                        <div>
                          <h4 className="text-sm font-medium text-card-foreground">{title}</h4>
                          <p className="text-[10px] text-muted-foreground">{subtitle}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {tierSources.map(opt => {
                          const existingSource = sources.find(s => s.type === opt.value);
                          const isAdded = !!existingSource;
                          const isEnabled = existingSource?.enabled;
                          const isExpanded = expandedSource === opt.value;

                          return (
                            <div
                              key={opt.value}
                              className={`rounded-lg border overflow-hidden transition-all ${
                                isAdded
                                  ? isEnabled
                                    ? "bg-muted/50 border-sentinel-emerald/30"
                                    : "bg-muted/30 border-border"
                                  : "bg-card/30 border-dashed border-border/60"
                              }`}
                            >
                              <div className="flex items-center justify-between p-3 gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className={`h-2.5 w-2.5 rounded-full shrink-0 transition-colors ${
                                    isEnabled ? "bg-sentinel-emerald shadow-[0_0_6px] shadow-sentinel-emerald/40" : isAdded ? "bg-muted-foreground/30" : "bg-transparent border border-dashed border-muted-foreground/30"
                                  }`} />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className={`text-sm ${isAdded ? "text-card-foreground" : "text-muted-foreground"}`}>{opt.label}</span>
                                      <SourceTierBadge tier={opt.tier} label={opt.tierLabel} />
                                      {isEnabled && <Badge variant="outline" className="text-[9px] bg-sentinel-emerald/10 text-sentinel-emerald border-sentinel-emerald/30">Active</Badge>}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">{opt.description}</p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {/* Expand/info button for sources with setup notes */}
                                  {opt.setupNote && (
                                    <button
                                      onClick={() => setExpandedSource(isExpanded ? null : opt.value)}
                                      className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
                                      title="Setup info"
                                    >
                                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
                                    </button>
                                  )}

                                  {/* Action button based on tier and state */}
                                  {opt.tier === "manual" ? (
                                    <Button
                                      size="sm"
                                      variant={isAdded ? "outline" : "default"}
                                      className="text-[10px] h-7 gap-1"
                                      onClick={async () => {
                                        if (!isAdded && currentOrg) {
                                          await supabase.from("sources").insert({ org_id: currentOrg.id, type: opt.value, enabled: true }).select("id, type, enabled").single().then(({ data }) => {
                                            if (data) setSources(prev => [...prev, data]);
                                          });
                                        }
                                        navigate("/mentions?import=true");
                                      }}
                                    >
                                      <Upload className="h-3 w-3" /> Import
                                    </Button>
                                  ) : opt.tier === "api" && !isAdded ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-[10px] h-7 gap-1 border-sentinel-amber/40 text-sentinel-amber hover:bg-sentinel-amber/10"
                                      onClick={() => setExpandedSource(isExpanded ? null : opt.value)}
                                    >
                                      <Key className="h-3 w-3" /> Setup
                                    </Button>
                                  ) : !isAdded ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-[10px] h-7 gap-1"
                                      onClick={async () => {
                                        if (!currentOrg) return;
                                        const { data } = await supabase.from("sources").insert({ org_id: currentOrg.id, type: opt.value, enabled: true }).select("id, type, enabled").single();
                                        if (data) {
                                          setSources(prev => [...prev, data]);
                                          toast({ title: "Source enabled", description: `${opt.label} will be included in future scans.` });
                                        }
                                      }}
                                    >
                                      <Plus className="h-3 w-3" /> Enable
                                    </Button>
                                  ) : (
                                    <>
                                      {opt.tier === "api" && (
                                        <button
                                          onClick={() => setExpandedSource(isExpanded ? null : opt.value)}
                                          className="text-sentinel-amber hover:text-sentinel-amber/80 transition-colors p-1 rounded hover:bg-sentinel-amber/10"
                                          title="API configuration"
                                        >
                                          <Key className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                      <Switch checked={!!isEnabled} onCheckedChange={() => existingSource && toggleSource(existingSource)} />
                                      <button onClick={() => existingSource && deleteSource(existingSource)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Expandable setup/info panel */}
                              {isExpanded && opt.setupNote && (
                                <div className="border-t border-border bg-card/50 p-3 space-y-2 animate-fade-up">
                                  <p className="text-xs text-muted-foreground">{opt.setupNote}</p>
                                  {opt.fallbackNote && (
                                    <p className="text-[10px] text-sentinel-cyan flex items-center gap-1">
                                      <Zap className="h-3 w-3 shrink-0" /> {opt.fallbackNote}
                                    </p>
                                  )}
                                  {opt.setupSteps && (
                                    <ol className="text-[11px] text-muted-foreground space-y-1 pl-4 list-decimal">
                                      {opt.setupSteps.map((step, i) => (
                                        <li key={i}>{step}</li>
                                      ))}
                                    </ol>
                                  )}
                                  {opt.tier === "api" && (
                                    <div className="flex gap-2 mt-1 flex-wrap">
                                      <Button size="sm" variant="outline" className="text-xs h-7 gap-1.5" onClick={() => navigate("/settings?tab=connections")}>
                                        <Plug className="h-3 w-3" /> {isAdded ? "Configure API Key" : "Go to Connections"}
                                      </Button>
                                      {!isAdded && (
                                        <Button size="sm" className="text-xs h-7 gap-1.5" onClick={async () => {
                                          if (!currentOrg) return;
                                          const { data } = await supabase.from("sources").insert({ org_id: currentOrg.id, type: opt.value, enabled: true }).select("id, type, enabled").single();
                                          if (data) {
                                            setSources(prev => [...prev, data]);
                                            toast({ title: "Source enabled", description: `${opt.label} enabled with web fallback. Add API key for full coverage.` });
                                          }
                                        }}>
                                          <Zap className="h-3 w-3" /> Enable with Fallback
                                        </Button>
                                      )}
                                    </div>
                                  )}
                                  {opt.tier === "manual" && (
                                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1.5 mt-1" onClick={() => navigate("/mentions?import=true")}>
                                      <Upload className="h-3 w-3" /> Go to Import
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Summary footer */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <p className="text-[10px] text-muted-foreground">
                    {sources.filter(s => s.enabled).length} source{sources.filter(s => s.enabled).length !== 1 ? "s" : ""} active out of {SOURCE_TYPE_OPTIONS.length} available
                  </p>
                </div>
              </>
            )}
          </Card>
        </TabsContent>

        {/* SCAN SCHEDULING TAB */}
        <TabsContent value="scan-scheduling">
          <Card className="bg-card border-border p-6">
            <BulkScanSchedulingTab />
          </Card>
        </TabsContent>

        {/* CUSTOM SOURCES TAB */}
        <TabsContent value="custom-sources">
          <Card className="bg-card border-border p-6">
            <CustomSourcesTab />
          </Card>
        </TabsContent>

        {/* ALERTS TAB */}
        <TabsContent value="alerts">
          <AlertSettingsTab />
        </TabsContent>

        {/* NOTIFICATIONS TAB */}
        <TabsContent value="notifications">
          <TabInfoBanner icon={Info} title="Your notification preferences">
            <p>Control which email notifications you receive. These are <strong>personal preferences</strong> — each team member can customize their own notifications independently. Changes here only affect your account.</p>
          </TabInfoBanner>
          <NotificationPreferencesTab />
        </TabsContent>

        {/* SUBSCRIPTION TAB */}
        <TabsContent value="subscription">
          <SubscriptionTab orgId={currentOrg?.id} userId={user?.id} />
        </TabsContent>

        {/* CONNECTIONS TAB */}
        <TabsContent value="connections">
          <SourceConnectionsTab />
        </TabsContent>

        {/* TEAM TAB */}
        <TabsContent value="team">
          <Card className="bg-card border-border p-6">
            <TabInfoBanner icon={Info} title="Team management">
              <p>Invite team members to your organization and assign roles that control what they can see and do. <strong>Owners</strong> have full control. <strong>Admins</strong> manage members and settings. <strong>Analysts</strong> run scans and manage data. <strong>Approvers</strong> review facts and templates. <strong>Viewers</strong> have read-only access.</p>
            </TabInfoBanner>
            {isSuperAdmin && (
              <p className="text-xs text-muted-foreground mb-2">Full team management including org creation is available in the <Link to="/admin" className="text-primary underline">Admin Panel</Link>.</p>
            )}
            <TeamManagementTab />
          </Card>
        </TabsContent>

        {/* INTEGRATIONS TAB */}
        <TabsContent value="integrations">
          <IntegrationsTab />
        </TabsContent>

        {/* SUPPORT TAB */}
        <TabsContent value="support">
          <SupportTab />
        </TabsContent>

        {/* SHARED LINKS TAB */}
        <TabsContent value="shared-links">
          <Card className="bg-card border-border p-6">
            <SharedLinksTab />
          </Card>
        </TabsContent>

        {/* DANGER ZONE TAB */}
        <TabsContent value="danger">
          <DangerZoneTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Support Tab ───
function SupportTab() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ subject: "", message: "", type: "question" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) return;
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("send-notification", {
        body: {
          type: "contact_inquiry",
          name: user?.user_metadata?.full_name || user?.email || "User",
          email: user?.email || "",
          company: "In-app support request",
          message: `[${form.type.toUpperCase()}] ${form.subject}\n\n${form.message}`,
        },
      });
      if (error) throw error;
      setSubmitted(true);
      toast({ title: "Message sent", description: "We'll get back to you shortly." });
    } catch {
      setSubmitted(true);
      toast({ title: "Request received", description: "We'll review your message and respond soon." });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <Card className="bg-card border-border p-8 text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <CheckCircle2 className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-card-foreground">Thank you!</h3>
        <p className="text-sm text-muted-foreground">We've received your message and will get back to you within 1 business day.</p>
        <Button variant="outline" onClick={() => { setSubmitted(false); setForm({ subject: "", message: "", type: "question" }); }}>
          Send another message
        </Button>
      </Card>
    );
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-5">
        <TabInfoBanner icon={HelpCircle} title="Need help?">
          <p>Whether you have a question, found a bug, want to request a feature, or need help with setup — we're here for you. Send us a message and we'll respond within 1 business day.</p>
        </TabInfoBanner>

        <div className="space-y-3">
          <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-muted/30">
            <MessageSquare className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-card-foreground">General Questions</h4>
              <p className="text-xs text-muted-foreground">How things work, pricing, plan comparisons, feature availability.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-muted/30">
            <Settings2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-card-foreground">Technical Support</h4>
              <p className="text-xs text-muted-foreground">Bug reports, scan issues, integration problems, API help.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-muted/30">
            <Building2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-card-foreground">Enterprise & Custom Plans</h4>
              <p className="text-xs text-muted-foreground">Custom integrations, SLA, dedicated onboarding, unlimited seats.</p>
            </div>
          </div>
        </div>
      </div>

      <Card className="bg-card border-border p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Request Type</Label>
            <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="question">General Question</SelectItem>
                <SelectItem value="bug">Bug Report</SelectItem>
                <SelectItem value="feature">Feature Request</SelectItem>
                <SelectItem value="billing">Billing / Subscription</SelectItem>
                <SelectItem value="enterprise">Enterprise Inquiry</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Subject</Label>
            <Input
              value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="Brief summary of your question or issue"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Message</Label>
            <Textarea
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              placeholder="Describe your question, issue, or request in detail..."
              rows={5}
              required
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Logged in as <strong>{user?.email}</strong> — we'll reply to this address.
          </p>
          <Button type="submit" className="w-full" disabled={loading || !form.subject.trim() || !form.message.trim()}>
            <Send className="h-4 w-4 mr-2" />
            {loading ? "Sending..." : "Send Message"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

// ─── Subscription Tab ───
function SubscriptionTab({ orgId, userId }: { orgId?: string; userId?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [requestType, setRequestType] = useState("monthly");
  const [message, setMessage] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const STRIPE_PLANS = [
    { id: "monthly", name: "Pro Monthly", price: "$99/mo", priceId: "price_1T1ObmB29RCAwSicAeV8uVVM" },
    { id: "yearly", name: "Pro Yearly", price: "$950/yr", priceId: "price_1T1ObnB29RCAwSiccq30KKyT", badge: "Save 20%" },
  ];

  const handleStripeCheckout = async (priceId: string, planId: string) => {
    if (!orgId) return;
    setCheckoutLoading(planId);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId, orgId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.url) window.location.href = data.url;
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCheckoutLoading(null);
    }
  };

  const { data: org } = useQuery({
    queryKey: ["org-subscription", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("organizations")
        .select("subscription_status, subscription_type, subscription_expires_at")
        .eq("id", orgId!)
        .single();
      return data;
    },
  });

  const { data: requests, isLoading } = useQuery({
    queryKey: ["subscription-requests", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("subscription_requests")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
  });

  const hasPending = requests?.some((r: any) => r.status === "pending");

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("subscription_requests").insert({
        org_id: orgId!,
        requested_by: userId!,
        requested_type: requestType,
        message: message.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Request submitted", description: "An admin will review your upgrade request." });
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["subscription-requests", orgId] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const statusColor = (s: string) => {
    if (s === "active") return "default";
    if (s === "pending") return "secondary";
    return "outline";
  };

  return (
    <Card className="bg-card border-border p-6 space-y-6">
      <TabInfoBanner icon={Info} title="Subscription & billing">
        <p>Manage your plan and billing. Subscribe via Stripe for instant activation, or submit a manual upgrade request for admin review. Pro plans unlock higher scan quotas, priority support, and advanced features.</p>
      </TabInfoBanner>

      {/* Current Plan */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-card-foreground">Current Plan</h3>
        <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 border border-border">
          <CreditCard className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-card-foreground capitalize">
                {org?.subscription_type || "Free"}
              </span>
              <Badge variant={statusColor(org?.subscription_status || "free")}>
                {org?.subscription_status || "free"}
              </Badge>
            </div>
            {org?.subscription_expires_at && (
              <p className="text-xs text-muted-foreground mt-1">
                Expires: {new Date(org.subscription_expires_at).toLocaleDateString()}
              </p>
            )}
          </div>
          {org?.subscription_status === "active" && (
            <Button
              size="sm"
              variant="outline"
              disabled={portalLoading}
              onClick={async () => {
                setPortalLoading(true);
                try {
                  const { data, error } = await supabase.functions.invoke("customer-portal");
                  if (error) throw new Error(error.message);
                  if (data?.error) throw new Error(data.error);
                  if (data?.url) window.open(data.url, "_blank");
                } catch (err: any) {
                  toast({ title: "Error", description: err.message, variant: "destructive" });
                } finally {
                  setPortalLoading(false);
                }
              }}
            >
              {portalLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
              Manage Subscription
            </Button>
          )}
        </div>
      </div>

      {/* Stripe Checkout */}
      {org?.subscription_status !== "active" && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-card-foreground">Subscribe via Stripe</h3>
          <div className="grid grid-cols-2 gap-3">
            {STRIPE_PLANS.map((plan) => (
              <div key={plan.id} className="p-4 rounded-lg border border-border bg-muted/50 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-card-foreground">{plan.name}</span>
                  {plan.badge && <Badge variant="secondary" className="text-[10px]">{plan.badge}</Badge>}
                </div>
                <div className="text-lg font-bold text-card-foreground">{plan.price}</div>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => handleStripeCheckout(plan.priceId, plan.id)}
                  disabled={checkoutLoading !== null}
                >
                  {checkoutLoading === plan.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
                  Subscribe
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual Request Upgrade */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-card-foreground">Or Request Manual Approval</h3>
        {hasPending ? (
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 text-sm text-muted-foreground">
            You already have a pending upgrade request. An admin will review it shortly.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: "monthly", label: "Monthly", desc: "Billed monthly" },
                { value: "yearly", label: "Yearly", desc: "Billed annually — save 20%" },
              ].map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => setRequestType(opt.value)}
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    requestType === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border bg-muted/50 hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="text-sm font-medium text-card-foreground">{opt.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Message (optional)</Label>
              <Textarea
                placeholder="Any notes for the admin..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="resize-none"
                rows={3}
              />
            </div>
            <Button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending || !orgId || !userId}
            >
              {submitMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4 mr-2" />
              )}
              Submit Upgrade Request
            </Button>
          </div>
        )}
      </div>

      {/* Request History */}
      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : requests && requests.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-card-foreground">Request History</h3>
          <div className="space-y-2">
            {requests.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                <div>
                  <span className="text-xs text-card-foreground capitalize">{r.requested_type}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
                <Badge variant={statusColor(r.status)}>{r.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
