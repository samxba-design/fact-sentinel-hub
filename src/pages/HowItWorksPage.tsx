import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import {
  Shield, Scan, MessageSquareWarning, Brain, Zap, Target, BarChart3,
  AlertTriangle, Siren, Radio, BookCheck, FileText, Users, Bell,
  ArrowRight, ArrowLeft, ChevronRight, CheckCircle2, TrendingDown, TrendingUp,
  Minus, Menu, X, Play, Clock, Globe, Network, Settings, Key,
  ExternalLink, Lock, Newspaper, Eye,
} from "lucide-react";

/* ─── Section data ──────────────────────────────────────────────── */
const SECTIONS = [
  { id: "overview",    label: "Overview",          icon: Shield },
  { id: "setup",       label: "1. Setup",           icon: Settings },
  { id: "first-scan",  label: "2. First Scan",      icon: Scan },
  { id: "mentions",    label: "3. Mentions",        icon: MessageSquareWarning },
  { id: "narratives",  label: "4. Narratives",      icon: Brain },
  { id: "daily",       label: "5. Daily Workflow",  icon: Clock },
  { id: "respond",     label: "6. Respond",         icon: Zap },
  { id: "crisis",      label: "7. Crisis Mode",     icon: Siren },
  { id: "intel",       label: "8. Competitor Intel",icon: Target },
  { id: "team",        label: "9. Team & Governance",icon: Users },
];

/* ─── Mock UI components (visual "screenshots") ─────────────────── */
function MockDashboardCard() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-lg">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-destructive" />
        <div className="h-2 w-2 rounded-full bg-[hsl(var(--sentinel-amber))]" />
        <div className="h-2 w-2 rounded-full bg-[hsl(var(--sentinel-emerald))]" />
        <span className="text-xs text-muted-foreground ml-2 font-mono">SentiWatch — Dashboard</span>
      </div>
      <div className="p-4 grid grid-cols-3 gap-3 text-center">
        {[["247", "Mentions", "text-foreground"], ["18%", "Negative", "text-[hsl(var(--sentinel-amber))]"], ["3", "Critical", "text-destructive"]].map(([v, l, c]) => (
          <div key={l} className="p-3 rounded-lg bg-muted/40 border border-border">
            <div className={`text-xl font-bold ${c}`}>{v}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{l}</div>
          </div>
        ))}
      </div>
      <div className="px-4 pb-4 space-y-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Active Narratives</p>
        {[
          { name: "Product Safety Concerns", status: "watch", pct: 87 },
          { name: "Industry Leadership", status: "active", pct: 92 },
        ].map(n => (
          <div key={n.name} className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted/20">
            <div className={`h-1.5 w-1.5 rounded-full ${n.status === "watch" ? "bg-[hsl(var(--sentinel-amber))]" : "bg-[hsl(var(--sentinel-emerald))]"}`} />
            <span className="text-xs text-foreground flex-1 truncate">{n.name}</span>
            <span className="text-[10px] text-muted-foreground">{n.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockMentionCard() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-lg">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-destructive" />
        <div className="h-2 w-2 rounded-full bg-[hsl(var(--sentinel-amber))]" />
        <div className="h-2 w-2 rounded-full bg-[hsl(var(--sentinel-emerald))]" />
        <span className="text-xs text-muted-foreground ml-2 font-mono">Mention Detail</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary">R</span>
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-foreground">u/crypto_analyst</p>
            <p className="text-xs text-muted-foreground">Reddit · r/CryptoNews</p>
          </div>
          <Badge className="text-[9px] bg-destructive/10 text-destructive border-0">critical</Badge>
        </div>
        <p className="text-xs text-foreground leading-relaxed border-l-2 border-primary/30 pl-3">
          "Just saw reports about unusual activity on the exchange. Seeing this trend across multiple threads..."
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[["Negative", "-0.72", "text-destructive"], ["Critical", "Severity", "text-destructive"], ["High", "Reach", "text-[hsl(var(--sentinel-amber))]"]].map(([l, v, c]) => (
            <div key={l} className="p-2 rounded-lg bg-muted/40">
              <div className={`text-xs font-bold ${c}`}>{l}</div>
              <div className="text-[9px] text-muted-foreground">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MockScanCard() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-lg">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-destructive" />
        <div className="h-2 w-2 rounded-full bg-[hsl(var(--sentinel-amber))]" />
        <div className="h-2 w-2 rounded-full bg-[hsl(var(--sentinel-emerald))]" />
        <span className="text-xs text-muted-foreground ml-2 font-mono">Scans — Running</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <Scan className="h-4 w-4 text-primary animate-pulse" />
          <div className="flex-1">
            <p className="text-xs font-medium text-foreground">Auto-scan in progress</p>
            <p className="text-[10px] text-muted-foreground">Scanning news, Reddit, HackerNews…</p>
          </div>
        </div>
        <div className="space-y-1.5">
          {[
            { source: "Google News RSS", count: "41 results", done: true },
            { source: "Reddit",          count: "17 results", done: true },
            { source: "HackerNews",      count: "scanning…",  done: false },
            { source: "Bing News",       count: "queued",     done: false },
          ].map(s => (
            <div key={s.source} className="flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-1.5">
                {s.done
                  ? <CheckCircle2 className="h-3 w-3 text-[hsl(var(--sentinel-emerald))]" />
                  : <div className="h-3 w-3 rounded-full border border-muted-foreground/30 border-t-primary animate-spin" />
                }
                <span className="text-muted-foreground">{s.source}</span>
              </div>
              <span className={s.done ? "text-foreground" : "text-muted-foreground"}>{s.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MockResponseCard() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-lg">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-destructive" />
        <div className="h-2 w-2 rounded-full bg-[hsl(var(--sentinel-amber))]" />
        <div className="h-2 w-2 rounded-full bg-[hsl(var(--sentinel-emerald))]" />
        <span className="text-xs text-muted-foreground ml-2 font-mono">How To Respond</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="p-2.5 rounded-lg bg-muted/40 border border-border">
          <p className="text-[10px] text-muted-foreground font-medium mb-1">Detected claim</p>
          <p className="text-xs text-foreground">"Unusual withdrawal delays reported by multiple users"</p>
        </div>
        <div className="p-2.5 rounded-lg bg-[hsl(var(--sentinel-emerald))]/5 border border-[hsl(var(--sentinel-emerald))]/20">
          <p className="text-[10px] text-[hsl(var(--sentinel-emerald))] font-medium mb-1 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Approved response draft
          </p>
          <p className="text-xs text-foreground leading-relaxed">
            "We can confirm all withdrawals are processing normally. Our systems operate 24/7 with 99.9% uptime. [SOURCE: Official Status Page]"
          </p>
        </div>
        <div className="text-[9px] text-muted-foreground">Facts used: Uptime SLA Statement · System Status Policy</div>
      </div>
    </div>
  );
}

function MockBriefingCard() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-lg">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-destructive" />
        <div className="h-2 w-2 rounded-full bg-[hsl(var(--sentinel-amber))]" />
        <div className="h-2 w-2 rounded-full bg-[hsl(var(--sentinel-emerald))]" />
        <span className="text-xs text-muted-foreground ml-2 font-mono">Briefing Mode</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-foreground">Risk Score</p>
            <p className="text-[10px] text-muted-foreground">Last 24 hours</p>
          </div>
          <div className="text-3xl font-bold text-[hsl(var(--sentinel-emerald))]">24</div>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full w-1/4 bg-[hsl(var(--sentinel-emerald))] rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[["2 Active", "Narratives", "text-primary"], ["0 Critical", "Threats", "text-[hsl(var(--sentinel-emerald))]"]].map(([v, l, c]) => (
            <div key={l} className="p-2 rounded-lg bg-muted/40 text-center">
              <div className={`text-xs font-bold ${c}`}>{v}</div>
              <div className="text-[9px] text-muted-foreground">{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Step block ─────────────────────────────────────────────────── */
function Step({ number, title, desc }: { number: number; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-4">
      <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-xs font-bold text-primary">{number}</span>
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

/* ─── Section wrapper ────────────────────────────────────────────── */
function Section({
  id, icon: Icon, color, badge, headline, sub, children, visual, reverse = false,
}: {
  id: string; icon: any; color: string; badge: string; headline: string; sub: string;
  children: React.ReactNode; visual: React.ReactNode; reverse?: boolean;
}) {
  return (
    <section id={id} className="scroll-mt-16 py-16 border-b border-border last:border-0">
      <div className="max-w-6xl mx-auto px-6">
        <div className={`grid lg:grid-cols-2 gap-12 items-center ${reverse ? "lg:[&>*:first-child]:order-last" : ""}`}>
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl shrink-0" style={{ backgroundColor: color + "18" }}>
                <Icon className="h-5 w-5" style={{ color }} />
              </div>
              <Badge variant="outline" className="text-xs" style={{ borderColor: color + "40", color }}>
                {badge}
              </Badge>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground leading-tight">{headline}</h2>
              <p className="text-base text-muted-foreground leading-relaxed">{sub}</p>
            </div>
            <div className="space-y-4">{children}</div>
          </div>
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl blur-2xl opacity-20" style={{ background: color }} />
            <div className="relative">{visual}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Main component ─────────────────────────────────────────────── */
export default function HowItWorksPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveSection(e.target.id);
        }
      },
      { rootMargin: "-30% 0px -60% 0px" }
    );
    SECTIONS.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observerRef.current?.observe(el);
    });
    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Sticky nav ── */}
      <header className="sticky top-0 z-40 bg-card/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="p-1 rounded-lg bg-primary/10">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-bold tracking-tight hidden sm:block">SentiWatch</span>
          </Link>

          {/* Section nav — desktop */}
          <nav className="hidden lg:flex items-center gap-0.5 overflow-x-auto">
            {SECTIONS.map(s => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => setActiveSection(s.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activeSection === s.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <s.icon className="h-3 w-3" />
                {s.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeSwitcher />
            {user ? (
              <Button size="sm" onClick={() => navigate("/")} className="gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" /> Dashboard
              </Button>
            ) : (
              <div className="flex gap-1.5">
                <Link to="/auth">
                  <Button variant="ghost" size="sm">Sign in</Button>
                </Link>
                <Link to="/auth?mode=signup">
                  <Button size="sm">Start free</Button>
                </Link>
              </div>
            )}
            <button
              className="lg:hidden p-1.5 rounded-lg hover:bg-muted/50"
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
            >
              {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile section nav */}
        {mobileNavOpen && (
          <div className="lg:hidden border-t border-border bg-card/95 px-4 py-3 grid grid-cols-2 gap-1">
            {SECTIONS.map(s => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => { setActiveSection(s.id); setMobileNavOpen(false); }}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  activeSection === s.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <s.icon className="h-3 w-3" />{s.label}
              </a>
            ))}
          </div>
        )}
      </header>

      {/* ── Hero ── */}
      <section id="overview" className="scroll-mt-14 relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-primary/4 pointer-events-none" />
        <div className="max-w-6xl mx-auto px-6 py-20 sm:py-28 text-center relative">
          <div className="mb-6">
            <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" /> Back to senti.watch
            </Link>
          </div>
          <Badge variant="outline" className="bg-primary/8 text-primary border-primary/20 text-xs mb-6 gap-1.5 px-3 py-1">
            <Play className="h-3 w-3" /> Full platform walkthrough
          </Badge>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
            From setup to{" "}
            <span className="text-primary">reputation control</span>
            <br />in under 5 minutes
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10">
            A complete visual walkthrough of how SentiWatch monitors your brand,
            detects threats, surfaces narratives, and helps you respond —
            step by step, from day one.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
            {user ? (
              <Button size="lg" onClick={() => navigate("/")} className="text-base px-8 gap-2">
                <BarChart3 className="h-4 w-4" /> Go to your dashboard
              </Button>
            ) : (
              <>
                <Link to="/auth?mode=signup">
                  <Button size="lg" className="text-base px-8 gap-2">
                    Start free <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/auth">
                  <Button size="lg" variant="outline" className="text-base px-8">Sign in</Button>
                </Link>
              </>
            )}
          </div>

          {/* Flow diagram */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 max-w-4xl mx-auto">
            {[
              { icon: Settings, label: "Setup", color: "hsl(var(--primary))" },
              { icon: Scan, label: "Scan", color: "hsl(142,71%,45%)" },
              { icon: Brain, label: "Detect", color: "hsl(262,83%,58%)" },
              { icon: MessageSquareWarning, label: "Triage", color: "hsl(38,92%,50%)" },
              { icon: Zap, label: "Respond", color: "hsl(0,84%,60%)" },
            ].map((step, i) => (
              <div key={step.label} className="flex items-center gap-2 sm:gap-3">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="h-12 w-12 rounded-xl border border-border bg-card flex items-center justify-center shadow-sm">
                    <step.icon className="h-5 w-5" style={{ color: step.color }} />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">{step.label}</span>
                </div>
                {i < 4 && <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 mb-4" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Step 1: Setup ── */}
      <Section
        id="setup"
        icon={Settings}
        color="hsl(var(--primary))"
        badge="Step 1 — Setup (5 min)"
        headline="Configure your brand profile in minutes"
        sub="SentiWatch's AI onboarding reads your company domain and auto-suggests keywords, competitors, key people, and risk topics. You review and confirm — no manual research needed."
        visual={
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-lg">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-destructive" /><div className="h-2 w-2 rounded-full bg-[hsl(var(--sentinel-amber))]" /><div className="h-2 w-2 rounded-full bg-[hsl(var(--sentinel-emerald))]" />
              <span className="text-xs text-muted-foreground ml-2 font-mono">Onboarding — AI Profile</span>
            </div>
            <div className="p-4 space-y-3">
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/15">
                <p className="text-[10px] font-semibold text-primary mb-2">AI-suggested keywords</p>
                <div className="flex flex-wrap gap-1.5">
                  {["Binance", "BNB", "BUSD", "CZ", "exchange security", "withdrawal", "hack", "SEC", "regulatory"].map(kw => (
                    <span key={kw} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{kw}</span>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Suggested sources</p>
                {[
                  { src: "Google News", reason: "Breaking news coverage", on: true },
                  { src: "Reddit", reason: "r/CryptoCurrency, r/Binance", on: true },
                  { src: "HackerNews", reason: "Tech community discussion", on: true },
                  { src: "Twitter/X", reason: "Requires API key", on: false },
                ].map(s => (
                  <div key={s.src} className="flex items-center justify-between text-[10px]">
                    <div>
                      <span className="text-foreground font-medium">{s.src}</span>
                      <span className="text-muted-foreground ml-1.5">— {s.reason}</span>
                    </div>
                    <div className={`h-4 w-7 rounded-full flex items-center px-0.5 ${s.on ? "bg-[hsl(var(--sentinel-emerald))]/30 justify-end" : "bg-muted justify-start"}`}>
                      <div className={`h-3 w-3 rounded-full ${s.on ? "bg-[hsl(var(--sentinel-emerald))]" : "bg-muted-foreground/40"}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        }
      >
        <Step number={1} title="Sign up and enter your organization name" desc="SentiWatch reads your domain and industry to understand your context before asking any questions." />
        <Step number={2} title="Review AI-generated keyword suggestions" desc="Brand names, product names, key people, risk terms, and competitor names are auto-detected. Add or remove with one click." />
        <Step number={3} title="Enable sources" desc="Free sources (Google News, Reddit, HackerNews, Bing News) work immediately. Add API keys for Twitter/X, YouTube, or custom webhooks." />
        <Step number={4} title="Configure alerts" desc="Set severity thresholds, notification emails, and quiet hours. You'll only be alerted when it actually matters." />
        <div className="flex flex-wrap gap-2 pt-2">
          {["Brand keywords", "Risk keywords", "Competitor keywords (separate)", "Key people tracking", "Source selection", "Alert thresholds"].map(f => (
            <span key={f} className="inline-flex items-center gap-1 text-[11px] text-primary bg-primary/8 border border-primary/15 rounded-full px-2.5 py-1">
              <CheckCircle2 className="h-3 w-3" />{f}
            </span>
          ))}
        </div>
      </Section>

      {/* ── Step 2: First Scan ── */}
      <Section
        id="first-scan"
        icon={Scan}
        color="hsl(142,71%,45%)"
        badge="Step 2 — First Scan"
        headline="Hit scan. Get results in 30–90 seconds."
        sub="Auto-scan crawls all enabled sources simultaneously. Free sources run in parallel — no API keys required to get started. You'll see mentions flowing in with AI analysis applied to each one."
        visual={<MockScanCard />}
        reverse
      >
        <Step number={1} title="Click Auto-Scan on the Scans page" desc="All your brand/risk/product keywords are passed to every enabled source at once." />
        <Step number={2} title="Watch sources run in parallel" desc="Google News RSS, Bing News, Reddit public API, and HackerNews Algolia all scan simultaneously. Takes 30–90 seconds." />
        <Step number={3} title="AI analysis runs on every result" desc="Each mention is scored for sentiment (-1 to +1), classified by severity (low/medium/high/critical), and checked for flags like misinformation or coordinated behaviour." />
        <Step number={4} title="Narratives are auto-detected" desc="After mentions are saved, the AI clusters related mentions into narrative threads automatically. No manual tagging needed." />
        <div className="p-3 rounded-xl bg-muted/40 border border-border">
          <p className="text-xs font-semibold text-foreground mb-2">Sources included in auto-scan</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {["Google News RSS (free)", "Bing News RSS (free)", "Reddit public API (free)", "HackerNews Algolia (free)", "Brave Search (API key)", "NewsAPI (API key)", "Twitter/X (API key)", "YouTube (API key)"].map(s => (
              <div key={s} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 text-[hsl(var(--sentinel-emerald))] shrink-0" />{s}
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Step 3: Mentions ── */}
      <Section
        id="mentions"
        icon={MessageSquareWarning}
        color="hsl(38,92%,50%)"
        badge="Step 3 — Mentions"
        headline="Every mention, enriched and actionable"
        sub="The Mentions page is your triage center. Every detected mention is scored, flagged, and ready to act on — ignore the noise, escalate the threats, respond to what matters."
        visual={<MockMentionCard />}
      >
        <Step number={1} title="Filter by severity and sentiment" desc="Start with Critical and High severity. These are the mentions that could turn into real problems." />
        <Step number={2} title="Review AI-enriched content" desc="Each mention shows a clean AI summary, sentiment score with confidence, author reach, source credibility, and any detected flags (misinformation, coordinated, bot-like)." />
        <Step number={3} title="Take action" desc="Ignore (not relevant), Snooze (revisit later), Resolve (handled), or Escalate (needs team attention). Bulk-select for high-volume triage." />
        <Step number={4} title="Drill into detail" desc="Click any mention for full context: raw content, AI analysis, linked narratives, author profile, related mentions, and one-click response drafting." />
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Ignore", desc: "Not relevant to brand" },
            { label: "Snooze", desc: "Revisit in 24h/48h/7d" },
            { label: "Escalate", desc: "Create a ticket" },
            { label: "Respond", desc: "Draft fact-checked reply" },
          ].map(a => (
            <div key={a.label} className="p-2.5 rounded-lg border border-border bg-card">
              <p className="text-xs font-semibold text-foreground">{a.label}</p>
              <p className="text-[10px] text-muted-foreground">{a.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Step 4: Narratives ── */}
      <Section
        id="narratives"
        icon={Brain}
        color="hsl(262,83%,58%)"
        badge="Step 4 — Narrative Intelligence"
        headline="Understand the story forming around your brand"
        sub="Individual mentions are noise. Narratives are the signal. SentiWatch groups related mentions into narrative threads — showing you what people actually believe about your brand, how confident the AI is, and what's driving each narrative."
        visual={
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-lg">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-destructive" /><div className="h-2 w-2 rounded-full bg-[hsl(var(--sentinel-amber))]" /><div className="h-2 w-2 rounded-full bg-[hsl(var(--sentinel-emerald))]" />
              <span className="text-xs text-muted-foreground ml-2 font-mono">Narratives</span>
            </div>
            <div className="p-4 space-y-2.5">
              {[
                { name: "Withdrawal Processing Concerns", status: "watch", conf: 0.91, mentions: 34, trend: "up" },
                { name: "Industry Leadership Recognition", status: "active", conf: 0.87, mentions: 21, trend: "up" },
                { name: "Regulatory Compliance Track Record", status: "active", conf: 0.78, mentions: 15, trend: "neutral" },
                { name: "Customer Support Response Time", status: "watch", conf: 0.65, mentions: 9, trend: "down" },
              ].map(n => (
                <div key={n.name} className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border hover:border-primary/20 transition-colors">
                  <div className={`h-2 w-2 rounded-full mt-1 shrink-0 ${n.status === "watch" ? "bg-[hsl(var(--sentinel-amber))]" : "bg-[hsl(var(--sentinel-emerald))]"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{n.name}</p>
                    <p className="text-[10px] text-muted-foreground">{n.mentions} mentions · {Math.round(n.conf * 100)}% confidence</p>
                  </div>
                  {n.trend === "up" && <TrendingUp className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />}
                  {n.trend === "down" && <TrendingDown className="h-3.5 w-3.5 text-[hsl(var(--sentinel-emerald))] shrink-0 mt-0.5" />}
                  {n.trend === "neutral" && <Minus className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />}
                </div>
              ))}
            </div>
          </div>
        }
        reverse
      >
        <Step number={1} title="Narratives are auto-detected during every scan" desc="The AI groups related mentions by topic and language patterns, creating a named narrative thread with example phrases." />
        <Step number={2} title="Track momentum and confidence" desc="Each narrative has a confidence score (how certain the AI is) and a trend direction — is this narrative growing or fading?" />
        <Step number={3} title="Distinguish your narratives from competitor narratives" desc="Brand narratives and competitor narratives are stored separately. Your risk score only reflects what's being said about you." />
        <Step number={4} title="Use Narrative Gap Analysis" desc="See which narratives your competitors own that you don't. These are opportunities to establish your position before they dominate the topic." />
      </Section>

      {/* ── Step 5: Daily Workflow ── */}
      <Section
        id="daily"
        icon={Clock}
        color="hsl(190,90%,50%)"
        badge="Step 5 — Daily Workflow"
        headline="Your brand's morning briefing, automated"
        sub="SentiWatch is designed for a daily 5-minute check-in workflow. The Briefing Mode gives you everything you need to understand your current reputation status and present it to leadership — without opening a spreadsheet."
        visual={<MockBriefingCard />}
      >
        <div className="space-y-3">
          {[
            { time: "Morning", action: "Open Briefing Mode", desc: "Risk gauge, active narratives, top threats — the full picture in one page. Copy it into Slack or your standup doc." },
            { time: "Throughout day", action: "Alert notifications", desc: "Critical and high-severity mentions trigger email alerts. You only hear from SentiWatch when something actually matters." },
            { time: "Weekly", action: "Trend review", desc: "Check the sentiment timeline and narrative health trends. Are things improving? Which narratives are gaining traction?" },
            { time: "On demand", action: "Run targeted scans", desc: "Something happened in the news? Run a custom scan with specific keywords and a narrow date range to get immediate intel." },
          ].map(d => (
            <div key={d.time} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card">
              <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">{d.time}</Badge>
              <div>
                <p className="text-xs font-semibold text-foreground">{d.action}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{d.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Step 6: Respond ── */}
      <Section
        id="respond"
        icon={Zap}
        color="hsl(0,84%,60%)"
        badge="Step 6 — Respond"
        headline="Draft fact-checked responses in seconds"
        sub="The response engine is strictly governed — it can only use your Approved Facts library. No hallucination. No off-brand messaging. If a required fact doesn't exist, it creates an escalation ticket automatically."
        visual={<MockResponseCard />}
        reverse
      >
        <Step number={1} title="Build your Approved Facts library" desc="Add company statements, policy positions, product specs, and regulatory filings. These are the only facts the AI can use when drafting responses." />
        <Step number={2} title="Create response templates" desc="Pre-approve templates for common scenarios: denial of false claims, support during outages, regulatory enquiries. Set tone and platform per template." />
        <Step number={3} title="Paste the post you need to respond to" desc="Or link directly from a mention. The engine extracts the specific claim being made before drafting." />
        <Step number={4} title="Get a fact-checked draft instantly" desc="The AI matches the claim to your approved facts, cites which facts it used, and generates a platform-appropriate response. You review and post." />
        <div className="p-3 rounded-xl border border-[hsl(var(--sentinel-emerald))]/20 bg-[hsl(var(--sentinel-emerald))]/5">
          <p className="text-xs font-semibold text-[hsl(var(--sentinel-emerald))] mb-1">Why this matters for compliance</p>
          <p className="text-xs text-muted-foreground leading-relaxed">Every response is traceable to specific approved statements. Full audit trail for regulatory review. No team member can inadvertently go off-script.</p>
        </div>
      </Section>

      {/* ── Step 7: Crisis Mode ── */}
      <Section
        id="crisis"
        icon={Siren}
        color="hsl(0,84%,60%)"
        badge="Step 7 — Crisis Management"
        headline="When it escalates: Incidents & War Room"
        sub="When a narrative becomes a crisis, you need more than monitoring — you need coordination. SentiWatch's Incident system and War Room give your team a single space to work the problem."
        visual={
          <div className="rounded-xl border border-destructive/20 bg-card overflow-hidden shadow-lg">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" /><div className="h-2 w-2 rounded-full bg-[hsl(var(--sentinel-amber))]" /><div className="h-2 w-2 rounded-full bg-[hsl(var(--sentinel-emerald))]" />
              <span className="text-xs text-muted-foreground ml-2 font-mono">War Room — ACTIVE</span>
              <Radio className="h-3 w-3 text-destructive animate-pulse ml-auto" />
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/8 border border-destructive/15">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-foreground">Incident: Exchange Outage Reports</p>
                  <p className="text-[10px] text-muted-foreground">Status: Active · 3 team members · Started 14 min ago</p>
                </div>
              </div>
              <div className="space-y-2">
                {[
                  { user: "Sarah K.", msg: "47 new Reddit mentions in the last 10 min. Sentiment -0.81 avg.", time: "2m" },
                  { user: "James L.", msg: "Drafted response using approved uptime SLA fact. Ready to post.", time: "5m" },
                  { user: "System", msg: "3 critical mentions auto-escalated to this incident.", time: "8m" },
                ].map(m => (
                  <div key={m.user} className="text-[10px]">
                    <span className="font-medium text-foreground">{m.user}</span>
                    <span className="text-muted-foreground ml-1">· {m.time} ago</span>
                    <p className="text-muted-foreground mt-0.5 pl-0">{m.msg}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        }
      >
        <Step number={1} title="Create an Incident" desc="When a situation escalates beyond routine monitoring, create an incident record. Link the relevant mentions and narratives to consolidate everything." />
        <Step number={2} title="Activate Incident Mode on the dashboard" desc="Increases scan frequency, prioritises critical alerts, and activates the red status indicator across the platform." />
        <Step number={3} title="Open the War Room" desc="A real-time coordination space — all team members see the same live feed of incoming mentions, can message each other, and track decisions." />
        <Step number={4} title="Auto-generate post-incident report" desc="When the incident is resolved, SentiWatch generates a full timeline report: what happened, when, what actions were taken, and what facts were used in responses." />
      </Section>

      {/* ── Step 8: Competitor Intel ── */}
      <Section
        id="intel"
        icon={Target}
        color="hsl(320,70%,55%)"
        badge="Step 8 — Competitor Intelligence"
        headline="Know their narrative before they own it"
        sub="Competitor data is always completely separate from your brand health metrics. Competitor scans, mentions, and narratives never touch your risk score or sentiment analysis."
        visual={
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-lg">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-destructive" /><div className="h-2 w-2 rounded-full bg-[hsl(var(--sentinel-amber))]" /><div className="h-2 w-2 rounded-full bg-[hsl(var(--sentinel-emerald))]" />
              <span className="text-xs text-muted-foreground ml-2 font-mono">Competitor Intel Feed</span>
            </div>
            <div className="p-4 space-y-2.5">
              {[
                { comp: "Coinbase", color: "#3b82f6", text: "SEC filing raises questions about custody model — 31 Reddit threads active", sentiment: "neg", time: "12m ago" },
                { comp: "Kraken", color: "#8b5cf6", text: "Positive coverage: praised for transparent reserves proof in Bloomberg", sentiment: "pos", time: "1h ago" },
                { comp: "OKX", color: "#06b6d4", text: "User complaints about KYC delays trending on Twitter", sentiment: "neg", time: "2h ago" },
              ].map(m => (
                <div key={m.comp} className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 mt-0.5" style={{ background: m.color + "20", color: m.color, border: `1px solid ${m.color}40` }}>{m.comp}</span>
                  <p className="text-[10px] text-foreground flex-1 leading-relaxed">{m.text}</p>
                  {m.sentiment === "neg" ? <TrendingDown className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" /> : <TrendingUp className="h-3.5 w-3.5 text-[hsl(var(--sentinel-emerald))] shrink-0 mt-0.5" />}
                </div>
              ))}
            </div>
          </div>
        }
        reverse
      >
        <Step number={1} title="Add competitor keywords" desc="Competitor-type keywords are tracked separately. Scanning them never affects your brand risk score or narrative health." />
        <Step number={2} title="Intel Feed: everything in real time" desc="A unified chronological feed of all competitor mentions — color-coded by competitor, with sentiment indicators, source badges, and full text." />
        <Step number={3} title="Narrative Gap Analysis" desc="See which narratives competitors own that your brand doesn't. These gaps are opportunities: claim the narrative before they dominate it." />
        <Step number={4} title="Threat Matrix and Benchmark" desc="Plot competitors by mention volume vs negativity. The top-right quadrant needs your attention. Benchmark sentiment and volume trends side by side." />
      </Section>

      {/* ── Step 9: Team & Governance ── */}
      <Section
        id="team"
        icon={Users}
        color="hsl(38,92%,50%)"
        badge="Step 9 — Team & Governance"
        headline="Built for regulated, compliance-conscious teams"
        sub="SentiWatch is designed for teams that can't afford to get it wrong. Role-based access, full audit trails, approved fact libraries, and escalation workflows give your compliance and legal teams the controls they need."
        visual={
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-lg">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-destructive" /><div className="h-2 w-2 rounded-full bg-[hsl(var(--sentinel-amber))]" /><div className="h-2 w-2 rounded-full bg-[hsl(var(--sentinel-emerald))]" />
              <span className="text-xs text-muted-foreground ml-2 font-mono">Team Roles</span>
            </div>
            <div className="p-4 space-y-2">
              {[
                { role: "Owner", perms: "Full access, billing, delete org", color: "text-destructive" },
                { role: "Manager", perms: "Manage members, all content", color: "text-[hsl(var(--sentinel-amber))]" },
                { role: "Editor", perms: "Create/edit all content, run scans", color: "text-primary" },
                { role: "Writer", perms: "Create content, read all", color: "text-[hsl(var(--sentinel-emerald))]" },
                { role: "Viewer", perms: "Read-only access", color: "text-muted-foreground" },
              ].map(r => (
                <div key={r.role} className="flex items-center gap-3">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className={`text-xs font-semibold w-16 shrink-0 ${r.color}`}>{r.role}</span>
                  <span className="text-[10px] text-muted-foreground">{r.perms}</span>
                </div>
              ))}
            </div>
          </div>
        }
      >
        <Step number={1} title="Role-based access control" desc="Owner, Manager, Editor, Writer, and Viewer roles. Each team member only sees and can do what their role allows." />
        <Step number={2} title="Approved Facts library" desc="All response facts must be approved and marked Active before the AI can use them. Under Review facts are completely excluded." />
        <Step number={3} title="Escalation workflows" desc="Auto-create tickets when a response requires facts that don't exist. Route to the right department. Track status from open → in progress → resolved." />
        <Step number={4} title="Full audit trail" desc="Every action — scan, response draft, mention status change, escalation — is logged with user, timestamp, and context. Ready for regulatory review." />
        <div className="flex flex-wrap gap-2 pt-2">
          {["SOC2-ready audit log", "Per-user action history", "Response fact citations", "Escalation paper trail", "Role change history"].map(f => (
            <span key={f} className="inline-flex items-center gap-1 text-[11px] text-[hsl(var(--sentinel-amber))] bg-[hsl(var(--sentinel-amber))]/8 border border-[hsl(var(--sentinel-amber))]/20 rounded-full px-2.5 py-1">
              <CheckCircle2 className="h-3 w-3" />{f}
            </span>
          ))}
        </div>
      </Section>

      {/* ── Final CTA ── */}
      <section className="border-t border-border bg-card/30">
        <div className="max-w-4xl mx-auto px-6 py-24 text-center space-y-6">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Ready to take control of your narrative?</h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Start monitoring your brand in minutes. Free sources, no card required, first results in under 2 minutes.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {user ? (
              <Button size="lg" onClick={() => navigate("/")} className="text-base px-10 gap-2">
                <BarChart3 className="h-4 w-4" /> Back to dashboard
              </Button>
            ) : (
              <>
                <Link to="/auth?mode=signup">
                  <Button size="lg" className="text-base px-10 gap-2">
                    Start free <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/contact">
                  <Button size="lg" variant="outline" className="text-base px-10">
                    Request enterprise demo
                  </Button>
                </Link>
              </>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground pt-2">
            {["No credit card required", "Free sources included", "First scan in 2 min", "AI-powered analysis"].map(p => (
              <span key={p} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />{p}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border bg-card/40">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">SentiWatch</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
            <Link to="/features" className="hover:text-foreground transition-colors">Features</Link>
            <Link to="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link>
          </div>
          <p>© {new Date().getFullYear()} SentiWatch</p>
        </div>
      </footer>
    </div>
  );
}
