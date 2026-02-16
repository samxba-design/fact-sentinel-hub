import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Globe, ExternalLink, Loader2, Info, Rss } from "lucide-react";
import InfoTooltip from "@/components/InfoTooltip";

interface CustomSource {
  id: string;
  type: string;
  enabled: boolean | null;
  config: any;
}

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
    // Only fetch sources that have a config with scan_url (i.e. user-added custom sources)
    const { data } = await supabase
      .from("sources")
      .select("id, type, enabled, config")
      .eq("org_id", currentOrg.id)
      .order("created_at");
    // Filter to only custom/RSS sources (those with config.scan_url or config.source_kind)
    const customSources = (data || []).filter(
      (s: any) => s.config?.scan_url || s.config?.source_kind
    );
    setSources(customSources);
    setLoading(false);
  };

  useEffect(() => { fetchSources(); }, [currentOrg]);

  const addRssFeed = async (url: string) => {
    if (!currentOrg || !url.trim()) return;
    if (sources.some(s => s.config?.scan_url === url.trim())) {
      toast({ title: "Already added", description: "This URL is already in your custom sources.", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const domain = url.replace(/https?:\/\//, "").split("/")[0].replace(/\./g, "-");
      const { data, error } = await supabase.from("sources")
        .insert({
          org_id: currentOrg.id,
          type: `rss-${domain}`.slice(0, 50),
          enabled: true,
          config: { scan_url: url.trim(), source_kind: "rss" },
        })
        .select("id, type, enabled, config")
        .single();
      if (error) throw error;
      if (data) setSources(prev => [...prev, data]);
      toast({ title: "RSS feed added", description: "It will be checked for your keywords during scans." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const addCustomUrl = async (name: string, url: string) => {
    if (!currentOrg || !name.trim() || !url.trim()) return;
    if (sources.some(s => s.config?.scan_url === url.trim())) {
      toast({ title: "Already added", description: "This URL is already in your custom sources.", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const { data, error } = await supabase.from("sources")
        .insert({
          org_id: currentOrg.id,
          type: `custom-${name.trim().toLowerCase().replace(/\s+/g, "-")}`.slice(0, 50),
          enabled: true,
          config: { scan_url: url.trim(), source_kind: "web" },
        })
        .select("id, type, enabled, config")
        .single();
      if (error) throw error;
      if (data) setSources(prev => [...prev, data]);
      toast({ title: "Custom source added" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleBulkImport = async () => {
    if (!currentOrg || !bulkUrls.trim()) return;
    const urls = bulkUrls.split(/[\n,]+/).map(u => u.trim()).filter(u => u.length > 0);
    if (urls.length === 0) return;

    setAdding(true);
    let added = 0;
    try {
      for (const url of urls) {
        if (sources.some(s => s.config?.scan_url === url)) continue;
        const isRss = url.includes("/feed") || url.includes("/rss") || url.endsWith(".xml") || url.includes("atom");
        const domain = url.replace(/https?:\/\//, "").split("/")[0].replace(/\./g, "-");
        const type = isRss ? `rss-${domain}` : `custom-${domain}`;

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
      toast({ title: `${added} source${added !== 1 ? "s" : ""} imported` });
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

  const rssSources = sources.filter(s => s.config?.source_kind === "rss");
  const webSources = sources.filter(s => s.config?.source_kind !== "rss");

  if (loading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-card-foreground">Custom Sources vs. Source Catalog</p>
          <p>The <strong>Sources</strong> tab controls which <em>platform types</em> are scanned (Reddit, YouTube, etc.). This tab is for adding <strong>specific URLs</strong> you want monitored — RSS feeds, competitor blogs, niche forums, industry news sites, or any webpage. Each URL is crawled during scans and checked for your tracked keywords.</p>
        </div>
      </div>

      {/* RSS Feeds */}
      <Card className="bg-card border-border p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-orange-500/10 flex items-center justify-center">
            <Rss className="h-4 w-4 text-orange-500" />
          </div>
          <div>
            <div className="text-sm font-medium text-card-foreground flex items-center gap-1.5">
              RSS / Atom Feeds
              <InfoTooltip text="Subscribe to any RSS or Atom feed URL. New articles are checked for your keywords during each scan. Great for competitor blogs, industry news, and publication tracking." />
            </div>
            <p className="text-xs text-muted-foreground">Subscribe to blogs, news outlets, and publications</p>
          </div>
        </div>

        <div className="flex items-end gap-3">
          <div className="space-y-1.5 flex-1">
            <Label className="text-xs text-muted-foreground">Feed URL</Label>
            <Input
              placeholder="https://blog.example.com/feed or https://example.com/rss.xml"
              value={customUrl && customType === "__rss" ? customUrl : ""}
              onChange={e => { setCustomUrl(e.target.value); setCustomType("__rss"); }}
              onKeyDown={e => e.key === "Enter" && customUrl.trim() && addRssFeed(customUrl.trim())}
            />
          </div>
          <Button
            size="sm"
            onClick={() => { addRssFeed(customUrl.trim()); setCustomUrl(""); setCustomType(""); }}
            disabled={adding || customType !== "__rss" || !customUrl.trim()}
          >
            {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
            Add Feed
          </Button>
        </div>

        {/* Bulk import */}
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
                Paste multiple URLs (one per line or comma-separated). RSS feeds are auto-detected by URL pattern. All other URLs are treated as web sources.
              </p>
              <Textarea
                placeholder={"https://techcrunch.com/feed\nhttps://blog.competitor.com/rss\nhttps://news.ycombinator.com/rss\nhttps://industry-forum.com"}
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
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Active Feeds ({rssSources.length})</Label>
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

      {/* Custom Website URLs */}
      <Card className="bg-card border-border p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Globe className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-medium text-card-foreground flex items-center gap-1.5">
              Custom Website URLs
              <InfoTooltip text="Add any specific webpage or site you want monitored. During scans, we'll crawl these pages and search for your tracked keywords. Great for competitor sites, industry forums, niche news portals, or specific review pages." />
            </div>
            <p className="text-xs text-muted-foreground">Monitor specific websites, forums, competitor pages, or any URL</p>
          </div>
        </div>

        <div className="flex items-end gap-3">
          <div className="space-y-1.5 flex-[0.4]">
            <Label className="text-xs text-muted-foreground">Source Name</Label>
            <Input
              placeholder="e.g. competitor-blog"
              value={customType !== "__rss" ? customType : ""}
              onChange={e => setCustomType(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 flex-[0.6]">
            <Label className="text-xs text-muted-foreground">URL to Monitor</Label>
            <Input
              placeholder="https://forum.example.com"
              value={customType !== "__rss" ? customUrl : ""}
              onChange={e => { setCustomUrl(e.target.value); if (customType === "__rss") setCustomType(""); }}
            />
          </div>
          <Button size="sm" onClick={() => { addCustomUrl(customType, customUrl); setCustomType(""); setCustomUrl(""); }}
            disabled={adding || !customType.trim() || customType === "__rss" || !customUrl.trim()}>
            {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
            Add
          </Button>
        </div>
      </Card>

      {/* Active web sources */}
      {webSources.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">Active Custom Sources ({webSources.length})</Label>
          <div className="space-y-2">
            {webSources.map(source => (
              <div key={source.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/50">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Globe className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-card-foreground capitalize">{source.type.replace(/^custom-/, "").replace(/-/g, " ")}</span>
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
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeSource(source)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {sources.length === 0 && (
        <div className="text-center py-8 space-y-2">
          <Globe className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">No custom sources yet.</p>
          <p className="text-xs text-muted-foreground">Add RSS feeds or specific URLs above to extend your monitoring beyond the standard source catalog.</p>
        </div>
      )}
    </div>
  );
}
