import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BookOpen, LayoutDashboard, Scan, MessageSquareWarning, Network,
  Users, AlertTriangle, Siren, MessageCircleReply, BookCheck,
  FileText, TicketCheck, Download, ArrowRight, Shield, Zap,
  ChevronDown, ChevronRight, Settings, HelpCircle,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";

interface GuideSection {
  icon: any;
  title: string;
  route: string;
  description: string;
  steps: string[];
  tips?: string[];
}

const GUIDE_SECTIONS: GuideSection[] = [
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    route: "/",
    description: "Your command center — real-time overview of all monitoring activity, risk scores, sentiment trends, and live threat detection.",
    steps: [
      "View your Risk Index score (0–100) calculated from negative mentions and emergencies",
      "Monitor the Live Threat Feed for real-time detections as they arrive",
      "Check Sentiment Sparklines for 30-day trends across positive, neutral, and negative mentions",
      "Click any metric card (Total Mentions, Emergencies, etc.) to navigate directly to filtered views",
      "Expand the Emergency Detections panel to see critical items requiring immediate attention",
    ],
    tips: ["Run a scan first to populate the dashboard with data", "The Risk Index updates automatically based on your latest scan results"],
  },
  {
    icon: Scan,
    title: "Scans",
    route: "/scans",
    description: "Run monitoring scans to detect mentions of your organization across social media, news, forums, and blogs.",
    steps: [
      "Click 'New Scan' to open the scan builder",
      "Select your date range and the sources you want to monitor",
      "Add keywords — your organization's configured keywords auto-load",
      "Click 'Run Scan' to start. The AI will analyze sources and generate mention data",
      "View scan results by clicking on any completed scan row, which filters the Mentions page",
    ],
    tips: ["Scans produce AI-analyzed data with sentiment, severity, and flag detection", "Configure scheduled scans in Settings for automatic monitoring"],
  },
  {
    icon: MessageSquareWarning,
    title: "Mentions",
    route: "/mentions",
    description: "Browse, filter, and manage all detected mentions. Each mention includes sentiment analysis, severity, source attribution, and risk flags.",
    steps: [
      "Use filters to narrow by status (Active, Ignored, Snoozed), severity, and source",
      "Select multiple mentions with checkboxes for bulk actions (Ignore, Resolve, Escalate)",
      "Click any mention to view its full detail page with sentiment scores, flags, and linked narratives",
      "Use the '...' menu on each mention for quick actions like Draft Response or Escalate",
      "Save frequently used filter combinations with the Saved Filters feature",
    ],
    tips: ["Engagement metrics show N/A when not independently verified", "Mentions are labeled as 'AI-Simulated' when generated through scans — they represent realistic but synthetic monitoring data"],
  },
  {
    icon: Network,
    title: "Narratives",
    route: "/narratives",
    description: "Track recurring themes and narratives across your mentions. Narratives group related mentions by topic or claim pattern.",
    steps: [
      "View active narratives sorted by mention count and confidence score",
      "Click a narrative to see all linked mentions and example phrases",
      "Narratives are auto-detected during scans and can be manually created",
      "Link narratives to incidents for coordinated response tracking",
    ],
  },
  {
    icon: Users,
    title: "People",
    route: "/people",
    description: "Monitor key individuals — executives, spokespeople, or external figures. Track their mentions, sentiment trends, and cross-platform activity.",
    steps: [
      "Click 'Add Person' to add someone new or select from existing company members",
      "Set monitoring tiers: Executive, Spokesperson, Security, Compliance, Product, or Other",
      "View a person's detail page for their mention history, sentiment trends, and linked handles",
      "People flagged in mentions are automatically suggested for tracking",
    ],
  },
  {
    icon: AlertTriangle,
    title: "Risk Console",
    route: "/risk-console",
    description: "Triage and manage operational risks, active alerts, and high-severity detections in one place.",
    steps: [
      "Click any risk queue card (Emergencies, High Severity, False Claims, etc.) to filter the list below",
      "Hover over queue cards to see descriptions of what each category tracks",
      "Acknowledge or dismiss active alerts with the action buttons",
      "Click any risk item to navigate to its full mention detail page",
    ],
  },
  {
    icon: Siren,
    title: "Incidents",
    route: "/incidents",
    description: "Create war-room style incident records for coordinated crisis response. Link mentions, narratives, and stakeholders.",
    steps: [
      "Click 'New Incident' to create a crisis record with severity, category, and stakeholder info",
      "Link related mentions and narratives to consolidate intelligence",
      "Track the incident timeline — every status change is logged as an event",
      "Toggle Incident Mode in Settings to increase scan frequency during active crises",
    ],
  },
  {
    icon: MessageCircleReply,
    title: "How To Respond",
    route: "/respond",
    description: "The strict response engine drafts replies using ONLY your Approved Facts and Templates — no hallucination, no off-brand messaging.",
    steps: [
      "Paste the post or comment you need to respond to",
      "Select the platform (X, General, Long form) and response intent (Clarify, Support, etc.)",
      "Optionally link to a specific mention, narrative, or incident for context",
      "Click 'Generate Approved Response' — the AI extracts claims, matches facts, and drafts a response",
      "If facts are missing, the system blocks the response and auto-creates an escalation ticket",
    ],
    tips: ["Add more Approved Facts to unlock more response coverage", "The response always cites which facts and templates were used"],
  },
  {
    icon: BookCheck,
    title: "Approved Facts",
    route: "/approved-facts",
    description: "Your governance library of verified, approved statements. These are the ONLY facts the response engine can use.",
    steps: [
      "Click 'Add Fact' to create a new approved statement with category, department, and source link",
      "Set status: Active (usable in responses), Under Review, or Deprecated",
      "Facts can be referenced in Templates using placeholders like {FACT_1}",
      "Add source links to connect facts to official documentation or regulatory filings",
      "Search and filter facts by title to quickly find relevant information",
    ],
    tips: ["More active facts = better response coverage", "Link facts to external sources for auditability"],
  },
  {
    icon: FileText,
    title: "Templates",
    route: "/approved-templates",
    description: "Pre-approved response templates with dynamic placeholders. Use the auto-generate feature to create templates from your approved facts.",
    steps: [
      "Click 'Add Template' or use 'Auto-Generate' to create a new template",
      "Auto-Generate lets you select a scenario, tone, platform, and which facts to include",
      "Templates use placeholders: {FACT_1}, {FACT_2}, {LINK_1} for dynamic fact insertion",
      "Set templates to Active to make them available in the response engine",
      "Templates are matched by scenario type when generating responses",
    ],
  },
  {
    icon: TicketCheck,
    title: "Escalations",
    route: "/escalations",
    description: "Human-in-the-loop workflow for issues requiring manual review. Auto-created when the response engine lacks facts, or manually created.",
    steps: [
      "View all escalation tickets sorted by priority and status",
      "Click a ticket to see details, add comments, and update status",
      "Create new tickets manually or they're auto-created by the response engine",
      "Set department, priority, and link related mentions and narratives",
      "Configure auto-escalation rules in Settings for automatic ticket creation",
    ],
  },
  {
    icon: Download,
    title: "Exports",
    route: "/exports",
    description: "Export your data as CSV files or sync directly to Google Sheets for external reporting and analysis.",
    steps: [
      "Choose between CSV download or Google Sheets sync",
      "Select which data types to export: Mentions, Narratives, Incidents, Escalations, Approved Facts",
      "For Sheets: connect your Google account and enter your Sheet ID",
      "Use the quick-export buttons for individual data types",
      "View export history to track when data was last synced",
    ],
  },
  {
    icon: Settings,
    title: "Settings",
    route: "/settings",
    description: "Configure your organization's monitoring profile, keywords, sources, alert preferences, and team members.",
    steps: [
      "Manage keywords and sources for your monitoring configuration",
      "Set up alert emails and escalation email addresses",
      "Configure quiet hours to suppress non-critical notifications",
      "Invite and manage team members with role-based access",
      "Toggle Incident Mode for heightened monitoring during crises",
    ],
  },
];

function GuideSectionCard({ section }: { section: GuideSection }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const Icon = section.icon;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="bg-card border-border overflow-hidden">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-4 p-5 text-left hover:bg-muted/30 transition-colors">
            <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{section.description}</p>
            </div>
            {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">{section.description}</p>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">How to use</h4>
              <ol className="space-y-1.5">
                {section.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-card-foreground">
                    <span className="text-[10px] font-mono text-primary bg-primary/10 rounded px-1.5 py-0.5 shrink-0 mt-0.5">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            {section.tips && (
              <div className="space-y-1.5 bg-muted/30 rounded-lg p-3 border border-border">
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Zap className="h-3 w-3 text-sentinel-amber" /> Tips
                </h4>
                {section.tips.map((tip, i) => (
                  <p key={i} className="text-xs text-muted-foreground">• {tip}</p>
                ))}
              </div>
            )}

            <Button size="sm" variant="outline" onClick={() => navigate(section.route)} className="gap-1.5">
              Go to {section.title} <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function GuidePage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-fade-up max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <BookOpen className="h-6 w-6 text-primary" />
            Getting Started Guide
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Learn how to use SentiWatch — your AI-powered brand monitoring and response platform
          </p>
        </div>
      </div>

      {/* Quick Start */}
      <Card className="bg-primary/5 border-primary/20 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Quick Start — 5 Minutes to Your First Response
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[
            { step: "1", label: "Run a Scan", desc: "Monitor sources for mentions", route: "/scans" },
            { step: "2", label: "Add Facts", desc: "Create your governance library", route: "/approved-facts" },
            { step: "3", label: "Create Templates", desc: "Set up response templates", route: "/approved-templates" },
            { step: "4", label: "Draft Responses", desc: "Generate fact-based replies", route: "/respond" },
          ].map(item => (
            <button
              key={item.step}
              onClick={() => navigate(item.route)}
              className="text-left p-4 rounded-lg bg-card border border-border hover:border-primary/30 transition-colors space-y-1"
            >
              <div className="flex items-center gap-2">
                <Badge className="bg-primary text-primary-foreground text-[10px] px-1.5">{item.step}</Badge>
                <span className="text-sm font-medium text-foreground">{item.label}</span>
              </div>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </button>
          ))}
        </div>
      </Card>

      {/* Concept Overview */}
      <Card className="bg-card border-border p-6 space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" /> What is SentiWatch?
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          SentiWatch is an AI-powered brand monitoring and crisis response platform. It continuously scans social media, news, forums, and blogs for mentions of your organization, analyzes sentiment and severity, detects misinformation and emerging narratives, and helps you draft <strong className="text-foreground">fact-checked, on-brand responses</strong> using only your Approved Facts library.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
          <div className="p-3 rounded-lg bg-muted/30 border border-border">
            <h4 className="text-xs font-semibold text-foreground">Monitor</h4>
            <p className="text-[11px] text-muted-foreground mt-1">Scan sources, detect mentions, track narratives and key people</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border border-border">
            <h4 className="text-xs font-semibold text-foreground">Analyze</h4>
            <p className="text-[11px] text-muted-foreground mt-1">AI sentiment analysis, severity scoring, misinformation detection</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border border-border">
            <h4 className="text-xs font-semibold text-foreground">Respond</h4>
            <p className="text-[11px] text-muted-foreground mt-1">Strict response engine using only approved facts — zero hallucination</p>
          </div>
        </div>
      </Card>

      {/* Feature Guides */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-primary" /> Feature Guide
        </h2>
        <div className="space-y-2">
          {GUIDE_SECTIONS.map(section => (
            <GuideSectionCard key={section.title} section={section} />
          ))}
        </div>
      </div>
    </div>
  );
}
