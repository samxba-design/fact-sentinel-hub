import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Shield, ArrowRight, ArrowLeft, Building2, Sparkles, Clock, Bell,
  Loader2, Check, X, User, Globe, Newspaper, MessageSquare, Mail,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const STEPS = [
  { label: "Company", icon: Building2 },
  { label: "AI Profile", icon: Sparkles },
  { label: "Schedule", icon: Clock },
  { label: "Alerts", icon: Bell },
  { label: "Notifications", icon: Mail },
];

const INDUSTRIES = ["Fintech", "Crypto/Exchange", "SaaS", "Healthcare", "E-commerce", "Banking", "Insurance", "Gaming", "Media", "Other"];
const REGIONS = ["North America", "Europe", "Asia Pacific", "Latin America", "Middle East", "Africa"];
const LANGUAGES = ["English", "Spanish", "French", "German", "Portuguese", "Chinese", "Japanese", "Arabic", "Hindi", "Korean"];
const TIMEZONES = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Europe/Paris", "Asia/Tokyo", "Asia/Shanghai", "Asia/Mumbai", "Australia/Sydney"];

interface ProfileSuggestion {
  aliases: { value: string; confidence: number; evidence: string }[];
  brand_keywords: { value: string; confidence: number }[];
  product_keywords: { value: string; confidence: number }[];
  risk_keywords: { value: string; confidence: number }[];
  topics: { name: string; description: string }[];
  narratives: { name: string; description: string; example_phrases?: string[]; confidence: number }[];
  people: { name: string; title?: string; tier: string; confidence: number }[];
  sources: { type: string; reason: string }[];
}

export default function OnboardingPage() {
  const { user, isSuperAdmin } = useAuth();
  const { orgs, refetchOrgs } = useOrg();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [isNewOrg, setIsNewOrg] = useState(false);

  // If user already has orgs and didn't explicitly come here to create a new one,
  // redirect them to the dashboard
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const intentNew = params.get("new") === "true";
    setIsNewOrg(intentNew);
    if (orgs.length > 0 && !intentNew) {
      navigate("/", { replace: true });
    }
  }, [orgs, navigate]);

  // Step 1: Company details
  const [orgName, setOrgName] = useState("");
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState("");
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(["English"]);
  const [timezone, setTimezone] = useState("UTC");

  // Step 2: AI profile
  const [profile, setProfile] = useState<ProfileSuggestion | null>(null);
  const [generatingProfile, setGeneratingProfile] = useState(false);
  const [approvedSections, setApprovedSections] = useState<Record<string, boolean>>({
    aliases: true, brand_keywords: true, product_keywords: true, risk_keywords: true,
    topics: true, narratives: true, people: true, sources: true,
  });

  // Step 3: Schedule
  const [scanSchedule, setScanSchedule] = useState("daily_9am");
  const [customCron, setCustomCron] = useState("0 9 * * *");

  // Step 4: Alerts
  const [alertEmails, setAlertEmails] = useState("");
  const [escalationEmails, setEscalationEmails] = useState("");
  const [quietStart, setQuietStart] = useState("22");
  const [quietEnd, setQuietEnd] = useState("7");

  // Step 5: Notification preferences
  const [notifPrefs, setNotifPrefs] = useState({
    email_enabled: true,
    critical_alerts: true,
    negative_spikes: true,
    mention_spikes: false,
    viral_risk: true,
    escalation_assigned: true,
    escalation_updated: false,
    new_scan_complete: false,
    weekly_digest: true,
  });

  const toggleRegion = (r: string) =>
    setSelectedRegions(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  const toggleLang = (l: string) =>
    setSelectedLanguages(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]);
  const toggleSection = (key: string) =>
    setApprovedSections(prev => ({ ...prev, [key]: !prev[key] }));

  const handleGenerateProfile = async () => {
    setGeneratingProfile(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-profile", {
        body: { company_name: orgName, domain, industry, regions: selectedRegions, languages: selectedLanguages },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setProfile(data as ProfileSuggestion);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingProfile(false);
    }
  };

  const handleFinish = async () => {
    if (!user) return;
    setSaving(true);

    try {
      const baseSlug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const slugSuffix = Math.random().toString(36).substring(2, 6);
      const slug = `${baseSlug}-${slugSuffix}`;

      // Check if user signed up with a beta invite code
      const betaCode = localStorage.getItem("sentiwatch_beta_code");
      const isBeta = !!betaCode;
      if (betaCode) {
        localStorage.removeItem("sentiwatch_beta_code");
      }

      // Generate org ID client-side so we can create membership immediately after
      // without needing .select() (which would fail since user isn't a member yet)
      const orgId = crypto.randomUUID();

      const { error: orgError } = await supabase
        .from("organizations")
        .insert({
          id: orgId,
          name: orgName, slug, domain, industry,
          regions: selectedRegions, languages: selectedLanguages, timezone,
          ...(isBeta ? { subscription_status: "active", subscription_type: "beta", plan: "pro" } : {}),
        });
      if (orgError) throw orgError;

      const { error: memError } = await supabase
        .from("org_memberships")
        .insert({ org_id: orgId, user_id: user.id, role: "owner" as any, accepted_at: new Date().toISOString() });
      if (memError) throw memError;

      const org = { id: orgId };

      const cronValue = scanSchedule === "custom" ? customCron :
        scanSchedule === "daily_9am" ? "0 9 * * *" :
        scanSchedule === "every_6h" ? "0 */6 * * *" :
        scanSchedule === "every_12h" ? "0 */12 * * *" : "0 9 * * *";

      const alertEmailList = alertEmails.split(",").map(e => e.trim()).filter(Boolean);
      const escEmailList = escalationEmails.split(",").map(e => e.trim()).filter(Boolean);

      await supabase.from("tracking_profiles").insert({
        org_id: org.id,
        scan_schedule: cronValue,
        alert_emails: alertEmailList,
        escalation_emails: escEmailList,
        quiet_hours_start: parseInt(quietStart) || null,
        quiet_hours_end: parseInt(quietEnd) || null,
      });

      // Save notification preferences
      if (user) {
        await supabase.from("notification_preferences").insert({
          org_id: org.id,
          user_id: user.id,
          email_enabled: notifPrefs.email_enabled,
          critical_alerts: notifPrefs.critical_alerts,
          negative_spikes: notifPrefs.negative_spikes,
          mention_spikes: notifPrefs.mention_spikes,
          viral_risk: notifPrefs.viral_risk,
          escalation_assigned: notifPrefs.escalation_assigned,
          escalation_updated: notifPrefs.escalation_updated,
          new_scan_complete: notifPrefs.new_scan_complete,
          weekly_digest: notifPrefs.weekly_digest,
        });
      }

      if (profile) {
        if (approvedSections.brand_keywords && profile.brand_keywords.length > 0) {
          await supabase.from("keywords").insert(
            profile.brand_keywords.map(k => ({ org_id: org.id, type: "brand", value: k.value, status: "active" }))
          );
        }
        if (approvedSections.product_keywords && profile.product_keywords.length > 0) {
          await supabase.from("keywords").insert(
            profile.product_keywords.map(k => ({ org_id: org.id, type: "product", value: k.value, status: "active" }))
          );
        }
        if (approvedSections.risk_keywords && profile.risk_keywords.length > 0) {
          await supabase.from("keywords").insert(
            profile.risk_keywords.map(k => ({ org_id: org.id, type: "risk", value: k.value, status: "active" }))
          );
        }
        if (approvedSections.aliases && profile.aliases.length > 0) {
          await supabase.from("keywords").insert(
            profile.aliases.map(a => ({ org_id: org.id, type: "alias", value: a.value, status: "active" }))
          );
        }
        if (approvedSections.topics && profile.topics.length > 0) {
          await supabase.from("topics").insert(
            profile.topics.map(t => ({ org_id: org.id, name: t.name, description: t.description }))
          );
        }
        if (approvedSections.narratives && profile.narratives.length > 0) {
          await supabase.from("narratives").insert(
            profile.narratives.map(n => ({
              org_id: org.id, name: n.name, description: n.description,
              example_phrases: n.example_phrases || [], status: "watch", confidence: n.confidence,
            }))
          );
        }
        if (approvedSections.sources && profile.sources.length > 0) {
          await supabase.from("sources").insert(
            profile.sources.map(s => ({ org_id: org.id, type: s.type, enabled: true }))
          );
        }
        // Save AI-suggested people
        if (approvedSections.people && profile.people.length > 0) {
          for (const person of profile.people) {
            const { data: personRow, error: personErr } = await supabase
              .from("people")
              .insert({ name: person.name, titles: person.title ? [person.title] : [] })
              .select("id")
              .single();
            if (!personErr && personRow) {
              await supabase.from("org_people").insert({
                org_id: org.id,
                person_id: personRow.id,
                tier: person.tier || "other",
                confidence: person.confidence,
                status: "suggested",
              });
            }
          }
        }
      }

      await refetchOrgs();
      toast({ title: "Organization created!", description: `Welcome to ${orgName}` });
      navigate("/");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const canAdvance = () => {
    if (step === 0) return orgName.trim().length > 0;
    return true;
  };

  return (
    <div className="dark min-h-screen bg-background p-4 flex flex-col items-center">
      <div className="w-full max-w-2xl space-y-6 animate-fade-up py-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 sentinel-glow">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">SentiWatch</h1>
          </div>
           <p className="text-muted-foreground">
             {isNewOrg ? "Set up a new organization" : "Set up your organization"}
           </p>
          {isNewOrg && (
            <button
              onClick={() => navigate("/")}
              className="inline-flex items-center gap-1.5 mt-2 text-sm text-primary hover:text-primary/80 underline underline-offset-4"
            >
              ← Back to Dashboard
            </button>
          )}
          {isSuperAdmin && !isNewOrg && (
            <a href="/admin" className="inline-flex items-center gap-1.5 mt-2 text-sm text-primary hover:text-primary/80 underline underline-offset-4">
              <Shield className="h-3.5 w-3.5" />
              Go to Admin Panel
            </a>
          )}
        </div>
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = i === step;
            const done = i < step;
            return (
              <div key={i} className="flex items-center gap-2">
                {i > 0 && <div className={`w-8 h-px ${done ? "bg-primary" : "bg-border"}`} />}
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  active ? "bg-primary text-primary-foreground" : done ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                }`}>
                  {done ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <Card className="bg-card border-border p-8 shadow-xl">
          {/* STEP 1: Company Details */}
          {step === 0 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <Building2 className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold text-card-foreground">Company Details</h2>
              </div>

              <div className="space-y-2">
                <Label>Organization name *</Label>
                <Input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Acme Corp" required className="bg-muted border-border" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Primary domain</Label>
                  <Input value={domain} onChange={e => setDomain(e.target.value)} placeholder="acme.com" className="bg-muted border-border" />
                </div>
                <div className="space-y-2">
                  <Label>Industry</Label>
                  <Select value={industry} onValueChange={setIndustry}>
                    <SelectTrigger className="bg-muted border-border"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map(tz => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Regions</Label>
                <div className="flex flex-wrap gap-2">
                  {REGIONS.map(r => (
                    <Badge key={r} variant={selectedRegions.includes(r) ? "default" : "outline"}
                      className="cursor-pointer" onClick={() => toggleRegion(r)}>
                      {selectedRegions.includes(r) && <Check className="h-3 w-3 mr-1" />}{r}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Languages</Label>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map(l => (
                    <Badge key={l} variant={selectedLanguages.includes(l) ? "default" : "outline"}
                      className="cursor-pointer" onClick={() => toggleLang(l)}>
                      {selectedLanguages.includes(l) && <Check className="h-3 w-3 mr-1" />}{l}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: AI Profile */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold text-card-foreground">AI Auto-Build Profile</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Generate a suggested monitoring profile based on your company details. You can approve, edit, or ignore each section.
              </p>

              {!profile && (
                <Button onClick={handleGenerateProfile} disabled={generatingProfile} className="w-full">
                  {generatingProfile ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  {generatingProfile ? "Generating profile..." : "Generate Suggested Profile"}
                </Button>
              )}

              {profile && (
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                  <ProfileSection
                    title="Aliases" items={profile.aliases.map(a => `${a.value} (${Math.round(a.confidence * 100)}%)`)}
                    approved={approvedSections.aliases} onToggle={() => toggleSection("aliases")} />
                  <ProfileSection
                    title="Brand Keywords" items={profile.brand_keywords.map(k => k.value)}
                    approved={approvedSections.brand_keywords} onToggle={() => toggleSection("brand_keywords")} />
                  <ProfileSection
                    title="Product Keywords" items={profile.product_keywords.map(k => k.value)}
                    approved={approvedSections.product_keywords} onToggle={() => toggleSection("product_keywords")} />
                  <ProfileSection
                    title="Risk Keywords" items={profile.risk_keywords.map(k => k.value)}
                    approved={approvedSections.risk_keywords} onToggle={() => toggleSection("risk_keywords")} />
                  <ProfileSection
                    title="Topics" items={profile.topics.map(t => t.name)}
                    approved={approvedSections.topics} onToggle={() => toggleSection("topics")} />
                  <ProfileSection
                    title="Narratives" items={profile.narratives.map(n => `${n.name} (${Math.round(n.confidence * 100)}%)`)}
                    approved={approvedSections.narratives} onToggle={() => toggleSection("narratives")} />
                  <ProfileSection
                    title="People" items={profile.people.map(p => `${p.name}${p.title ? ` — ${p.title}` : ""} [${p.tier}]`)}
                    approved={approvedSections.people} onToggle={() => toggleSection("people")} icon={<User className="h-3.5 w-3.5" />} />
                  <ProfileSection
                    title="Sources" items={profile.sources.map(s => `${s.type}: ${s.reason}`)}
                    approved={approvedSections.sources} onToggle={() => toggleSection("sources")} icon={<Globe className="h-3.5 w-3.5" />} />
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Scan Schedule */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <Clock className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold text-card-foreground">Scan Schedule</h2>
              </div>
              <p className="text-sm text-muted-foreground">Choose how often SentiWatch scans for mentions.</p>

              <div className="space-y-3">
                {[
                  { value: "daily_9am", label: "Daily at 9:00 AM", desc: "Recommended for most organizations" },
                  { value: "every_12h", label: "Every 12 hours", desc: "Morning and evening scans" },
                  { value: "every_6h", label: "Every 6 hours", desc: "High-frequency monitoring" },
                  { value: "custom", label: "Custom cron", desc: "Advanced: specify your own schedule" },
                ].map(opt => (
                  <div key={opt.value}
                    className={`p-4 rounded-lg border cursor-pointer transition-colors ${scanSchedule === opt.value ? "border-primary bg-primary/5" : "border-border bg-muted/50 hover:border-muted-foreground/30"}`}
                    onClick={() => setScanSchedule(opt.value)}>
                    <div className="flex items-center gap-3">
                      <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${scanSchedule === opt.value ? "border-primary" : "border-muted-foreground/40"}`}>
                        {scanSchedule === opt.value && <div className="h-2 w-2 rounded-full bg-primary" />}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-card-foreground">{opt.label}</div>
                        <div className="text-xs text-muted-foreground">{opt.desc}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {scanSchedule === "custom" && (
                <div className="space-y-2">
                  <Label>Cron expression</Label>
                  <Input value={customCron} onChange={e => setCustomCron(e.target.value)} placeholder="0 9 * * *" className="bg-muted border-border font-mono" />
                  <p className="text-[10px] text-muted-foreground">Format: minute hour day-of-month month day-of-week</p>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Alerts */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <Bell className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold text-card-foreground">Alert Configuration</h2>
              </div>
              <p className="text-sm text-muted-foreground">Configure who receives alerts and escalation notifications.</p>

              <div className="space-y-2">
                <Label>Alert email recipients</Label>
                <Input value={alertEmails} onChange={e => setAlertEmails(e.target.value)}
                  placeholder="alerts@acme.com, security@acme.com" className="bg-muted border-border" />
                <p className="text-[10px] text-muted-foreground">Comma-separated. Receives emergency, spike, and breakout alerts.</p>
              </div>

              <div className="space-y-2">
                <Label>Escalation email recipients</Label>
                <Input value={escalationEmails} onChange={e => setEscalationEmails(e.target.value)}
                  placeholder="legal@acme.com, comms@acme.com" className="bg-muted border-border" />
                <p className="text-[10px] text-muted-foreground">Comma-separated. Receives escalation tickets from the strict response engine.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Quiet hours start</Label>
                  <Select value={quietStart} onValueChange={setQuietStart}>
                    <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>{String(i).padStart(2, "0")}:00</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Quiet hours end</Label>
                  <Select value={quietEnd} onValueChange={setQuietEnd}>
                    <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>{String(i).padStart(2, "0")}:00</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">Non-emergency alerts are suppressed during quiet hours.</p>
            </div>
          )}

          {/* STEP 5: Notification Preferences */}
          {step === 4 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <Mail className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold text-card-foreground">Email Notifications</h2>
              </div>
              <p className="text-sm text-muted-foreground">Choose which email notifications you'd like to receive. You can change these anytime in Settings.</p>

              <div className="space-y-1">
                <div className="flex items-center justify-between p-3 rounded-lg border border-primary/30 bg-primary/5">
                  <div>
                    <p className="text-sm font-medium text-card-foreground">Enable Email Notifications</p>
                    <p className="text-xs text-muted-foreground">Master toggle for all email alerts</p>
                  </div>
                  <Switch checked={notifPrefs.email_enabled} onCheckedChange={v => setNotifPrefs(p => ({ ...p, email_enabled: v }))} />
                </div>
              </div>

              <div className={`space-y-2 transition-opacity ${notifPrefs.email_enabled ? "" : "opacity-40 pointer-events-none"}`}>
                {([
                  { key: "critical_alerts", label: "Critical Alerts", desc: "Emergency-severity mentions detected" },
                  { key: "negative_spikes", label: "Negative Sentiment Spikes", desc: "Unusual increase in negative mentions" },
                  { key: "mention_spikes", label: "Mention Volume Spikes", desc: "Abnormal increase in total mentions" },
                  { key: "viral_risk", label: "Viral Risk Alerts", desc: "Content showing signs of going viral" },
                  { key: "escalation_assigned", label: "Escalation Assigned", desc: "When an escalation is assigned to you" },
                  { key: "escalation_updated", label: "Escalation Updates", desc: "Status changes on your escalations" },
                  { key: "new_scan_complete", label: "Scan Complete", desc: "When a scheduled scan finishes" },
                  { key: "weekly_digest", label: "Weekly Digest", desc: "Monday summary of trends and risks" },
                ] as { key: keyof typeof notifPrefs; label: string; desc: string }[]).map(item => (
                  <div key={item.key} className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-muted-foreground/30 transition-colors">
                    <div>
                      <p className="text-sm font-medium text-card-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                    <Switch checked={notifPrefs[item.key] as boolean} onCheckedChange={v => setNotifPrefs(p => ({ ...p, [item.key]: v }))} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Navigation buttons */}
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={step === 0}>
            <ArrowLeft className="h-4 w-4 mr-2" />Back
          </Button>
          {step < 4 ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={!canAdvance()}>
              Next<ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleFinish} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              {saving ? "Setting up..." : "Finish Setup"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileSection({ title, items, approved, onToggle, icon }: {
  title: string;
  items: string[];
  approved: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border p-4 transition-colors ${approved ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30 opacity-60"}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon || <Sparkles className="h-3.5 w-3.5 text-primary" />}
          <span className="text-sm font-medium text-card-foreground">{title}</span>
          <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{approved ? "Approved" : "Ignored"}</span>
          <Checkbox checked={approved} onCheckedChange={onToggle} />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.slice(0, 8).map((item, i) => (
          <Badge key={i} variant="outline" className="text-[10px] font-normal">{item}</Badge>
        ))}
        {items.length > 8 && <Badge variant="outline" className="text-[10px]">+{items.length - 8} more</Badge>}
      </div>
    </div>
  );
}
