import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import {
  Shield, BarChart3, AlertTriangle, Zap, Users, FileText, Menu, X,
  ArrowRight, CheckCircle2, TrendingDown, TrendingUp, Minus,
  Newspaper, Target, Brain, Siren, ChevronRight, Star, Globe, Lock,
} from "lucide-react";

const NAV_LINKS = [
  { to: "/features", label: "Features" },
  { to: "/pricing", label: "Pricing" },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Set up in minutes",
    desc: "Add your brand name, competitors, and risk keywords. Our AI profiles your organization and suggests what to monitor.",
    icon: Brain,
  },
  {
    step: "02",
    title: "Scan continuously",
    desc: "We crawl news, Reddit, forums, and social media. Every mention is analyzed for sentiment, severity, and narrative fit.",
    icon: Globe,
  },
  {
    step: "03",
    title: "See your narrative in real time",
    desc: "The dashboard shows your risk score, active narratives, and emerging threats the moment they appear.",
    icon: BarChart3,
  },
  {
    step: "04",
    title: "Respond with confidence",
    desc: "Generate fact-checked responses using your approved messaging. Coordinate teams in the War Room when crises hit.",
    icon: Zap,
  },
];

const FEATURES = [
  {
    icon: BarChart3,
    title: "Sentiment Analysis",
    description: "Every mention scored from -1 to +1. Spot narrative shifts the moment they start, not after they go viral.",
    badge: "Core",
  },
  {
    icon: AlertTriangle,
    title: "Threat Detection",
    description: "AI flags high and critical severity mentions instantly. Escalate to your team with one click.",
    badge: "Core",
  },
  {
    icon: Brain,
    title: "Narrative Intelligence",
    description: "Auto-detect and track the stories forming around your brand. Know which narratives you own — and which you don't.",
    badge: "AI",
  },
  {
    icon: Target,
    title: "Competitor Tracking",
    description: "Monitor what's being said about competitors. Find narrative gaps they own and claim them before they dominate.",
    badge: "Intelligence",
  },
  {
    icon: Zap,
    title: "Crisis Response",
    description: "War Room for real-time coordination. Pre-approved templates so your team responds fast and on-message.",
    badge: "Response",
  },
  {
    icon: Lock,
    title: "Compliance Ready",
    description: "Full audit trail, role-based access, and approved fact libraries for regulated industries.",
    badge: "Enterprise",
  },
  {
    icon: Siren,
    title: "Incident Management",
    description: "Timeline-tracked incidents with stakeholder alerts and post-incident reports — from detection to resolution.",
    badge: "Response",
  },
  {
    icon: Newspaper,
    title: "Briefing Mode",
    description: "One-page situation report. Risk gauge, active narratives, top threats — the complete picture at a glance.",
    badge: "New",
  },
];

const OUTCOMES = [
  "Know about a reputation threat before your CEO sees it on Twitter",
  "Respond to a crisis with pre-approved, fact-checked messaging in minutes",
  "See exactly what narrative your competitors are building — and get there first",
  "Turn raw mention data into a clear, shareable brief for your leadership team",
];

const BADGE_COLORS: Record<string, string> = {
  Core: "bg-primary/10 text-primary border-primary/20",
  AI: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Intelligence: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Response: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Enterprise: "bg-muted/60 text-muted-foreground",
  New: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

export default function Index() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => navigate("/")}>
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <span className="text-lg font-bold tracking-tight">SentiWatch</span>
          </div>

          <div className="hidden md:flex items-center gap-1">
            <ThemeSwitcher />
            {NAV_LINKS.map(l => (
              <Link key={l.to} to={l.to}>
                <Button variant="ghost" size="sm">{l.label}</Button>
              </Link>
            ))}
            <div className="w-px h-5 bg-border mx-1" />
            <Link to="/auth">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/auth?mode=signup">
              <Button size="sm" className="ml-1">Start free →</Button>
            </Link>
          </div>

          <div className="flex md:hidden items-center gap-2">
            <ThemeSwitcher />
            <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-card px-6 py-4 space-y-2 animate-fade-up">
            {NAV_LINKS.map(l => (
              <Link key={l.to} to={l.to} onClick={() => setMobileMenuOpen(false)}>
                <Button variant="ghost" size="sm" className="w-full justify-start">{l.label}</Button>
              </Link>
            ))}
            <div className="border-t border-border pt-2 space-y-2">
              <Link to="/auth" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="ghost" size="sm" className="w-full justify-start">Sign in</Button>
              </Link>
              <Link to="/auth?mode=signup" onClick={() => setMobileMenuOpen(false)}>
                <Button size="sm" className="w-full">Start free →</Button>
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3 pointer-events-none" />
        <div className="absolute top-20 -right-32 w-96 h-96 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 -left-20 w-64 h-64 rounded-full bg-primary/3 blur-2xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 py-20 sm:py-28 relative">
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-center mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
                <Shield className="h-3.5 w-3.5" />
                Reputation Intelligence Platform
              </div>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight leading-[1.1] text-center mb-6">
              Know what's being said about your brand{" "}
              <span className="text-primary">before it becomes a crisis</span>
            </h1>

            <p className="text-lg text-muted-foreground max-w-2xl mx-auto text-center leading-relaxed mb-8">
              SentiWatch monitors news, social media, and forums for your brand, competitors, and risk keywords.
              AI detects narratives forming in real time and helps you respond with confidence.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
              <Link to="/auth?mode=signup">
                <Button size="lg" className="text-base px-8 gap-2">
                  Start monitoring free <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/auth">
                <Button size="lg" variant="outline" className="text-base px-8">
                  Sign in to dashboard
                </Button>
              </Link>
            </div>

            {/* Outcome pills */}
            <div className="flex flex-wrap justify-center gap-2">
              {["Free to start", "No card required", "Works in minutes", "AI-powered"].map(p => (
                <span key={p} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded-full px-3 py-1 bg-card/50">
                  <CheckCircle2 className="h-3 w-3 text-primary" />{p}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── What you can do ──────────────────────────────────────────── */}
      <section className="border-b border-border bg-card/20">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest text-center mb-10">
            What SentiWatch gives you
          </p>
          <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
            {OUTCOMES.map(o => (
              <div key={o} className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/20 transition-colors">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <p className="text-sm text-foreground leading-relaxed">{o}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight mb-3">How it works</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              From setup to your first insight in under 5 minutes.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.step} className="relative">
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden lg:block absolute top-7 left-[calc(100%-1rem)] w-8 border-t border-dashed border-border z-0" />
                )}
                <div className="relative z-10 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <step.icon className="h-5 w-5 text-primary" />
                    </div>
                    <span className="text-2xl font-bold text-muted-foreground/40">{step.step}</span>
                  </div>
                  <h3 className="font-semibold text-foreground">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <section className="border-b border-border bg-card/20">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="text-center mb-14 space-y-3">
            <h2 className="text-3xl font-bold tracking-tight">Everything you need to control your narrative</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Built for comms teams, PR professionals, and brand managers who can't afford to be caught off-guard.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map(f => (
              <div
                key={f.title}
                className="group p-5 rounded-xl border border-border bg-card hover:border-primary/30 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/15 transition-colors">
                    <f.icon className="h-4 w-4 text-primary" />
                  </div>
                  <Badge variant="outline" className={`text-[10px] px-2 ${BADGE_COLORS[f.badge] || ""}`}>{f.badge}</Badge>
                </div>
                <h3 className="text-sm font-semibold">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Narrative Now preview block ──────────────────────────────── */}
      <section className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">Narrative Intelligence</Badge>
              <h2 className="text-3xl font-bold tracking-tight">
                See exactly what narrative is forming{" "}
                <span className="text-primary">right now</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Most monitoring tools tell you what happened. SentiWatch tells you what story is forming
                before it takes hold. AI clusters mentions into narratives, scores their momentum,
                and shows you the gap between what you're saying and what people believe.
              </p>
              <ul className="space-y-3">
                {[
                  "Active narratives with confidence scores",
                  "Narrative overlap with competitors",
                  "Gap analysis: topics you should own but don't",
                  "One-click response generation for each narrative",
                ].map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm text-foreground">
                    <ChevronRight className="h-4 w-4 text-primary shrink-0" />{item}
                  </li>
                ))}
              </ul>
              <Link to="/auth?mode=signup">
                <Button className="gap-2">See your narratives <ArrowRight className="h-4 w-4" /></Button>
              </Link>
            </div>

            {/* Mock narrative cards */}
            <div className="space-y-3">
              {[
                { name: "Product Safety Concerns", status: "watch", conf: 0.87, neg: true, mentions: 23 },
                { name: "Industry Leadership Position", status: "active", conf: 0.92, neg: false, mentions: 41 },
                { name: "Customer Service Quality", status: "active", conf: 0.74, neg: false, mentions: 17 },
                { name: "Data Privacy Transparency", status: "watch", conf: 0.61, neg: true, mentions: 8 },
              ].map(n => (
                <div key={n.name} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card">
                  <div className={`h-2 w-2 rounded-full shrink-0 ${n.neg ? "bg-destructive" : "bg-[hsl(var(--sentinel-emerald))]"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{n.name}</p>
                    <p className="text-xs text-muted-foreground">{n.mentions} mentions · {Math.round(n.conf * 100)}% confidence</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {n.neg
                      ? <TrendingDown className="h-4 w-4 text-destructive" />
                      : <TrendingUp className="h-4 w-4 text-[hsl(var(--sentinel-emerald))]" />
                    }
                    <Badge variant="outline" className={`text-[10px] ${n.status === "watch" ? "border-[hsl(var(--sentinel-amber))]/30 text-[hsl(var(--sentinel-amber))]" : "border-[hsl(var(--sentinel-emerald))]/30 text-[hsl(var(--sentinel-emerald))]"}`}>
                      {n.status}
                    </Badge>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground text-center pt-1">Sample data — your real narratives appear after first scan</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="border-b border-border bg-card/30">
        <div className="max-w-4xl mx-auto px-6 py-24 text-center space-y-6">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Ready to take control of your narrative?
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto text-lg">
            Start monitoring your brand in minutes. No setup fees, no card required.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
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
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-card/40">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">SentiWatch</span>
          </div>
          <div className="flex items-center gap-6">
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
