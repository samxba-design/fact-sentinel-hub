import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Globe, ExternalLink, Loader2, Info, Rss, Smartphone, Newspaper } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";

interface CustomSource {
  id: string;
  type: string;
  enabled: boolean | null;
  config: any;
}

const SUGGESTED_SOURCES = [
  { type: "glassdoor", label: "Glassdoor", url: "https://glassdoor.com", description: "Employee reviews & company ratings", category: "reviews" },
  { type: "trustpilot", label: "Trustpilot", url: "https://trustpilot.com", description: "Customer reviews & trust scores", category: "reviews" },
  { type: "g2", label: "G2", url: "https://g2.com", description: "Software reviews & comparisons", category: "reviews" },
  { type: "capterra", label: "Capterra", url: "https://capterra.com", description: "Software reviews & recommendations", category: "reviews" },
  { type: "producthunt", label: "Product Hunt", url: "https://producthunt.com", description: "Product launches & community feedback", category: "reviews" },
  { type: "yelp", label: "Yelp", url: "https://yelp.com", description: "Local business reviews", category: "reviews" },
  { type: "bbb", label: "BBB", url: "https://bbb.org", description: "Better Business Bureau complaints", category: "reviews" },
  { type: "indeed", label: "Indeed", url: "https://indeed.com", description: "Employer reviews from job seekers", category: "reviews" },
  { type: "apple-app-store", label: "Apple App Store", url: "https://apps.apple.com", description: "iOS app reviews & ratings", category: "app-stores" },
  { type: "google-play-store", label: "Google Play Store", url: "https://play.google.com", description: "Android app reviews & ratings", category: "app-stores" },
  { type: "google-news", label: "Google News", url: "https://news.google.com", description: "Mainstream press coverage", category: "news" },
];

export default function CustomSourcesTab() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [sources, setSources] = useState<CustomSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [customType, setCustomType] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [bulkUrls, setBulkUrls] = useState("");
  const [showBulkImport, setShowBulkImport] = useState(false);

  const fetchSources = async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data } = await supabase
      .from("sources")
      .select("id, type, enabled, config")
      .eq("org_id", currentOrg.id)
      .order("created_at");
    setSources(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchSources(); }, [currentOrg]);

  const addSource = async (type: string, url?: string) => {
    if (!currentOrg) return;
    if (sources.some(s => s.type === type)) {
      toast({ title: "Already added", description: `${type} is already in your sources.`, variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const config: any = url ? { scan_url: url } : {};
      const suggested = SUGGESTED_SOURCES.find(s => s.type === type);
      if (suggested && !url) config.scan_url = suggested.url;
      const { data, error } = await supabase.from("sources")
        .insert({ org_id: currentOrg.id, type, enabled: true, config })
        .select("id, type, enabled, config")
        .single();
      if (error) throw error;
      if (data) setSources(prev => [...prev, data]);
      toast({ title: "Source added", description: `${type} will be included in future scans.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleBulkImport = async () => {
    if (!currentOrg || !bulkUrls.trim()) return;
    const urls = bulkUrls
      .split(/[\n,]+/)
      .map(u => u.trim())
      .filter(u => u.length > 0);

    if (urls.length === 0) return;

    setAdding(true);
    let added = 0;
    try {
      for (const url of urls) {
        const isRss = url.includes("/feed") || url.includes("/rss") || url.endsWith(".xml") || url.includes("atom");
        const type = isRss ? `rss-${url.replace(/https?:\/\//, "").split("/")[0].replace(/\./g, "-")}` : `custom-${url.replace(/https?:\/\//, "").split("/")[0].replace(/\./g, "-")}`;

        if (sources.some(s => s.config?.scan_url === url)) continue;

        const { data, error } = await supabase.from("sources")
          .insert({
            org_id: currentOrg.id,
            type: type.slice(0, 50),
            enabled: true,
            config: { scan_url: url, source_kind: isRss ? "rss" : "web" },
          })
          .select("id, type, enabled, config")
          .single();
        if (!error && data) {
          setSources(prev => [...prev, data]);
          added++;
        }
      }
      toast({ title: `${added} source${added !== 1 ? "s" : ""} imported`, description: "They will be included in future scans." });
      setBulkUrls("");
      setShowBulkImport(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const toggleSource = async (source: CustomSource) => {
    const newEnabled = !source.enabled;
    const { error } = await supabase.from("sources").update({ enabled: newEnabled }).eq("id", source.id);
    if (!error) setSources(prev => prev.map(s => s.id === source.id ? { ...s, enabled: newEnabled } : s));
  };

  const removeSource = async (source: CustomSource) => {
    const { error } = await supabase.from("sources").delete().eq("id", source.id);
    if (!error) {
      setSources(prev => prev.filter(s => s.id !== source.id));
      toast({ title: "Source removed" });
    }
  };

  const activeTypes = new Set(sources.map(s => s.type));
  const rssSources = sources.filter(s => s.config?.source_kind === "rss");
  const otherSources = sources.filter(s => s.config?.source_kind !== "rss");

  if (loading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-card-foreground">Custom Scan Sources</h3>
        <p className="text-xs text-muted-foreground">
          Add specific sites, RSS feeds, and platforms to monitor. These will be scraped during scans using our web crawler.
        </p>
      </div>

      {/* Info */}
      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-card-foreground">How custom sources work</p>
          <p>Add any website URL, RSS feed, or app store link. During scans, we'll search that source for your tracked keywords and analyze the results for sentiment, severity, and threats. Great for industry-specific review sites, news feeds, forums, or niche platforms.</p>
        </div>
      </div>

      {/* RSS Feeds section */}
      <Card className="bg-card border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-orange-500/10 flex items-center justify-center">
              <Rss className="h-4 w-4 text-orange-500" />
            </div>
            <div>
              <div className="text-sm font-medium text-card-foreground flex items-center gap-1.5">
                RSS / Atom Feeds
                <InfoTooltip text="Subscribe to any RSS or Atom feed URL. New articles will be automatically monitored for your tracked keywords during each scan." />
              </div>
              <p className="text-xs text-muted-foreground">Monitor blogs, news outlets, and publications automatically</p>
            </div>
          </div>
          {rssSources.length > 0 && (
            <Badge variant="outline" className="text-sentinel-emerald border-sentinel-emerald/30 text-[10px]">
              {rssSources.length} feed{rssSources.length !== 1 ? "s" : ""} active
            </Badge>
          )}
        </div>

        {/* Quick RSS add */}
        <div className="flex items-end gap-3">
          <div className="space-y-1.5 flex-1">
            <Label className="text-xs text-muted-foreground">Feed URL</Label>
            <Input
              placeholder="https://blog.example.com/feed or https://example.com/rss.xml"
              value={customUrl && customType === "__rss" ? customUrl : ""}
              onChange={e => { setCustomUrl(e.target.value); setCustomType("__rss"); }}
            />
          </div>
          <Button
            size="sm"
            onClick={() => {
              if (!customUrl.trim()) return;
              const domain = customUrl.replace(/https?:\/\//, "").split("/")[0].replace(/\./g, "-");
              addSource(`rss-${domain}`, customUrl.trim());
              setCustomUrl("");
              setCustomType("");
            }}
            disabled={adding || customType !== "__rss" || !customUrl.trim()}
          >
            {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
            Add Feed
          </Button>
        </div>

        {/* Bulk import toggle */}
        <div className="border-t border-border pt-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs px-0 h-auto text-primary hover:text-primary"
            onClick={() => setShowBulkImport(!showBulkImport)}
          >
            {showBulkImport ? "Hide bulk import ▲" : "Bulk import feeds & URLs ▼"}
          </Button>
          {showBulkImport && (
            <div className="mt-3 space-y-3 animate-fade-up">
              <p className="text-xs text-muted-foreground">
                Paste multiple URLs (one per line or comma-separated). RSS feeds are auto-detected. Works with any URL — blogs, news sites, forums, etc.
              </p>
              <Textarea
                placeholder={"https://techcrunch.com/feed\nhttps://blog.competitor.com/rss\nhttps://news.ycombinator.com/rss\nhttps://example-forum.com"}
                value={bulkUrls}
                onChange={e => setBulkUrls(e.target.value)}
                rows={5}
                className="text-xs font-mono"
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  {bulkUrls.split(/[\n,]+/).filter(u => u.trim()).length} URL{bulkUrls.split(/[\n,]+/).filter(u => u.trim()).length !== 1 ? "s" : ""} detected
                </span>
                <Button size="sm" onClick={handleBulkImport} disabled={adding || !bulkUrls.trim()}>
                  {adding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                  Import All
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Active RSS feeds */}
        {rssSources.length > 0 && (
          <div className="space-y-2 border-t border-border pt-3">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Active Feeds</Label>
            {rssSources.map(source => (
              <div key={source.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/20 border border-border/50">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Rss className="h-3 w-3 text-orange-500 shrink-0" />
                  <span className="text-xs text-card-foreground truncate">{source.config?.scan_url || source.type}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch checked={!!source.enabled} onCheckedChange={() => toggleSource(source)} />
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeSource(source)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* App Store / Play Store */}
      <Card className="bg-card border-border p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-blue-500/10 flex items-center justify-center">
            <Smartphone className="h-4 w-4 text-blue-500" />
          </div>
          <div>
            <div className="text-sm font-medium text-card-foreground flex items-center gap-1.5">
              App Store Reviews
              <InfoTooltip text="Monitor user reviews and ratings on the Apple App Store and Google Play Store. Add your app's store URL to track what users are saying." />
            </div>
            <p className="text-xs text-muted-foreground">Monitor Apple App Store & Google Play Store reviews</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {SUGGESTED_SOURCES.filter(s => s.category === "app-stores").map(s => {
            const isAdded = activeTypes.has(s.type);
            return (
              <button
                key={s.type}
                onClick={() => !isAdded && addSource(s.type)}
                disabled={isAdded || adding}
                className={`flex flex-col items-start p-3 rounded-lg border text-left transition-colors ${
                  isAdded ? "border-sentinel-emerald/30 bg-sentinel-emerald/5 cursor-default" : "border-border bg-muted/30 hover:border-primary/30 hover:bg-primary/5 cursor-pointer"
                }`}
              >
                <div className="flex items-center gap-1.5 w-full">
                  <span className="text-xs font-medium text-card-foreground">{s.label}</span>
                  {isAdded && <Badge variant="outline" className="text-[9px] px-1 text-sentinel-emerald border-sentinel-emerald/30 ml-auto">Added</Badge>}
                </div>
                <span className="text-[10px] text-muted-foreground mt-0.5">{s.description}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Google News */}
      <Card className="bg-card border-border p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-green-500/10 flex items-center justify-center">
            <Newspaper className="h-4 w-4 text-green-500" />
          </div>
          <div>
            <div className="text-sm font-medium text-card-foreground flex items-center gap-1.5">
              Google News
              <InfoTooltip text="Automatically search Google News for your tracked keywords to catch mainstream press coverage, industry news, and media mentions." />
            </div>
            <p className="text-xs text-muted-foreground">Catch mainstream press coverage and media mentions</p>
          </div>
        </div>
        {(() => {
          const gn = SUGGESTED_SOURCES.find(s => s.type === "google-news")!;
          const isAdded = activeTypes.has(gn.type);
          return (
            <button
              onClick={() => !isAdded && addSource(gn.type)}
              disabled={isAdded || adding}
              className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-colors ${
                isAdded ? "border-sentinel-emerald/30 bg-sentinel-emerald/5 cursor-default" : "border-border bg-muted/30 hover:border-primary/30 hover:bg-primary/5 cursor-pointer"
              }`}
            >
              <div>
                <span className="text-xs font-medium text-card-foreground">Enable Google News monitoring</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">Searches Google News for your keywords during each scan — included at no extra cost</p>
              </div>
              {isAdded ? (
                <Badge variant="outline" className="text-[9px] px-1 text-sentinel-emerald border-sentinel-emerald/30 shrink-0">Added</Badge>
              ) : (
                <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </button>
          );
        })()}
      </Card>

      {/* Quick add review sources */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Quick Add Review & Community Sites</Label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {SUGGESTED_SOURCES.filter(s => s.category === "reviews").map(suggestion => {
            const isAdded = activeTypes.has(suggestion.type);
            return (
              <button
                key={suggestion.type}
                onClick={() => !isAdded && addSource(suggestion.type)}
                disabled={isAdded || adding}
                className={`flex flex-col items-start p-3 rounded-lg border text-left transition-colors ${
                  isAdded ? "border-sentinel-emerald/30 bg-sentinel-emerald/5 cursor-default" : "border-border bg-muted/30 hover:border-primary/30 hover:bg-primary/5 cursor-pointer"
                }`}
              >
                <div className="flex items-center gap-1.5 w-full">
                  <span className="text-xs font-medium text-card-foreground">{suggestion.label}</span>
                  {isAdded && <Badge variant="outline" className="text-[9px] px-1 text-sentinel-emerald border-sentinel-emerald/30 ml-auto">Added</Badge>}
                </div>
                <span className="text-[10px] text-muted-foreground mt-0.5">{suggestion.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom URL source */}
      <Card className="bg-card border-border p-4 space-y-3">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          Add Custom Source
          <InfoTooltip text="Add any website URL — forums, niche review sites, competitor blogs, industry portals. We'll scrape it for your keywords during scans." />
        </Label>
        <div className="flex items-end gap-3">
          <div className="space-y-1.5 flex-1">
            <Label className="text-xs text-muted-foreground">Source Name</Label>
            <Input
              placeholder="e.g. industry-forum, company-blog..."
              value={customType !== "__rss" ? customType : ""}
              onChange={e => setCustomType(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 flex-1">
            <Label className="text-xs text-muted-foreground">URL to Monitor</Label>
            <Input
              placeholder="https://forum.example.com"
              value={customType !== "__rss" ? customUrl : ""}
              onChange={e => { setCustomUrl(e.target.value); if (customType === "__rss") setCustomType(""); }}
            />
          </div>
          <Button size="sm" onClick={() => { addSource(customType.trim().toLowerCase(), customUrl.trim()); setCustomType(""); setCustomUrl(""); }}
            disabled={adding || !customType.trim() || customType === "__rss"}>
            {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
            Add
          </Button>
        </div>
      </Card>

      {/* Active non-RSS sources */}
      {otherSources.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">Active Sources ({otherSources.length})</Label>
          <div className="space-y-2">
            {otherSources.map(source => (
              <Card key={source.id} className="bg-card border-border p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Globe className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-card-foreground capitalize">{source.type}</span>
                        {source.config?.scan_url && (
                          <a href={source.config.scan_url} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5 truncate max-w-48">
                            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                            {source.config.scan_url}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Switch checked={!!source.enabled} onCheckedChange={() => toggleSource(source)} />
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeSource(source)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
