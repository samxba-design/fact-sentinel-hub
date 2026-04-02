// Entity Intelligence — classification constants

export const PLATFORMS = [
  { value: "twitter",   label: "X / Twitter",     icon: "𝕏" },
  { value: "youtube",   label: "YouTube",          icon: "▶" },
  { value: "reddit",    label: "Reddit",           icon: "🔴" },
  { value: "instagram", label: "Instagram",        icon: "📸" },
  { value: "tiktok",    label: "TikTok",           icon: "🎵" },
  { value: "telegram",  label: "Telegram",         icon: "✈" },
  { value: "substack",  label: "Substack",         icon: "📧" },
  { value: "linkedin",  label: "LinkedIn",         icon: "🔵" },
  { value: "discord",   label: "Discord",          icon: "💬" },
  { value: "facebook",  label: "Facebook",         icon: "👤" },
  { value: "website",   label: "Website / Blog",   icon: "🌐" },
  { value: "news",      label: "News outlet",      icon: "📰" },
  { value: "forum",     label: "Forum / Board",    icon: "💬" },
  { value: "other",     label: "Other",            icon: "•" },
  { value: "unknown",   label: "Unknown",          icon: "?" },
];

export const SOURCE_TYPES = [
  { value: "official_brand",      label: "Official brand account",    group: "Brand" },
  { value: "brand_adjacent",      label: "Unofficial brand-adjacent", group: "Brand" },
  { value: "executive",           label: "Executive / Spokesperson",  group: "Brand" },
  { value: "employee",            label: "Employee",                  group: "Brand" },
  { value: "media_outlet",        label: "Media outlet",              group: "Media" },
  { value: "journalist",          label: "Journalist / Reporter",     group: "Media" },
  { value: "influencer",          label: "Creator / Influencer",      group: "Media" },
  { value: "analyst",             label: "Analyst / Commentator",     group: "Media" },
  { value: "customer",            label: "Customer / Consumer",       group: "Public" },
  { value: "community",           label: "Community page",            group: "Public" },
  { value: "forum",               label: "Forum / Subreddit",         group: "Public" },
  { value: "anonymous",           label: "Anonymous individual",      group: "Public" },
  { value: "activist",            label: "Activist / Advocacy group", group: "Threat" },
  { value: "competitor",          label: "Competitor",                group: "Threat" },
  { value: "scam",                label: "Scam / Fraud actor",        group: "Threat" },
  { value: "impersonator",        label: "Impersonation account",     group: "Threat" },
  { value: "bot",                 label: "Bot / Automated network",   group: "Threat" },
  { value: "regulator",           label: "Regulator / Authority",     group: "External" },
  { value: "investor",            label: "Investor / Shareholder",    group: "External" },
  { value: "watchdog",            label: "Watchdog / Investigator",   group: "External" },
  { value: "partner",             label: "Partner / Vendor",          group: "External" },
  { value: "unknown",             label: "Unknown",                   group: "" },
];

export const RISK_TYPES = [
  { value: "none",                label: "Benign / No risk",          color: "text-emerald-400" },
  { value: "monitor_only",        label: "Monitor only",              color: "text-blue-400" },
  { value: "misleading",          label: "Misleading",                color: "text-amber-400" },
  { value: "false_info",          label: "False information",         color: "text-amber-500" },
  { value: "disinformation",      label: "Disinformation",            color: "text-orange-400" },
  { value: "malicious",           label: "Malicious",                 color: "text-red-400" },
  { value: "impersonation",       label: "Impersonation",             color: "text-red-500" },
  { value: "scam_fraud",          label: "Scam / Fraud",              color: "text-red-500" },
  { value: "phishing",            label: "Phishing",                  color: "text-red-600" },
  { value: "brand_abuse",         label: "Brand abuse",               color: "text-red-400" },
  { value: "harassment",          label: "Harassment",                color: "text-orange-500" },
  { value: "defamation",          label: "Defamation risk",           color: "text-orange-400" },
  { value: "coordinated_attack",  label: "Coordinated attack",        color: "text-red-600" },
  { value: "spam",                label: "Spam",                      color: "text-muted-foreground" },
  { value: "legal_regulatory",    label: "Legal / Regulatory risk",   color: "text-purple-400" },
  { value: "market_manipulation", label: "Market manipulation",       color: "text-purple-500" },
  { value: "leak_risk",           label: "Leak / Confidential risk",  color: "text-yellow-400" },
  { value: "security_threat",     label: "Security threat",           color: "text-red-700" },
  { value: "counterfeit",         label: "Counterfeit / Fake service",color: "text-orange-600" },
  { value: "suspicious",          label: "Suspicious / Unverified",   color: "text-yellow-500" },
];

export const INTENT_TYPES = [
  "inform_report", "criticize", "satirize_parody", "influence_opinion",
  "promote_service", "drive_traffic", "scam_steal", "impersonate",
  "harass", "organize_activism", "spread_political", "manipulate_market",
  "damage_reputation", "unknown",
];

export const CREDIBILITY = [
  { value: "trusted",           label: "Trusted",            color: "text-emerald-400" },
  { value: "generally_credible",label: "Generally credible", color: "text-emerald-300" },
  { value: "mixed",             label: "Mixed credibility",  color: "text-amber-400" },
  { value: "low",               label: "Low credibility",    color: "text-amber-500" },
  { value: "unverified",        label: "Unverified",         color: "text-muted-foreground" },
  { value: "suspicious",        label: "Suspicious",         color: "text-orange-400" },
  { value: "known_malicious",   label: "Known malicious",    color: "text-red-500" },
  { value: "known_scam",        label: "Known scam/fraud",   color: "text-red-600" },
];

export const RELATIONSHIP = [
  "owned_by_brand", "official_partner", "media_observer", "friendly_advocate",
  "neutral", "critical", "hostile", "fraudulent_impersonator", "competitor", "unknown",
];

export const SEVERITIES = ["low", "moderate", "high", "critical"];
export const CONFIDENCES = ["low", "medium", "high"];
export const STATUSES = [
  { value: "active",             label: "Active",             color: "text-emerald-400" },
  { value: "under_review",       label: "Under review",       color: "text-amber-400" },
  { value: "confirmed_malicious",label: "Confirmed malicious",color: "text-red-500" },
  { value: "false_positive",     label: "False positive",     color: "text-muted-foreground" },
  { value: "resolved",           label: "Resolved",           color: "text-emerald-300" },
  { value: "archived",           label: "Archived",           color: "text-muted-foreground" },
  { value: "do_not_monitor",     label: "Do not monitor",     color: "text-muted-foreground" },
];

export const ACTION_RECOMMENDATIONS = [
  "observe", "escalate_social", "escalate_pr", "escalate_legal",
  "escalate_trust_safety", "escalate_customer_support", "request_takedown",
  "block_ignore", "verify_manually",
];

export const MONITORING_INTENTS = [
  "brand_risk", "misinformation_tracking", "impersonation", "fraud_scam_watch",
  "media_monitoring", "executive_monitoring", "activist_watch", "competitor_watch",
  "emerging_narrative", "support_escalation", "legal_compliance", "campaign_watch",
  "crisis_source", "general_watchlist",
];

export const REASON_ADDED_PRESETS = [
  "Reported by team member", "Discovered during incident", "Customer complaint surfaced it",
  "Platform search found it", "Competitor monitoring", "Media monitoring",
  "Trust & safety review", "Manual research", "External tipoff",
];

export const OWNERSHIP_TYPES = [
  "official_brand", "employee_executive", "customer", "media_journalist",
  "influencer_kol", "community", "parody_satire", "fan_account",
  "third_party_critic", "activist_group", "anonymous", "bot_suspected",
  "scammer_impersonator", "competitor_related", "regulator_government",
  "partner_vendor", "unknown",
];

export const SUGGESTED_TAGS = [
  "scam", "fake-support", "fake-giveaway", "phishing", "token-misinformation",
  "executive-impersonation", "customer-backlash", "viral-complaint", "boycott-narrative",
  "political-controversy", "security-incident", "data-leak-claims", "product-outage",
  "refund-complaints", "aml-fud", "anti-brand-activist", "media-risk", "legal-threat",
  "fake-review-network", "coordinated-amplification", "bot-like-behavior",
  "possible-impersonation", "manual-review-needed", "high-follower-risk",
];

export const RISK_FLAG_LABELS: Record<string, string> = {
  possible_impersonation: "Possible impersonation",
  typosquatting: "Typosquatting handle",
  fake_giveaway_language: "Fake giveaway language",
  suspicious_outbound_links: "Suspicious outbound links",
  engagement_mismatch: "Engagement/follower mismatch",
  high_posting_cadence: "High posting cadence (bot-like)",
  bot_like_behavior: "Bot-like behavior",
  support_scam_indicators: "Support scam indicators",
  coordinated_activity: "Coordinated activity",
  copycat_visuals: "Copycat visuals / logo use",
};

export const WATCHLIST_PRESETS = [
  { label: "Scam / Impersonation watch",   risk: "impersonation", intent: "fraud_scam_watch",     severity: "high" },
  { label: "Media figure watch",           risk: "monitor_only",  intent: "media_monitoring",      severity: "moderate" },
  { label: "Executive risk watch",         risk: "monitor_only",  intent: "executive_monitoring",  severity: "moderate" },
  { label: "Customer backlash source",     risk: "misleading",    intent: "brand_risk",            severity: "moderate" },
  { label: "Competitor threat source",     risk: "none",          intent: "competitor_watch",      severity: "low" },
  { label: "Activist pressure source",     risk: "monitor_only",  intent: "activist_watch",        severity: "moderate" },
  { label: "Narrative amplifier",          risk: "misleading",    intent: "emerging_narrative",    severity: "high" },
  { label: "Crisis-origin account",        risk: "malicious",     intent: "crisis_source",         severity: "critical" },
];
