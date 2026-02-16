import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Mail, FileSpreadsheet, Webhook, Loader2, Save, ExternalLink,
  CheckCircle2, MessageSquare, ChevronDown, ChevronUp, Info,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface IntegrationConfig {
  id: string;
  label: string;
  shortDescription: string;
  fullDescription: string;
  icon: React.ReactNode;
  fields: { name: string; label: string; placeholder: string; type?: string; helpText?: string }[];
  steps: string[];
  externalLinks: { label: string; url: string }[];
}

const INTEGRATIONS: IntegrationConfig[] = [
  {
    id: "email_smtp",
    label: "Email (Resend)",
    shortDescription: "Send alert emails, escalation notifications, and weekly digests.",
    fullDescription:
      "Resend is an email delivery service that SentiWatch uses to send you real-time alert emails when critical mentions are detected, escalation notifications when issues are assigned, and weekly digest summaries of your brand's online presence. Once configured, emails are sent automatically — no manual action needed.",
    icon: <Mail className="h-5 w-5" />,
    fields: [
      { name: "api_key", label: "Resend API Key", placeholder: "re_...", helpText: "Found in your Resend dashboard under API Keys." },
      { name: "from_email", label: "From Email", placeholder: "alerts@yourdomain.com", helpText: "Must be a verified domain or email in Resend." },
      { name: "from_name", label: "From Name", placeholder: "SentiWatch Alerts", helpText: "The sender name recipients will see." },
    ],
    steps: [
      "Go to resend.com and create a free account (3,000 emails/month free).",
      "Verify your sending domain or use the default onboarding domain.",
      "Navigate to API Keys in your Resend dashboard and create a new key.",
      "Paste the API key and your verified email address below.",
      "Click Save — SentiWatch will start sending alerts automatically.",
    ],
    externalLinks: [
      { label: "Create a Resend account", url: "https://resend.com/signup" },
      { label: "Resend documentation", url: "https://resend.com/docs" },
    ],
  },
  {
    id: "google_sheets",
    label: "Google Sheets",
    shortDescription: "Sync mentions and reports to Google Sheets automatically.",
    fullDescription:
      "Connect your Google account to automatically export mention data, scan results, and generated reports directly into Google Sheets. This is great for sharing data with team members who prefer spreadsheets, or for creating custom dashboards and analyses outside of SentiWatch.",
    icon: <FileSpreadsheet className="h-5 w-5" />,
    fields: [],
    steps: [
      "Click 'Connect via Exports' below — you'll be taken to the Exports page.",
      "Click the Google Sheets connection button and sign in with your Google account.",
      "Authorize SentiWatch to create and edit spreadsheets on your behalf.",
      "Once connected, you can export any mention data or report to Sheets with one click.",
    ],
    externalLinks: [
      { label: "Learn about Google Sheets exports", url: "https://support.google.com/sheets" },
    ],
  },
  {
    id: "webhooks",
    label: "Webhooks",
    shortDescription: "Send real-time POST notifications to your own endpoints.",
    fullDescription:
      "Webhooks let you receive instant notifications in your own systems whenever SentiWatch detects new mentions, alerts, or escalations. SentiWatch will send a JSON payload via HTTP POST to any URL you specify. This is ideal for connecting SentiWatch to internal tools, Zapier, Make, or custom applications.",
    icon: <Webhook className="h-5 w-5" />,
    fields: [
      { name: "url", label: "Webhook URL", placeholder: "https://your-app.com/webhook", helpText: "The endpoint that will receive POST requests with JSON data." },
      { name: "secret", label: "Signing Secret (optional)", placeholder: "whsec_...", helpText: "Used to verify webhook authenticity via HMAC-SHA256 signature." },
    ],
    steps: [
      "Determine where you want to receive notifications (your app, Zapier, Make, etc.).",
      "Create an endpoint URL that accepts HTTP POST requests with JSON body.",
      "Paste the URL below. Optionally add a signing secret for security verification.",
      "Click Save — SentiWatch will POST a JSON payload whenever new data is detected.",
    ],
    externalLinks: [
      { label: "What are webhooks? (beginner guide)", url: "https://zapier.com/blog/what-are-webhooks/" },
      { label: "Use webhooks with Zapier", url: "https://zapier.com/apps/webhook/integrations" },
      { label: "Use webhooks with Make", url: "https://www.make.com/en/help/tools/webhooks" },
    ],
  },
  {
    id: "slack",
    label: "Slack",
    shortDescription: "Get alert and escalation notifications directly in Slack.",
    fullDescription:
      "Connect SentiWatch to your Slack workspace so your team receives instant notifications in a channel of your choice whenever critical mentions, sentiment spikes, or escalation updates occur. This keeps everyone informed without needing to log into SentiWatch.",
    icon: <MessageSquare className="h-5 w-5" />,
    fields: [
      { name: "webhook_url", label: "Incoming Webhook URL", placeholder: "https://hooks.slack.com/services/...", helpText: "Generated when you create an Incoming Webhook in Slack." },
    ],
    steps: [
      "Open your Slack workspace and go to Settings → Manage Apps.",
      "Search for 'Incoming Webhooks' and add it to your workspace.",
      "Choose the channel where you want SentiWatch notifications to appear.",
      "Copy the Webhook URL that Slack generates for you.",
      "Paste it below and click Save — notifications will start flowing to Slack.",
    ],
    externalLinks: [
      { label: "Slack Incoming Webhooks guide", url: "https://api.slack.com/messaging/webhooks" },
      { label: "Slack App Directory", url: "https://slack.com/apps" },
    ],
  },
];

export default function IntegrationsTab() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [openDialog, setOpenDialog] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [storedIntegrations, setStoredIntegrations] = useState<Record<string, boolean>>({});
  const [loadedKeys, setLoadedKeys] = useState(false);

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

  const toggleExpand = (id: string) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

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
          Connect external services to extend SentiWatch — receive alerts in Slack, sync data to Sheets, or trigger custom webhooks. Click any integration to see step-by-step setup instructions.
        </p>
      </div>

      <div className="space-y-3">
        {INTEGRATIONS.map(integration => {
          const connected = storedIntegrations[integration.id];
          const hasFields = integration.fields.length > 0;
          const isExpanded = expandedCards[integration.id] || false;

          return (
            <Collapsible
              key={integration.id}
              open={isExpanded}
              onOpenChange={() => toggleExpand(integration.id)}
            >
              <div className="rounded-lg bg-muted/30 border border-border overflow-hidden">
                {/* Header row */}
                <CollapsibleTrigger asChild>
                  <button className="flex items-center justify-between w-full p-4 text-left hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        {integration.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-card-foreground">{integration.label}</span>
                          {connected && (
                            <Badge variant="outline" className="text-sentinel-emerald border-sentinel-emerald/30 text-[10px]">
                              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Connected
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{integration.shortDescription}</p>
                      </div>
                    </div>
                    <div className="shrink-0 ml-2 text-muted-foreground">
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </button>
                </CollapsibleTrigger>

                {/* Expanded content */}
                <CollapsibleContent>
                  <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
                    {/* Full description */}
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {integration.fullDescription}
                    </p>

                    {/* Step-by-step guide */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-card-foreground flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5 text-primary" />
                        How to set up
                      </h4>
                      <ol className="space-y-1.5 pl-5 list-decimal">
                        {integration.steps.map((step, i) => (
                          <li key={i} className="text-xs text-muted-foreground leading-relaxed">{step}</li>
                        ))}
                      </ol>
                    </div>

                    {/* External links */}
                    {integration.externalLinks.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {integration.externalLinks.map((link, i) => (
                          <a
                            key={i}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {link.label}
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 pt-1">
                      {connected && hasFields && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs text-destructive hover:text-destructive"
                          onClick={() => handleDisconnect(integration)}
                        >
                          Disconnect
                        </Button>
                      )}

                      {hasFields ? (
                        <Dialog open={openDialog === integration.id} onOpenChange={(open) => setOpenDialog(open ? integration.id : null)}>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="default">
                              {connected ? "Reconfigure" : "Configure"}
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
                            <DialogHeader>
                              <DialogTitle className="flex items-center gap-2">
                                {integration.icon}
                                Configure {integration.label}
                              </DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-2">
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
                                  {field.helpText && (
                                    <p className="text-[11px] text-muted-foreground">{field.helpText}</p>
                                  )}
                                </div>
                              ))}
                              <Button
                                className="w-full"
                                onClick={() => handleSave(integration)}
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
                          variant="default"
                          onClick={() => {
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
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>
    </Card>
  );
}
