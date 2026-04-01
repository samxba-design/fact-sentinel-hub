/**
 * SmartDigestDialog — send a formatted intelligence digest email.
 * Invokes the send-digest edge function.
 */
import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Mail, Plus, X, Send, Loader2, CheckCheck, AlertTriangle,
  TrendingDown, Eye, BarChart3, RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useToast } from "@/hooks/use-toast";

interface PreviewStats {
  totalMentions: number;
  negativePct: number;
  criticalCount: number;
  alertCount: number;
  escalationCount: number;
  topNarratives: string[];
  topSources: string[];
}

export default function SmartDigestDialog() {
  const { currentOrg } = useOrg();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState("7");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [preview, setPreview] = useState<PreviewStats | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [alertEmails, setAlertEmails] = useState<string[]>([]);

  // Load saved alert_emails as default recipients
  useEffect(() => {
    if (!currentOrg || !open) return;
    supabase
      .from("tracking_profiles")
      .select("alert_emails")
      .eq("org_id", currentOrg.id)
      .maybeSingle()
      .then(({ data }) => {
        const emails = data?.alert_emails || [];
        setAlertEmails(emails);
        if (emails.length > 0 && recipients.length === 0) {
          setRecipients(emails.slice(0, 5));
        }
      });
  }, [currentOrg, open]);

  // Load preview stats on open
  const loadPreview = useCallback(async () => {
    if (!currentOrg) return;
    setLoadingPreview(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-digest", {
        body: { org_id: currentOrg.id, days: parseInt(days), preview_only: true },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Preview failed");
      setPreview(data.stats);
    } catch (err: any) {
      toast({ title: "Preview failed", description: err.message, variant: "destructive" });
    } finally {
      setLoadingPreview(false);
    }
  }, [currentOrg, days, toast]);

  useEffect(() => {
    if (open) loadPreview();
  }, [open, loadPreview]);

  const addEmail = () => {
    const email = emailInput.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    if (recipients.includes(email)) return;
    setRecipients(prev => [...prev, email]);
    setEmailInput("");
  };

  const removeEmail = (email: string) => {
    setRecipients(prev => prev.filter(e => e !== email));
  };

  const sendDigest = async () => {
    if (!currentOrg || recipients.length === 0) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-digest", {
        body: { org_id: currentOrg.id, recipients, days: parseInt(days), preview_only: false },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Send failed");
      setSent(true);
      toast({
        title: `Digest sent to ${data.sent} recipient${data.sent !== 1 ? "s" : ""}`,
        description: data.subject,
      });
    } catch (err: any) {
      toast({ title: "Failed to send digest", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) { setSent(false); setPreview(null); }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Mail className="h-3.5 w-3.5" /> Email Digest
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Smart Intelligence Digest
          </DialogTitle>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-center py-8 gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCheck className="h-8 w-8 text-emerald-400" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-semibold text-foreground">Digest sent!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {recipients.length} recipient{recipients.length !== 1 ? "s" : ""} will receive the brief shortly.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSent(false)}>Send Another</Button>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            {/* Time range */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground flex-shrink-0">Cover last</span>
              <Select value={days} onValueChange={v => { setDays(v); setPreview(null); }}>
                <SelectTrigger className="w-28 bg-muted border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">24 hours</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={loadPreview} disabled={loadingPreview} className="h-8 gap-1.5">
                <RefreshCw className={`h-3.5 w-3.5 ${loadingPreview ? "animate-spin" : ""}`} /> Preview
              </Button>
            </div>

            {/* Stats preview */}
            {loadingPreview ? (
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : preview ? (
              <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email will include</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-card border border-border rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold text-foreground">{preview.totalMentions}</p>
                    <p className="text-[10px] text-muted-foreground">mentions</p>
                  </div>
                  <div className={`border rounded-lg p-2.5 text-center ${preview.negativePct > 30 ? "bg-red-500/5 border-red-500/20" : "bg-card border-border"}`}>
                    <p className={`text-lg font-bold ${preview.negativePct > 30 ? "text-red-400" : "text-foreground"}`}>{preview.negativePct}%</p>
                    <p className="text-[10px] text-muted-foreground">negative</p>
                  </div>
                  <div className={`border rounded-lg p-2.5 text-center ${preview.criticalCount > 0 ? "bg-red-500/5 border-red-500/20" : "bg-card border-border"}`}>
                    <p className={`text-lg font-bold ${preview.criticalCount > 0 ? "text-red-400" : "text-foreground"}`}>{preview.criticalCount}</p>
                    <p className="text-[10px] text-muted-foreground">critical</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold text-foreground">{preview.alertCount}</p>
                    <p className="text-[10px] text-muted-foreground">alerts</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold text-foreground">{preview.escalationCount}</p>
                    <p className="text-[10px] text-muted-foreground">open escalations</p>
                  </div>
                  <div className="bg-card border border-border rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold text-foreground">{preview.topNarratives.length}</p>
                    <p className="text-[10px] text-muted-foreground">narratives</p>
                  </div>
                </div>
                {preview.topNarratives.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {preview.topNarratives.map(n => (
                      <Badge key={n} variant="outline" className="text-[10px] border-primary/20 text-primary bg-primary/5">
                        {n}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {/* Recipients */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Recipients</p>
              <div className="flex gap-2">
                <Input
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  placeholder="name@company.com"
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
                  className="bg-muted border-border text-sm"
                />
                <Button variant="outline" size="sm" onClick={addEmail} className="flex-shrink-0">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              {alertEmails.length > 0 && recipients.length === 0 && (
                <button
                  onClick={() => setRecipients(alertEmails.slice(0, 5))}
                  className="text-xs text-primary hover:underline"
                >
                  + Use saved alert emails ({alertEmails.join(", ")})
                </button>
              )}
              {recipients.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {recipients.map(email => (
                    <Badge key={email} variant="outline" className="text-xs gap-1.5 border-border">
                      {email}
                      <button onClick={() => removeEmail(email)} className="hover:text-destructive transition-colors">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <Button
              onClick={sendDigest}
              disabled={sending || recipients.length === 0}
              className="w-full gap-2"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? "Sending..." : `Send Digest to ${recipients.length} Recipient${recipients.length !== 1 ? "s" : ""}`}
            </Button>

            <p className="text-[10px] text-muted-foreground text-center">
              Requires RESEND_API_KEY configured in your Supabase project edge function secrets.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
