import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Key, Layers, Network, Users, Globe, Bell, Link2, Plus } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Tracking profile and organization settings</p>
      </div>

      <Tabs defaultValue="keywords" className="space-y-4">
        <TabsList className="bg-muted border border-border">
          <TabsTrigger value="keywords"><Key className="h-3.5 w-3.5 mr-1.5" />Keywords</TabsTrigger>
          <TabsTrigger value="topics"><Layers className="h-3.5 w-3.5 mr-1.5" />Topics</TabsTrigger>
          <TabsTrigger value="narratives"><Network className="h-3.5 w-3.5 mr-1.5" />Narratives</TabsTrigger>
          <TabsTrigger value="people"><Users className="h-3.5 w-3.5 mr-1.5" />People</TabsTrigger>
          <TabsTrigger value="sources"><Globe className="h-3.5 w-3.5 mr-1.5" />Sources</TabsTrigger>
          <TabsTrigger value="alerts"><Bell className="h-3.5 w-3.5 mr-1.5" />Alerts</TabsTrigger>
          <TabsTrigger value="integrations"><Link2 className="h-3.5 w-3.5 mr-1.5" />Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="keywords">
          <Card className="bg-card border-border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-card-foreground">Keywords & Aliases</h3>
              <Button size="sm">
                <Plus className="h-3 w-3 mr-1" /> Add Keywords
              </Button>
            </div>
            <div className="space-y-3">
              {[
                { type: "Brand", keywords: ["Acme Corp", "Acme", "ACME"] },
                { type: "Product", keywords: ["AcmePay", "Acme Wallet", "Acme Exchange"] },
                { type: "Risk Trigger", keywords: ["hack", "breach", "scam", "fraud", "lawsuit"] },
                { type: "Competitor", keywords: ["CompetitorA", "CompetitorB"] },
              ].map((g, i) => (
                <div key={i} className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">{g.type}</Label>
                  <div className="flex flex-wrap gap-2">
                    {g.keywords.map(k => (
                      <Badge key={k} variant="secondary" className="text-xs">{k}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="topics">
          <Card className="bg-card border-border p-6">
            <h3 className="text-sm font-medium text-card-foreground mb-4">Topic Taxonomy</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {["Security", "Compliance", "Product/Outage", "Support", "Leadership", "Scams/Impersonation", "Fees/Pricing", "Withdrawals", "Listing/Delisting", "Partnerships", "Regulatory"].map(t => (
                <Badge key={t} variant="outline" className="justify-center py-2 text-xs">{t}</Badge>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="narratives">
          <Card className="bg-card border-border p-6">
            <h3 className="text-sm font-medium text-card-foreground">Narratives Library</h3>
            <p className="text-xs text-muted-foreground mt-2">Configure tracked narratives in the Narratives page.</p>
          </Card>
        </TabsContent>

        <TabsContent value="people">
          <Card className="bg-card border-border p-6">
            <h3 className="text-sm font-medium text-card-foreground">People Tracker</h3>
            <p className="text-xs text-muted-foreground mt-2">Manage tracked people in the People page.</p>
          </Card>
        </TabsContent>

        <TabsContent value="sources">
          <Card className="bg-card border-border p-6 space-y-4">
            <h3 className="text-sm font-medium text-card-foreground">Sources Configuration</h3>
            <div className="space-y-3">
              {[
                { name: "News Websites", enabled: true },
                { name: "Reddit & Forums", enabled: true },
                { name: "App Stores (iOS/Google Play)", enabled: false },
                { name: "Social Platforms", enabled: false },
              ].map((s, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm text-card-foreground">{s.name}</span>
                  <Badge variant="outline" className={`text-[10px] ${s.enabled ? "border-sentinel-emerald/30 text-sentinel-emerald" : "border-muted-foreground/30 text-muted-foreground"}`}>
                    {s.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              ))}
            </div>
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
