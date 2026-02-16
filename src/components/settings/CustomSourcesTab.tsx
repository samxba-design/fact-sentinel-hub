import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Globe, ExternalLink, Loader2, Info } from "lucide-react";

interface CustomSource {
  id: string;
  type: string;
  enabled: boolean | null;
  config: any;
}

const SUGGESTED_SOURCES = [
  { type: "glassdoor", label: "Glassdoor", url: "https://glassdoor.com", description: "Employee reviews & company ratings" },
  { type: "trustpilot", label: "Trustpilot", url: "https://trustpilot.com", description: "Customer reviews & trust scores" },
  { type: "g2", label: "G2", url: "https://g2.com", description: "Software reviews & comparisons" },
  { type: "capterra", label: "Capterra", url: "https://capterra.com", description: "Software reviews & recommendations" },
  { type: "producthunt", label: "Product Hunt", url: "https://producthunt.com", description: "Product launches & community feedback" },
  { type: "yelp", label: "Yelp", url: "https://yelp.com", description: "Local business reviews" },
  { type: "bbb", label: "BBB", url: "https://bbb.org", description: "Better Business Bureau complaints" },
  { type: "indeed", label: "Indeed", url: "https://indeed.com", description: "Employer reviews from job seekers" },
];

export default function CustomSourcesTab() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [sources, setSources] = useState<CustomSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [customType, setCustomType] = useState("");
  const [customUrl, setCustomUrl] = useState("");

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
    // Check duplicate
    if (sources.some(s => s.type === type)) {
      toast({ title: "Already added", description: `${type} is already in your sources.`, variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const config = url ? { scan_url: url } : {};
      const suggested = SUGGESTED_SOURCES.find(s => s.type === type);
      if (suggested && !url) {
        (config as any).scan_url = suggested.url;
      }
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

  const toggleSource = async (source: CustomSource) => {
    const newEnabled = !source.enabled;
    const { error } = await supabase.from("sources").update({ enabled: newEnabled }).eq("id", source.id);
    if (!error) {
      setSources(prev => prev.map(s => s.id === source.id ? { ...s, enabled: newEnabled } : s));
    }
  };

  const removeSource = async (source: CustomSource) => {
    const { error } = await supabase.from("sources").delete().eq("id", source.id);
    if (!error) {
      setSources(prev => prev.filter(s => s.id !== source.id));
      toast({ title: "Source removed" });
    }
  };

  const updateSourceUrl = async (source: CustomSource, newUrl: string) => {
    const config = { ...(source.config || {}), scan_url: newUrl };
    const { error } = await supabase.from("sources").update({ config }).eq("id", source.id);
    if (!error) {
      setSources(prev => prev.map(s => s.id === source.id ? { ...s, config } : s));
      toast({ title: "URL updated" });
    }
  };

  const activeTypes = new Set(sources.map(s => s.type));

  if (loading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-card-foreground">Custom Scan Sources</h3>
        <p className="text-xs text-muted-foreground">
          Add specific sites and platforms to monitor. These will be scraped during scans using our web crawler.
        </p>
      </div>

      {/* Info */}
      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-card-foreground">How custom sources work</p>
          <p>Add any website URL to your sources. During scans, we'll search that site for your tracked keywords and analyze the results for sentiment, severity, and threats. Great for industry-specific review sites, forums, or niche platforms.</p>
        </div>
      </div>

      {/* Quick add suggested sources */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Quick Add Popular Sources</Label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {SUGGESTED_SOURCES.map(suggestion => {
            const isAdded = activeTypes.has(suggestion.type);
            return (
              <button
                key={suggestion.type}
                onClick={() => !isAdded && addSource(suggestion.type)}
                disabled={isAdded || adding}
                className={`flex flex-col items-start p-3 rounded-lg border text-left transition-colors ${
                  isAdded
                    ? "border-sentinel-emerald/30 bg-sentinel-emerald/5 cursor-default"
                    : "border-border bg-muted/30 hover:border-primary/30 hover:bg-primary/5 cursor-pointer"
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
        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Add Custom Source</Label>
        <div className="flex items-end gap-3">
          <div className="space-y-1.5 flex-1">
            <Label className="text-xs text-muted-foreground">Source Name</Label>
            <Input
              placeholder="e.g. industry-forum, company-blog..."
              value={customType}
              onChange={e => setCustomType(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 flex-1">
            <Label className="text-xs text-muted-foreground">URL to Monitor</Label>
            <Input
              placeholder="https://forum.example.com"
              value={customUrl}
              onChange={e => setCustomUrl(e.target.value)}
            />
          </div>
          <Button size="sm" onClick={() => { addSource(customType.trim().toLowerCase(), customUrl.trim()); setCustomType(""); setCustomUrl(""); }}
            disabled={adding || !customType.trim()}>
            {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
            Add
          </Button>
        </div>
      </Card>

      {/* Active sources */}
      {sources.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">Active Sources ({sources.length})</Label>
          <div className="space-y-2">
            {sources.map(source => (
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
