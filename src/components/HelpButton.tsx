/**
 * HelpButton — persistent floating button on every app page.
 * Opens a quick help menu: re-trigger tour, link to guide, contextual help.
 */
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HelpCircle, BookOpen, PlayCircle, ExternalLink, ChevronRight, Keyboard } from "lucide-react";
import OnboardingTour from "@/components/onboarding/OnboardingTour";

// Per-route contextual help snippets
const CONTEXTUAL_HELP: Record<string, { title: string; tips: string[] }> = {
  "/": {
    title: "Dashboard",
    tips: [
      "Narrative Now shows brand-only data — competitor activity is separate.",
      "Use 'Quick Scan' in the Narrative Now widget to refresh without leaving.",
      "Toggle widgets via the Customize button to personalise your view.",
      "Incident Mode increases scan frequency — use during active crises.",
    ],
  },
  "/scans": {
    title: "Scans",
    tips: [
      "Auto-scan uses brand/risk/product keywords only — competitor keywords are scanned separately.",
      "Extend date range for a broader search; narrow it for recent intel.",
      "No results? Check that your brand keywords are set in Settings.",
      "Scan results take 30–90 seconds — the progress bar shows each stage.",
    ],
  },
  "/mentions": {
    title: "Mentions",
    tips: [
      "This page shows brand mentions only. Competitor mentions are in the Intel Feed.",
      "Bulk select with checkboxes to resolve or escalate multiple at once.",
      "Saved Filters let you reuse common filter combinations.",
      "Severity: critical → immediate attention. High → review today.",
    ],
  },
  "/narratives": {
    title: "Narratives",
    tips: [
      "Narratives are AI-clustered automatically during scans.",
      "'Watch' status means the narrative is growing — monitor closely.",
      "Confidence score = how strongly the AI believes this is a distinct narrative.",
      "Link narratives to incidents for coordinated response tracking.",
    ],
  },
  "/briefing": {
    title: "Briefing Mode",
    tips: [
      "Briefing gives you a single-page executive summary — great for standups.",
      "The risk gauge updates based on your most recent scan data.",
      "Copy the briefing text with the copy button for quick sharing.",
    ],
  },
  "/respond": {
    title: "How To Respond",
    tips: [
      "The engine uses ONLY your Approved Facts — it cannot hallucinate.",
      "If it says 'insufficient facts', add relevant facts to your library first.",
      "Link to a specific mention or narrative for better-targeted responses.",
      "Platform selection (X, General, Long form) adjusts tone and length.",
    ],
  },
  "/approved-facts": {
    title: "Approved Facts",
    tips: [
      "Only 'Active' facts are used by the response engine.",
      "Add source links to create an auditable compliance trail.",
      "More facts = better response coverage.",
      "Under Review facts are excluded from responses until approved.",
    ],
  },
  "/competitors": {
    title: "Competitors",
    tips: [
      "Competitor scans are completely separate from your brand metrics.",
      "Click 'Intel' on any competitor card for a quick sentiment breakdown.",
      "The Threat Matrix shows all competitors by volume vs negativity — top-right needs attention.",
      "Intel Feed gives you a unified chronological view of all competitor activity.",
    ],
  },
  "/settings": {
    title: "Settings",
    tips: [
      "Brand keywords are used in auto-scans. Competitor keywords are scanned separately.",
      "Quiet hours suppress non-critical alerts during off-hours.",
      "Connect Twitter/Reddit API keys for social media monitoring.",
      "Invite team members with role-based access: View, Write, Edit, or Manage.",
    ],
  },
  "/risk-console": {
    title: "Risk Console",
    tips: [
      "Click any queue card to filter the list below it.",
      "Emergencies = critical severity mentions requiring immediate action.",
      "The risk score (0–100) is based on negative % and emergency count.",
    ],
  },
  "/incidents": {
    title: "Incidents",
    tips: [
      "Create an incident to coordinate team response to a crisis.",
      "Link mentions and narratives to consolidate intelligence in one place.",
      "Enable Incident Mode in the dashboard for heightened monitoring.",
    ],
  },
  "/war-room": {
    title: "War Room",
    tips: [
      "War Room is a real-time coordination space for active crises.",
      "Messages are visible to all team members in your organization.",
      "Link to an active incident to keep context in one place.",
    ],
  },
};

export default function HelpButton() {
  const [open, setOpen] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Match current route to contextual help
  const path = location.pathname;
  const contextKey = Object.keys(CONTEXTUAL_HELP).find(k => k !== "/" && path.startsWith(k)) || (path === "/" ? "/" : null);
  const context = contextKey ? CONTEXTUAL_HELP[contextKey] : null;

  if (tourActive) {
    return <OnboardingTour forceShow onClose={() => setTourActive(false)} />;
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="fixed bottom-6 right-6 z-40 h-10 w-10 rounded-full bg-card border border-border shadow-lg hover:shadow-xl hover:border-primary/30 transition-all"
            aria-label="Help"
          >
            <HelpCircle className="h-5 w-5 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="end" className="w-72 p-0 shadow-xl" sideOffset={10}>
          <div className="p-3 border-b border-border">
            <p className="text-sm font-semibold text-foreground">Help & Guidance</p>
            {context && (
              <p className="text-xs text-muted-foreground mt-0.5">{context.title} page</p>
            )}
          </div>

          {/* Contextual tips for current page */}
          {context && context.tips.length > 0 && (
            <div className="p-3 border-b border-border space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tips for this page</p>
              <ul className="space-y-1.5">
                {context.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                    <span className="text-primary mt-0.5 shrink-0">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="p-2 space-y-0.5">
            <button
              onClick={() => { setOpen(false); setTourActive(true); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm hover:bg-muted/50 transition-colors text-foreground"
            >
              <PlayCircle className="h-4 w-4 text-primary shrink-0" />
              Replay onboarding tour
            </button>
            <button
              onClick={() => { setOpen(false); navigate("/guide"); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm hover:bg-muted/50 transition-colors text-foreground"
            >
              <BookOpen className="h-4 w-4 text-primary shrink-0" />
              Full feature guide
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
            </button>
            <button
              onClick={() => { setOpen(false); navigate("/getting-started"); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm hover:bg-muted/50 transition-colors text-foreground"
            >
              <Keyboard className="h-4 w-4 text-primary shrink-0" />
              Getting started checklist
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
