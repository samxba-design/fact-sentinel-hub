import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Key, Layers, Network, Users, Globe, Bell, Link2, Plus, Database, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const { currentOrg, refetchOrgs } = useOrg();
  const { toast } = useToast();
  const [keywords, setKeywords] = useState<{ type: string; value: string }[]>([]);
  const [topics, setTopics] = useState<{ name: string }[]>([]);
  const [sources, setSources] = useState<{ type: string; enabled: boolean | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      const { data, error } = await supabase.functions.invoke("seed-demo");
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast({ title: "Demo data seeded!", description: `${data.mentions_created} mentions created` });
      await refetchOrgs();
      // Refresh settings data
      if (currentOrg) {
        const [kw, tp, sr] = await Promise.all([
          supabase.from("keywords").select("type, value").eq("org_id", currentOrg.id).order("type"),
          supabase.from("topics").select("name").or(`org_id.eq.${currentOrg.id},org_id.is.null`).order("name"),
          supabase.from("sources").select("type, enabled").eq("org_id", currentOrg.id),
        ]);
        setKeywords(kw.data || []);
        setTopics(tp.data || []);
        setSources(sr.data || []);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  };

  useEffect(() => {
    if (!currentOrg) return;
    setLoading(true);
    Promise.all([
      supabase.from("keywords").select("type, value").eq("org_id", currentOrg.id).order("type"),
      supabase.from("topics").select("name").or(`org_id.eq.${currentOrg.id},org_id.is.null`).order("name"),
      supabase.from("sources").select("type, enabled").eq("org_id", currentOrg.id),
    ]).then(([kw, tp, sr]) => {
      setKeywords(kw.data || []);
      setTopics(tp.data || []);
      setSources(sr.data || []);
      setLoading(false);
    });
  }, [currentOrg]);

  const groupedKeywords = keywords.reduce<Record<string, string[]>>((acc, k) => {
    (acc[k.type] = acc[k.type] || []).push(k.value);
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

      <Tabs defaultValue="keywords" className="space-y-4">
        <TabsList className="bg-muted border border-border">
          <TabsTrigger value="keywords"><Key className="h-3.5 w-3.5 mr-1.5" />Keywords</TabsTrigger>
          <TabsTrigger value="topics"><Layers className="h-3.5 w-3.5 mr-1.5" />Topics</TabsTrigger>
          <TabsTrigger value="sources"><Globe className="h-3.5 w-3.5 mr-1.5" />Sources</TabsTrigger>
          <TabsTrigger value="alerts"><Bell className="h-3.5 w-3.5 mr-1.5" />Alerts</TabsTrigger>
          <TabsTrigger value="integrations"><Link2 className="h-3.5 w-3.5 mr-1.5" />Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="keywords">
          <Card className="bg-card border-border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-card-foreground">Keywords & Aliases</h3>
              <Button size="sm"><Plus className="h-3 w-3 mr-1" /> Add Keywords</Button>
            </div>
            {loading ? (
              <Skeleton className="h-20 w-full" />
            ) : Object.keys(groupedKeywords).length === 0 ? (
              <p className="text-sm text-muted-foreground">No keywords configured. Add keywords to start tracking.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(groupedKeywords).map(([type, vals]) => (
                  <div key={type} className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">{type}</Label>
                    <div className="flex flex-wrap gap-2">
                      {vals.map(k => <Badge key={k} variant="secondary" className="text-xs">{k}</Badge>)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="topics">
          <Card className="bg-card border-border p-6">
            <h3 className="text-sm font-medium text-card-foreground mb-4">Topic Taxonomy</h3>
            {loading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {topics.map(t => (
                  <Badge key={t.name} variant="outline" className="justify-center py-2 text-xs">{t.name}</Badge>
                ))}
                {topics.length === 0 && <p className="text-sm text-muted-foreground col-span-full">No topics found.</p>}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="sources">
          <Card className="bg-card border-border p-6 space-y-4">
            <h3 className="text-sm font-medium text-card-foreground">Sources Configuration</h3>
            {loading ? (
              <Skeleton className="h-16 w-full" />
            ) : sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sources configured.</p>
            ) : (
              <div className="space-y-3">
                {sources.map((s, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <span className="text-sm text-card-foreground capitalize">{s.type}</span>
                    <Badge variant="outline" className={`text-[10px] ${s.enabled ? "border-sentinel-emerald/30 text-sentinel-emerald" : "border-muted-foreground/30 text-muted-foreground"}`}>
                      {s.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="alerts">
          <Card className="bg-card border-border p-6">
            <h3 className="text-sm font-medium text-card-foreground">Alert Rules</h3>
            <p className="text-xs text-muted-foreground mt-2">Configure severity thresholds, spike detection, and notification settings.</p>
          </Card>
        </TabsContent>

        <TabsContent value="integrations">
          <Card className="bg-card border-border p-6 space-y-4">
            <h3 className="text-sm font-medium text-card-foreground">Integrations</h3>
            <div className="space-y-3">
              {[
                { name: "Email (SMTP)", status: "Not configured" },
                { name: "Google Sheets", status: "Not connected" },
                { name: "Webhooks", status: "Not configured" },
              ].map((int, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm text-card-foreground">{int.name}</span>
                  <Button size="sm" variant="outline">Configure</Button>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
