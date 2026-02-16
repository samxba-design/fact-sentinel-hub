import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Mail, FileSpreadsheet, Webhook, Loader2, Save, ExternalLink,
  CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Slack, MessageSquare,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface IntegrationConfig {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  fields: { name: string; label: string; placeholder: string; type?: string }[];
  helpText?: string;
}

const INTEGRATIONS: IntegrationConfig[] = [
  {
    id: "email_smtp",
    label: "Email (Resend)",
    description: "Send alert emails, escalation notifications, and weekly digests via Resend.",
    icon: <Mail className="h-4 w-4" />,
    fields: [
      { name: "api_key", label: "Resend API Key", placeholder: "re_..." },
      { name: "from_email", label: "From Email", placeholder: "alerts@yourdomain.com" },
      { name: "from_name", label: "From Name", placeholder: "SentiWatch Alerts" },
    ],
    helpText: "Sign up at resend.com for a free tier (3,000 emails/month). Add your domain and get an API key.",
  },
  {
    id: "google_sheets",
    label: "Google Sheets",
    description: "Automatically sync mentions and reports to Google Sheets for team collaboration.",
    icon: <FileSpreadsheet className="h-4 w-4" />,
    fields: [],
    helpText: "Connect via OAuth on the Exports page to authorize Google Sheets access.",
  },
  {
    id: "webhooks",
    label: "Webhooks",
    description: "Send real-time POST notifications to your own endpoints when new mentions or alerts are detected.",
    icon: <Webhook className="h-4 w-4" />,
    fields: [
      { name: "url", label: "Webhook URL", placeholder: "https://your-app.com/webhook" },
      { name: "secret", label: "Secret (optional)", placeholder: "whsec_..." },
    ],
    helpText: "We'll POST JSON payloads to your URL with mention data. Include a secret to verify authenticity via HMAC signature.",
  },
  {
    id: "slack",
    label: "Slack",
    description: "Send alert and escalation notifications to Slack channels.",
    icon: <MessageSquare className="h-4 w-4" />,
    fields: [
      { name: "webhook_url", label: "Incoming Webhook URL", placeholder: "https://hooks.slack.com/services/..." },
    ],
    helpText: "Create an Incoming Webhook in your Slack workspace settings and paste the URL here.",
  },
];

export default function IntegrationsTab() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [openDialog, setOpenDialog] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [storedIntegrations, setStoredIntegrations] = useState<Record<string, boolean>>({});
  const [loadedKeys, setLoadedKeys] = useState(false);

  // Load which integrations have stored keys
  useState(() => {
    if (!currentOrg || loadedKeys) return;
    supabase
      .from("org_api_keys")
      .select("provider")
      .eq("org_id", currentOrg.id)
      .then(({ data }) => {
        if (data) {
          const map: Record<string, boolean> = {};
          data.forEach(k => { map[k.provider] = true; });
          setStoredIntegrations(map);
        }
        setLoadedKeys(true);
      });
  });

  const handleSave = async (integration: IntegrationConfig) => {
    if (!currentOrg) return;
    setSaving(true);
    try {
      for (const field of integration.fields) {
        const key = `${integration.id}__${field.name}`;
        const value = formValues[key];
        if (!value?.trim()) continue;

        const { data: existing } = await supabase
          .from("org_api_keys")
          .select("id")
          .eq("org_id", currentOrg.id)
          .eq("provider", integration.id)
          .eq("key_name", field.name)
          .maybeSingle();

        if (existing) {
          await supabase.from("org_api_keys")
            .update({ key_value: value.trim(), updated_at: new Date().toISOString() })
            .eq("id", existing.id);
        } else {
          await supabase.from("org_api_keys")
            .insert({ org_id: currentOrg.id, provider: integration.id, key_name: field.name, key_value: value.trim() });
        }
      }

      setStoredIntegrations(prev => ({ ...prev, [integration.id]: true }));
      setOpenDialog(null);
      setFormValues(prev => {
        const next = { ...prev };
        integration.fields.forEach(f => delete next[`${integration.id}__${f.name}`]);
        return next;
      });
      toast({ title: `${integration.label} configured!` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async (integration: IntegrationConfig) => {
    if (!currentOrg) return;
    try {
      await supabase.from("org_api_keys")
        .delete()
        .eq("org_id", currentOrg.id)
        .eq("provider", integration.id);
      setStoredIntegrations(prev => ({ ...prev, [integration.id]: false }));
      toast({ title: `${integration.label} disconnected` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Card className="bg-card border-border p-6 space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-card-foreground">Integrations</h3>
        <p className="text-xs text-muted-foreground">
          Connect external services to extend SentiWatch's capabilities — receive alerts in Slack, sync data to Sheets, or trigger custom webhooks.
        </p>
      </div>

      <div className="space-y-3">
        {INTEGRATIONS.map(integration => {
          const connected = storedIntegrations[integration.id];
          const hasFields = integration.fields.length > 0;

          return (
            <div
              key={integration.id}
              className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  {integration.icon}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-card-foreground">{integration.label}</span>
                    {connected && (
                      <Badge variant="outline" className="text-sentinel-emerald border-sentinel-emerald/30 text-[10px]">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Connected
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate max-w-md">{integration.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {connected && hasFields && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDisconnect(integration);
                    }}
                  >
                    Disconnect
                  </Button>
                )}

                {hasFields ? (
                  <Dialog open={openDialog === integration.id} onOpenChange={(open) => setOpenDialog(open ? integration.id : null)}>
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDialog(integration.id);
                        }}
                      >
                        {connected ? "Reconfigure" : "Configure"}
                      </Button>
                    </DialogTrigger>
                    <DialogContent
                      className="sm:max-w-md"
                      onInteractOutside={(e) => e.preventDefault()}
                    >
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          {integration.icon}
                          Configure {integration.label}
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-2">
                        {integration.helpText && (
                          <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 border border-border">
                            {integration.helpText}
                          </p>
                        )}
                        {integration.fields.map(field => (
                          <div key={field.name} className="space-y-1.5">
                            <Label className="text-xs">{field.label}</Label>
                            <Input
                              type={field.type || "text"}
                              placeholder={field.placeholder}
                              value={formValues[`${integration.id}__${field.name}`] || ""}
                              onChange={(e) =>
                                setFormValues(prev => ({
                                  ...prev,
                                  [`${integration.id}__${field.name}`]: e.target.value,
                                }))
                              }
                            />
                          </div>
                        ))}
                        <Button
                          className="w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSave(integration);
                          }}
                          disabled={saving || integration.fields.every(f => !formValues[`${integration.id}__${f.name}`]?.trim())}
                        >
                          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                          Save Configuration
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Google Sheets uses OAuth — redirect to exports page
                      if (integration.id === "google_sheets") {
                        window.location.href = "/exports";
                      }
                    }}
                  >
                    {integration.id === "google_sheets" ? "Connect via Exports" : "Configure"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
