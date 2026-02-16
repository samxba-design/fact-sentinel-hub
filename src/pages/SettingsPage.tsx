import { useEffect, useState } from "react";
import SourceConnectionsTab from "@/components/settings/SourceConnectionsTab";
import TeamManagementTab from "@/components/settings/TeamManagementTab";
import CustomSourcesTab from "@/components/settings/CustomSourcesTab";
import IntegrationsTab from "@/components/settings/IntegrationsTab";
import DangerZoneTab from "@/components/settings/DangerZoneTab";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Key, Layers, Globe, Bell, Link2, Plus, Database, Loader2, X, Trash2, Save, CreditCard, Plug, Users, Settings2, Shield, Mail } from "lucide-react";
import NotificationPreferencesTab from "@/components/settings/NotificationPreferencesTab";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Keyword { id: string; type: string; value: string; locked: boolean | null }
interface Topic { id: string; name: string; org_id: string | null; is_default: boolean | null }
interface Source { id: string; type: string; enabled: boolean | null }

export default function SettingsPage() {
  const { currentOrg, refetchOrgs } = useOrg();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Show success toast after Stripe checkout redirect
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

  // Keyword add state
  const [newKwValue, setNewKwValue] = useState("");
  const [newKwType, setNewKwType] = useState("brand");
  const [addingKw, setAddingKw] = useState(false);

  // Topic add state
  const [newTopicName, setNewTopicName] = useState("");
  const [addingTopic, setAddingTopic] = useState(false);

  // Source add state
  const [newSourceType, setNewSourceType] = useState("");
  const [addingSource, setAddingSource] = useState(false);

  // Alert config state
  const [alertEmails, setAlertEmails] = useState("");
  const [escalationEmails, setEscalationEmails] = useState("");
  const [scanSchedule, setScanSchedule] = useState("daily");
  const [quietStart, setQuietStart] = useState<number | null>(null);
  const [quietEnd, setQuietEnd] = useState<number | null>(null);
  const [savingAlerts, setSavingAlerts] = useState(false);

  const fetchData = async () => {
    if (!currentOrg) return;
    setLoading(true);
    const [kw, tp, sr, tracking] = await Promise.all([
      supabase.from("keywords").select("id, type, value, locked").eq("org_id", currentOrg.id).order("type"),
      supabase.from("topics").select("id, name, org_id, is_default").or(`org_id.eq.${currentOrg.id},org_id.is.null`).order("name"),
      supabase.from("sources").select("id, type, enabled").eq("org_id", currentOrg.id),
      supabase.from("tracking_profiles").select("*").eq("org_id", currentOrg.id).maybeSingle(),
    ]);
    setKeywords(kw.data || []);
    setTopics(tp.data || []);
    setSources(sr.data || []);
    if (tracking.data) {
      setAlertEmails((tracking.data.alert_emails || []).join(", "));
      setEscalationEmails((tracking.data.escalation_emails || []).join(", "));
      setScanSchedule(tracking.data.scan_schedule || "daily");
      setQuietStart(tracking.data.quiet_hours_start);
      setQuietEnd(tracking.data.quiet_hours_end);
    }
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
  const addTopic = async () => {
    if (!currentOrg || !newTopicName.trim()) return;
    setAddingTopic(true);
    const { data, error } = await supabase.from("topics")
      .insert({ org_id: currentOrg.id, name: newTopicName.trim() })
      .select("id, name, org_id, is_default")
      .single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (data) {
      setTopics(prev => [...prev, data]);
      setNewTopicName("");
      toast({ title: "Topic added" });
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
    if (!currentOrg || !newSourceType.trim()) return;
    setAddingSource(true);
    const { data, error } = await supabase.from("sources")
      .insert({ org_id: currentOrg.id, type: newSourceType.trim().toLowerCase(), enabled: true })
      .select("id, type, enabled")
      .single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (data) {
      setSources(prev => [...prev, data]);
      setNewSourceType("");
      toast({ title: "Source added" });
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

  // --- Alert config save ---
  const saveAlertConfig = async () => {
    if (!currentOrg) return;
    setSavingAlerts(true);
    const payload = {
      alert_emails: alertEmails.split(",").map(e => e.trim()).filter(Boolean),
      escalation_emails: escalationEmails.split(",").map(e => e.trim()).filter(Boolean),
      scan_schedule: scanSchedule,
      quiet_hours_start: quietStart,
      quiet_hours_end: quietEnd,
      updated_at: new Date().toISOString(),
    };

    // Upsert: try update first, insert if not exists
    const { data: existing } = await supabase.from("tracking_profiles").select("id").eq("org_id", currentOrg.id).maybeSingle();
    let error;
    if (existing) {
      ({ error } = await supabase.from("tracking_profiles").update(payload).eq("org_id", currentOrg.id));
    } else {
      ({ error } = await supabase.from("tracking_profiles").insert({ ...payload, org_id: currentOrg.id }));
    }
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Alert settings saved" });
    }
    setSavingAlerts(false);
  };

  const groupedKeywords = keywords.reduce<Record<string, Keyword[]>>((acc, k) => {
    (acc[k.type] = acc[k.type] || []).push(k);
    return acc;
  }, {});

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Tracking profile and organization settings</p>
        </div>
        <Button variant="outline" onClick={handleSeedDemo} disabled={seeding}>
          {seeding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Database className="h-4 w-4 mr-2" />}
          {seeding ? "Seeding..." : "Seed Demo Data"}
        </Button>
      </div>

      <Tabs defaultValue={searchParams.get("tab") || "keywords"} className="space-y-4">
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <TabsList className="bg-muted border border-border w-max min-w-full flex-nowrap">
            <TabsTrigger value="keywords"><Key className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Keywords</span></TabsTrigger>
            <TabsTrigger value="topics"><Layers className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Topics</span></TabsTrigger>
            <TabsTrigger value="sources"><Globe className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Sources</span></TabsTrigger>
            <TabsTrigger value="custom-sources"><Settings2 className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Custom Sources</span></TabsTrigger>
            <TabsTrigger value="alerts"><Bell className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Alerts</span></TabsTrigger>
            <TabsTrigger value="notifications"><Mail className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Notifications</span></TabsTrigger>
            <TabsTrigger value="connections"><Plug className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Connections</span></TabsTrigger>
            <TabsTrigger value="team"><Shield className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Team</span></TabsTrigger>
            <TabsTrigger value="subscription"><CreditCard className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Subscription</span></TabsTrigger>
            <TabsTrigger value="integrations"><Link2 className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Integrations</span></TabsTrigger>
            <TabsTrigger value="danger"><Trash2 className="h-3.5 w-3.5 mr-1.5 shrink-0" /><span className="whitespace-nowrap">Danger Zone</span></TabsTrigger>
          </TabsList>
        </div>

        {/* KEYWORDS TAB */}
        <TabsContent value="keywords">
          <Card className="bg-card border-border p-6 space-y-5">
            <h3 className="text-sm font-medium text-card-foreground">Keywords & Aliases</h3>

            {/* Add keyword form */}
            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <Select value={newKwType} onValueChange={setNewKwType}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="brand">Brand</SelectItem>
                    <SelectItem value="product">Product</SelectItem>
                    <SelectItem value="competitor">Competitor</SelectItem>
                    <SelectItem value="executive">Executive</SelectItem>
                    <SelectItem value="alias">Alias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Keyword</Label>
                <Input
                  placeholder="Enter keyword..."
                  value={newKwValue}
                  onChange={e => setNewKwValue(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addKeyword()}
                />
              </div>
              <Button size="sm" onClick={addKeyword} disabled={addingKw || !newKwValue.trim()}>
                {addingKw ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                Add
              </Button>
            </div>

            {loading ? (
              <Skeleton className="h-20 w-full" />
            ) : Object.keys(groupedKeywords).length === 0 ? (
              <p className="text-sm text-muted-foreground">No keywords configured. Add keywords to start tracking.</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedKeywords).map(([type, kws]) => (
                  <div key={type} className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">{type}</Label>
                    <div className="flex flex-wrap gap-2">
                      {kws.map(k => (
                        <Badge key={k.id} variant="secondary" className="text-xs pl-2 pr-1 py-1 flex items-center gap-1.5">
                          {k.value}
                          {!k.locked && (
                            <button onClick={() => deleteKeyword(k)} className="hover:text-destructive transition-colors p-0.5 rounded">
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* TOPICS TAB */}
        <TabsContent value="topics">
          <Card className="bg-card border-border p-6 space-y-5">
            <h3 className="text-sm font-medium text-card-foreground">Topic Taxonomy</h3>

            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Topic Name</Label>
                <Input
                  placeholder="Enter topic name..."
                  value={newTopicName}
                  onChange={e => setNewTopicName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addTopic()}
                />
              </div>
              <Button size="sm" onClick={addTopic} disabled={addingTopic || !newTopicName.trim()}>
                {addingTopic ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                Add
              </Button>
            </div>

            {loading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
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
                {topics.length === 0 && <p className="text-sm text-muted-foreground col-span-full">No topics found.</p>}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* SOURCES TAB */}
        <TabsContent value="sources">
          <Card className="bg-card border-border p-6 space-y-5">
            <h3 className="text-sm font-medium text-card-foreground">Sources Configuration</h3>

            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Source Type</Label>
                <Input
                  placeholder="e.g. tiktok, youtube, forums..."
                  value={newSourceType}
                  onChange={e => setNewSourceType(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addSource()}
                />
              </div>
              <Button size="sm" onClick={addSource} disabled={addingSource || !newSourceType.trim()}>
                {addingSource ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                Add
              </Button>
            </div>

            {loading ? (
              <Skeleton className="h-16 w-full" />
            ) : sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sources configured.</p>
            ) : (
              <div className="space-y-2">
                {sources.map(s => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                    <span className="text-sm text-card-foreground capitalize">{s.type}</span>
                    <div className="flex items-center gap-3">
                      <Switch checked={!!s.enabled} onCheckedChange={() => toggleSource(s)} />
                      <button onClick={() => deleteSource(s)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
          <Card className="bg-card border-border p-6 space-y-5">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-primary" />
              <div>
                <h3 className="text-sm font-medium text-card-foreground">Alert & Monitoring Configuration</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Scan schedules, alert emails, and monitoring settings are managed from the dedicated Alerts & Monitoring page for a unified experience.
                </p>
              </div>
            </div>
            <Button onClick={() => navigate("/alerts")} className="gap-2">
              <Bell className="h-4 w-4" /> Go to Alerts & Monitoring
            </Button>
          </Card>
        </TabsContent>

        {/* NOTIFICATIONS TAB */}
        <TabsContent value="notifications">
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
            <TeamManagementTab />
          </Card>
        </TabsContent>

        {/* INTEGRATIONS TAB */}
        <TabsContent value="integrations">
          <IntegrationsTab />
        </TabsContent>

        {/* DANGER ZONE TAB */}
        <TabsContent value="danger">
          <DangerZoneTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

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
