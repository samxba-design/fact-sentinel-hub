import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, Save, Trash2, Loader2, CheckCircle2, ExternalLink, AlertCircle, Info, DollarSign } from "lucide-react";

interface ProviderConfig {
  id: string;
  label: string;
  icon: string;
  description: string;
  pricingNote?: string;
  signupUrl: string;
  signupLabel: string;
  keys: { name: string; label: string; placeholder: string; helpText: string }[];
  instructions: string[];
  whatYouGet: string[];
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: "twitter",
    label: "X (Twitter)",
    icon: "𝕏",
    description: "Search real-time tweets and posts by keyword using the X API v2.",
    pricingNote: "Requires an X Developer account — Basic tier starts at $100/mo and includes 10,000 tweet reads/mo. This is a cost paid directly to X, not to us.",
    signupUrl: "https://developer.x.com/en/portal/petition/essential/basic-info",
    signupLabel: "Sign Up for X Developer Account",
    keys: [
      {
        name: "bearer_token",
        label: "Bearer Token",
        placeholder: "AAAA...",
        helpText: "Found in your X Developer Portal → Your App → Keys and Tokens → Bearer Token",
      },
    ],
    instructions: [
      "Go to developer.x.com and sign up for a Developer account",
      "Choose the Basic plan ($100/mo) — this gives you access to the Search API",
      "Create a new Project, then create an App inside it",
      "Go to your App → Keys and Tokens section",
      "Find or generate your Bearer Token and paste it below",
    ],
    whatYouGet: [
      "Real tweets matching your tracked keywords",
      "Author details including follower count and verification status",
      "Engagement metrics (likes, retweets, replies)",
      "AI-powered sentiment and threat analysis on real posts",
    ],
  },
  {
    id: "reddit",
    label: "Reddit",
    icon: "R",
    description: "Search Reddit posts and comments by keyword across all subreddits.",
    pricingNote: "Free — only requires a Reddit account.",
    signupUrl: "https://www.reddit.com/prefs/apps",
    signupLabel: "Create Reddit App (Free)",
    keys: [
      {
        name: "client_id",
        label: "Client ID",
        placeholder: "abc123...",
        helpText: "The short string shown directly under your app name on the Reddit apps page",
      },
      {
        name: "client_secret",
        label: "Client Secret",
        placeholder: "xyz789...",
        helpText: "Labeled 'secret' on your Reddit app page",
      },
    ],
    instructions: [
      "Log in to Reddit and go to reddit.com/prefs/apps",
      "Scroll down and click 'create another app...'",
      "Choose 'script' as the app type",
      "Set any name (e.g. 'Brand Monitor') and http://localhost as the redirect URI",
      "Click 'create app' — copy the Client ID and Secret below",
    ],
    whatYouGet: [
      "Real Reddit posts and comments matching your keywords",
      "Subreddit context and author information",
      "Upvotes and comment counts",
      "AI-powered sentiment and threat analysis on real discussions",
    ],
  },
];

interface StoredKey {
  id: string;
  provider: string;
  key_name: string;
  key_value: string;
}

export default function SourceConnectionsTab() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [storedKeys, setStoredKeys] = useState<StoredKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);

  const fetchKeys = async () => {
    if (!currentOrg) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("org_api_keys")
      .select("id, provider, key_name, key_value")
      .eq("org_id", currentOrg.id);
    if (!error && data) setStoredKeys(data);
    setLoading(false);
  };

  useEffect(() => { fetchKeys(); }, [currentOrg]);

  const getStoredValue = (provider: string, keyName: string) =>
    storedKeys.find(k => k.provider === provider && k.key_name === keyName);

  const getFormKey = (provider: string, keyName: string) => `${provider}__${keyName}`;

  const handleSave = async (provider: ProviderConfig) => {
    if (!currentOrg) return;
    setSaving(provider.id);
    try {
      for (const key of provider.keys) {
        const formKey = getFormKey(provider.id, key.name);
        const value = formValues[formKey];
        if (!value?.trim()) continue;
        const existing = getStoredValue(provider.id, key.name);
        if (existing) {
          const { error } = await supabase.from("org_api_keys")
            .update({ key_value: value.trim(), updated_at: new Date().toISOString() })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("org_api_keys")
            .insert({ org_id: currentOrg.id, provider: provider.id, key_name: key.name, key_value: value.trim() });
          if (error) throw error;
        }
      }
      toast({ title: `${provider.label} connected!`, description: "API keys saved securely." });
      setFormValues(prev => {
        const next = { ...prev };
        provider.keys.forEach(k => delete next[getFormKey(provider.id, k.name)]);
        return next;
      });
      setExpandedGuide(null);
      await fetchKeys();
    } catch (err: any) {
      toast({ title: "Error saving keys", description: err.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const handleDisconnect = async (provider: ProviderConfig) => {
    if (!currentOrg) return;
    setDeleting(provider.id);
    try {
      const { error } = await supabase.from("org_api_keys")
        .delete().eq("org_id", currentOrg.id).eq("provider", provider.id);
      if (error) throw error;
      toast({ title: `${provider.label} disconnected` });
      await fetchKeys();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const isConnected = (providerId: string) => storedKeys.some(k => k.provider === providerId);
  const maskValue = (val: string) => val.length <= 8 ? "••••••••" : val.slice(0, 4) + "••••" + val.slice(-4);

  if (loading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-card-foreground">Data Source Connections</h3>
        <p className="text-xs text-muted-foreground">
          Connect real data sources to scan live content. Each organization manages its own API credentials — your keys are stored securely and never shared.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-card-foreground">How scanning works</p>
          <p>When you run a scan, we search your connected sources for your tracked keywords and return <strong>real, live results</strong>. Our AI then analyzes each result for sentiment, severity, and potential threats — giving you actionable intelligence on real data.</p>
          <p>Web/News scanning is available by default. For X and Reddit, connect your own API credentials below.</p>
        </div>
      </div>

      {/* Firecrawl */}
      <Card className="bg-card border-border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">🌐</div>
            <div>
              <div className="text-sm font-medium text-card-foreground">Web / News</div>
              <p className="text-xs text-muted-foreground">Scrape any website or news site for keyword mentions</p>
            </div>
          </div>
          <Badge variant="outline" className="text-sentinel-emerald border-sentinel-emerald/30 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Ready
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Web scanning is included — no setup needed. Select "News", "Blogs", or "Web" when creating a scan.
        </p>
      </Card>

      {/* Twitter & Reddit */}
      {PROVIDERS.map(provider => {
        const connected = isConnected(provider.id);
        const guideOpen = expandedGuide === provider.id;

        return (
          <Card key={provider.id} className="bg-card border-border p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                  {provider.icon}
                </div>
                <div>
                  <div className="text-sm font-medium text-card-foreground">{provider.label}</div>
                  <p className="text-xs text-muted-foreground max-w-md">{provider.description}</p>
                </div>
              </div>
              {connected ? (
                <Badge variant="outline" className="text-sentinel-emerald border-sentinel-emerald/30 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground border-border flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Not connected
                </Badge>
              )}
            </div>

            {/* Pricing note */}
            {provider.pricingNote && (
              <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 border border-border">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">{provider.pricingNote}</p>
              </div>
            )}

            {/* What you get */}
            {!connected && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-card-foreground">What you'll get:</p>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside pl-1">
                  {provider.whatYouGet.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </div>
            )}

            {/* Setup guide (expandable) */}
            {!connected && (
              <div className="space-y-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs px-0 h-auto text-primary hover:text-primary"
                  onClick={() => setExpandedGuide(guideOpen ? null : provider.id)}
                >
                  {guideOpen ? "Hide setup guide ▲" : "Show setup guide ▼"}
                </Button>

                {guideOpen && (
                  <div className="bg-muted/30 rounded-lg p-4 space-y-3 border border-border animate-fade-up">
                    <p className="text-xs font-medium text-card-foreground">Step-by-step setup:</p>
                    <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
                      {provider.instructions.map((step, i) => (
                        <li key={i} className="leading-relaxed">{step}</li>
                      ))}
                    </ol>
                    <Button variant="outline" size="sm" asChild>
                      <a href={provider.signupUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3 w-3 mr-1.5" />
                        {provider.signupLabel}
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Key inputs */}
            <div className="space-y-3">
              {provider.keys.map(key => {
                const stored = getStoredValue(provider.id, key.name);
                const formKey = getFormKey(provider.id, key.name);
                const showKey = `${provider.id}__${key.name}`;

                return (
                  <div key={key.name} className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{key.label}</Label>
                    {stored && !formValues[formKey] ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-muted/50 rounded-md px-3 py-2 text-xs font-mono text-muted-foreground border border-border">
                          {showValues[showKey] ? stored.key_value : maskValue(stored.key_value)}
                        </div>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                          onClick={() => setShowValues(prev => ({ ...prev, [showKey]: !prev[showKey] }))}>
                          {showValues[showKey] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 text-xs"
                          onClick={() => setFormValues(prev => ({ ...prev, [formKey]: stored.key_value }))}>
                          Edit
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Input
                          type="password"
                          placeholder={key.placeholder}
                          value={formValues[formKey] || ""}
                          onChange={e => setFormValues(prev => ({ ...prev, [formKey]: e.target.value }))}
                        />
                        <p className="text-[10px] text-muted-foreground">{key.helpText}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-1">
              <div>
                {connected && (
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive text-xs"
                    onClick={() => handleDisconnect(provider)} disabled={deleting === provider.id}>
                    {deleting === provider.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
                    Disconnect
                  </Button>
                )}
              </div>
              <Button size="sm" onClick={() => handleSave(provider)}
                disabled={saving === provider.id || !provider.keys.some(k => formValues[getFormKey(provider.id, k.name)]?.trim())}>
                {saving === provider.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                {connected ? "Update Keys" : "Connect"}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
