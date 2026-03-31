import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import {
  Shield, BarChart3, AlertTriangle, Zap, Users, FileText, Search, MessageCircleReply,
  Network, Siren, Eye, Globe, Bot, Flame, Hash, TicketCheck, ClipboardList,
  ArrowRight, Scan, Lock, Bell, TrendingUp, Layers, CheckCircle2
} from "lucide-react";

const sections = [
  {
    id: "scanning",
    icon: Scan,
    title: "Automated Scanning",
    subtitle: "Monitor every corner of the internet",
    description: "SentiWatch continuously scans social media, news sites, forums, review platforms, and the broader web for mentions of your brand, products, and key personnel. Scans run on your schedule or on-demand.",
    highlights: [
      "Multi-source scanning: Twitter/X, Reddit, YouTube, Google Reviews, web articles",
      "Custom keyword tracking with brand terms, competitor names, and industry phrases",
      "Scheduled scans or one-click manual runs",
      "Scan history with run-by-run comparison metrics",
    ],
  },
  {
    id: "mentions",
    icon: Eye,
    title: "Mention Intelligence",
    subtitle: "Every mention, analyzed and actionable",
    description: "Each mention captured by SentiWatch is automatically enriched with AI-powered sentiment analysis, severity scoring, engagement metrics, and content extraction. Filter, sort, and drill into any mention for full context.",
    highlights: [
      "AI-generated summaries replace raw scraped text for clarity",
      "Sentiment scoring with confidence levels (positive, negative, neutral, mixed)",
      "Severity classification: low → critical with visual indicators",
      "Author profiling with reach/follower metrics and verification status",
      "Source intelligence panel with domain credibility insights",
      "Bulk actions: ignore, snooze, resolve, escalate, or delete mentions",
    ],
  },
  {
    id: "narratives",
    icon: Network,
    title: "Narrative Tracking",
    subtitle: "See the stories forming around your brand",
    description: "Mentions don't exist in isolation — they form narratives. SentiWatch clusters related mentions into narrative threads so you can track how stories evolve, spread across platforms, and assess their threat level.",
    highlights: [
      "AI-powered narrative clustering from mention patterns",
      "Confidence scoring for each identified narrative",
      "Trigger phrase detection — the exact language driving the narrative",
      "Status tracking: Active, Watch, Resolved, Archived",
      "Direct links between narratives and their source mentions",
    ],
  },
  {
    id: "risk",
    icon: AlertTriangle,
    title: "Risk Console",
    subtitle: "Your real-time threat dashboard",
    description: "The Risk Console provides an at-a-glance view of your organization's reputation health. See active threats, sentiment trends, coordinated attack warnings, and severity breakdowns — all updated in real time.",
    highlights: [
      "Live threat feed with severity and sentiment indicators",
      "Coordinated FUD detection across multiple sources",
      "Sentiment sparklines showing trends over time",
      "Narrative health scoring with propagation tracking",
    ],
  },
  {
    id: "people",
    icon: Users,
    title: "People Intelligence",
    subtitle: "Know who's talking about you",
    description: "Track key individuals — journalists, influencers, critics, or allies — who repeatedly appear in your mention stream. Build profiles with social handles, reach data, and link them to specific mentions and narratives.",
    highlights: [
      "Auto-detected from mention authors or manually added",
      "Cross-platform handle tracking (Twitter, Reddit, YouTube, etc.)",
      "Tiered classification: Key Influencer, Journalist, Critic, Ally",
      "Monitoring notes for internal context and evidence",
      "Direct links to all related mentions",
    ],
  },
  {
    id: "respond",
    icon: MessageCircleReply,
    title: "AI Response Drafting",
    subtitle: "Respond faster with fact-checked messaging",
    description: "When a mention requires a response, SentiWatch's AI drafts platform-appropriate replies grounded in your approved facts and messaging templates. Every response is traceable back to verified company positions.",
    highlights: [
      "AI-generated drafts based on your approved fact library",
      "Template-guided responses for consistent brand voice",
      "Claim extraction identifies what's being said so you address the right points",
      "One-click escalation if a response needs team review",
    ],
  },
  {
    id: "incidents",
    icon: Siren,
    title: "Incident Management",
    subtitle: "Coordinate crisis response in one place",
    description: "When individual mentions escalate into a larger crisis, create an incident to coordinate your team's response. Track timeline events, link related mentions and narratives, assign stakeholders, and generate post-incident reports.",
    highlights: [
      "Incident timeline with event logging",
      "Link mentions, narratives, and people to incidents",
      "Stakeholder assignment and notification",
      "Status tracking: Monitoring → Active → Contained → Resolved",
    ],
  },
  {
    id: "escalations",
    icon: TicketCheck,
    title: "Escalation Workflows",
    subtitle: "Route issues to the right people",
    description: "Not every mention needs the same level of attention. SentiWatch's escalation system lets you create tickets, assign them to team members or departments, track priority levels, and add internal comments.",
    highlights: [
      "Priority levels: Low, Medium, High, Critical",
      "Department routing for cross-team coordination",
      "Internal comment threads for discussion",
      "Link escalations to specific mentions and narratives",
    ],
  },
  {
    id: "governance",
    icon: Lock,
    title: "Governance & Compliance",
    subtitle: "Approved facts, templates, and audit trails",
    description: "Maintain a library of verified company facts and pre-approved response templates. Every action in SentiWatch is logged in a full audit trail for compliance and accountability.",
    highlights: [
      "Approved fact library with versioning and review dates",
      "Response templates with tone, platform, and scenario matching",
      "Full audit log of all user actions",
      "Role-based access control: Owner, Admin, Analyst, Approver, Viewer",
    ],
  },
  {
    id: "exports",
    icon: FileText,
    title: "Reporting & Exports",
    subtitle: "Share insights with stakeholders",
    description: "Generate reports, export data to Google Sheets, and keep your broader team informed with scheduled weekly digests and real-time notification preferences.",
    highlights: [
      "AI-generated reports with executive summaries",
      "Google Sheets integration for live data exports",
      "Weekly digest emails with key metrics",
      "Customizable notification preferences per user",
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <span className="text-lg font-bold tracking-tight">SentiWatch</span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeSwitcher />
            <Link to="/auth">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/contact">
              <Button size="sm">Request demo</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="max-w-6xl mx-auto px-6 py-20 relative">
          <div className="max-w-3xl mx-auto text-center space-y-5">
            <Badge variant="outline" className="text-xs border-primary/30 text-primary">
              <Layers className="h-3 w-3 mr-1" /> Platform Overview
            </Badge>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1]">
              Everything you need to{" "}
              <span className="text-primary">protect your reputation</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              A comprehensive walkthrough of every feature in SentiWatch — from automated scanning to crisis management.
            </p>
          </div>
        </div>
      </section>

      {/* Quick nav */}
      <section className="border-y border-border bg-card/30">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex flex-wrap gap-2 justify-center">
            {sections.map(s => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-card text-xs font-medium text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors"
              >
                <s.icon className="h-3 w-3" />
                {s.title}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Feature sections */}
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-16">
        {sections.map((section, idx) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <div className={`grid md:grid-cols-2 gap-8 items-start ${idx % 2 === 1 ? "md:flex-row-reverse" : ""}`}>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-primary/10">
                    <section.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">{section.title}</h2>
                    <p className="text-sm text-primary">{section.subtitle}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {section.description}
                </p>
              </div>

              <Card className="p-5 space-y-3 border-border bg-card">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Key capabilities</h4>
                <ul className="space-y-2.5">
                  {section.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-card-foreground">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </section>
        ))}
      </div>

      {/* CTA */}
      <section className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-16 text-center space-y-6">
          <h2 className="text-3xl font-bold tracking-tight">Ready to see it in action?</h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Get in touch to schedule a demo or discuss how SentiWatch can fit your organization's needs.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/contact">
              <Button size="lg" className="text-base px-8">
                Request a demo
              </Button>
            </Link>
            <Link to="/pricing">
              <Button variant="outline" size="lg" className="text-base px-8">
                View pricing
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card/40">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span>SentiWatch</span>
          </div>
          <p>© {new Date().getFullYear()} SentiWatch. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
