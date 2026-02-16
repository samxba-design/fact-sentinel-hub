import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
    });
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // Check if user already has an org
    const { data: existing } = await sb.from("org_memberships").select("org_id").eq("user_id", user.id).limit(1);
    let orgId: string;

    if (existing && existing.length > 0) {
      orgId = existing[0].org_id;
    } else {
      const { data: org } = await sb.from("organizations").insert({
        name: "Nexus Financial", slug: "nexus-financial", domain: "nexusfinancial.com",
        industry: "Fintech", regions: ["North America", "Europe"], languages: ["English", "Spanish"],
        timezone: "America/New_York", plan: "business", scan_quota: 500,
      }).select("id").single();
      orgId = org!.id;

      await sb.from("org_memberships").insert({
        org_id: orgId, user_id: user.id, role: "owner", accepted_at: new Date().toISOString(),
      });
      await sb.from("tracking_profiles").insert({
        org_id: orgId, scan_schedule: "0 9 * * *",
        alert_emails: ["alerts@nexusfinancial.com"], escalation_emails: ["legal@nexusfinancial.com"],
        quiet_hours_start: 22, quiet_hours_end: 7,
      });
    }

    // Keywords
    const keywords = [
      { type: "brand", value: "Nexus Financial" }, { type: "brand", value: "NexusFi" },
      { type: "brand", value: "Nexus app" }, { type: "alias", value: "$NEXUS" },
      { type: "product", value: "Nexus Wallet" }, { type: "product", value: "Nexus Pro" },
      { type: "product", value: "Nexus Card" }, { type: "product", value: "NexusPay" },
      { type: "risk", value: "Nexus scam" }, { type: "risk", value: "Nexus hack" },
      { type: "risk", value: "Nexus fraud" }, { type: "risk", value: "Nexus down" },
      { type: "competitor", value: "Revolut" }, { type: "competitor", value: "Wise" },
    ];
    await sb.from("keywords").insert(keywords.map(k => ({ ...k, org_id: orgId, status: "active" })));

    // Topics
    const topicNames = ["Security", "Compliance", "Product/Outage", "Support", "Leadership", "Scams/Impersonation", "Fees/Pricing", "Withdrawals", "Partnerships", "Regulatory"];
    const { data: topics } = await sb.from("topics").insert(
      topicNames.map(name => ({ org_id: orgId, name, description: `${name} related mentions` }))
    ).select("id, name");
    const topicMap = Object.fromEntries((topics || []).map(t => [t.name, t.id]));

    // Narratives
    const narrativeData = [
      { name: "Hidden fees narrative", description: "Claims that Nexus charges hidden or undisclosed fees", status: "active", confidence: 0.85, example_phrases: ["hidden fees", "they charge you without telling", "surprise charges"] },
      { name: "Security breach rumor", description: "Unverified claims of a data breach or hack", status: "active", confidence: 0.72, example_phrases: ["got hacked", "data breach", "accounts compromised"] },
      { name: "CEO misconduct allegations", description: "Rumors about CEO personal conduct", status: "watch", confidence: 0.45, example_phrases: ["CEO scandal", "executive misconduct"] },
      { name: "Withdrawal delays", description: "Reports of slow or blocked withdrawals", status: "active", confidence: 0.91, example_phrases: ["can't withdraw", "money stuck", "withdrawal pending for days"] },
      { name: "Impersonation scam wave", description: "Fake accounts impersonating Nexus support", status: "active", confidence: 0.88, example_phrases: ["fake support", "scam account", "impersonating Nexus"] },
      { name: "Regulatory investigation rumor", description: "Claims of SEC or regulatory investigation", status: "watch", confidence: 0.35, example_phrases: ["SEC investigating", "regulatory action", "compliance issues"] },
    ];
    const { data: narratives } = await sb.from("narratives").insert(
      narrativeData.map(n => ({
        ...n, org_id: orgId,
        first_seen: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString(),
        last_seen: new Date(Date.now() - Math.random() * 2 * 86400000).toISOString(),
      }))
    ).select("id, name");
    const narrativeMap = Object.fromEntries((narratives || []).map(n => [n.name, n.id]));

    // People
    const peopleData = [
      { name: "Marcus Chen", titles: ["CEO", "Co-founder"], tier: "executive" },
      { name: "Sarah Williams", titles: ["CTO"], tier: "executive" },
      { name: "David Park", titles: ["Head of Compliance"], tier: "compliance" },
      { name: "Emma Rodriguez", titles: ["VP Communications"], tier: "spokesperson" },
      { name: "Alex Thompson", titles: ["CISO"], tier: "security" },
    ];
    for (const p of peopleData) {
      const { data: person } = await sb.from("people").insert({ name: p.name, titles: p.titles, follower_count: Math.floor(Math.random() * 50000) }).select("id").single();
      if (person) {
        await sb.from("org_people").insert({ org_id: orgId, person_id: person.id, tier: p.tier, status: "approved", confidence: 0.95 });
      }
    }

    // Sources
    await sb.from("sources").insert([
      { org_id: orgId, type: "news", enabled: true },
      { org_id: orgId, type: "reddit", enabled: true },
      { org_id: orgId, type: "twitter", enabled: true },
      { org_id: orgId, type: "app_store_ios", enabled: true },
      { org_id: orgId, type: "app_store_google", enabled: true },
      { org_id: orgId, type: "forums", enabled: false },
    ]);

    // Scan runs
    const scanRuns = [
      { status: "completed", total_mentions: 247, negative_pct: 18.2, emergencies_count: 3, started_at: new Date(Date.now() - 1 * 86400000).toISOString(), finished_at: new Date(Date.now() - 1 * 86400000 + 300000).toISOString() },
      { status: "completed", total_mentions: 189, negative_pct: 12.1, emergencies_count: 1, started_at: new Date(Date.now() - 2 * 86400000).toISOString(), finished_at: new Date(Date.now() - 2 * 86400000 + 280000).toISOString() },
      { status: "completed", total_mentions: 312, negative_pct: 24.7, emergencies_count: 5, started_at: new Date(Date.now() - 3 * 86400000).toISOString(), finished_at: new Date(Date.now() - 3 * 86400000 + 420000).toISOString() },
      { status: "completed", total_mentions: 156, negative_pct: 9.6, emergencies_count: 0, started_at: new Date(Date.now() - 4 * 86400000).toISOString(), finished_at: new Date(Date.now() - 4 * 86400000 + 250000).toISOString() },
      { status: "running", total_mentions: 78, negative_pct: 15.4, emergencies_count: 1, started_at: new Date(Date.now() - 3600000).toISOString(), finished_at: null },
    ];
    const { data: runs } = await sb.from("scan_runs").insert(
      scanRuns.map(r => ({ ...r, org_id: orgId, config_snapshot: { sources: ["news", "reddit", "twitter"], keywords: ["Nexus Financial"] } }))
    ).select("id");
    const runIds = (runs || []).map(r => r.id);

    // Mentions
    const mentionData = [
      { source: "twitter", author_name: "CryptoWatcher99", author_handle: "@cryptowatch99", author_follower_count: 45200, author_verified: false, content: "Just noticed Nexus Financial charged me a 2.5% 'processing fee' that wasn't in their fee schedule. Hidden fees much? #NexusFi #fintech", sentiment_label: "negative", sentiment_score: -0.78, severity: "medium", posted_at: new Date(Date.now() - 2 * 3600000).toISOString(), url: "https://x.com/cryptowatch99/status/123", flags: { false_claim: true }, topicKey: "Fees/Pricing", narrativeKey: "Hidden fees narrative" },
      { source: "reddit", author_name: "throwaway_fintech", author_handle: "u/throwaway_fintech", author_follower_count: 120, content: "BREAKING: Multiple sources confirm Nexus Financial database was breached last week. They're covering it up. Check your accounts NOW.", sentiment_label: "negative", sentiment_score: -0.95, severity: "emergency", posted_at: new Date(Date.now() - 5 * 3600000).toISOString(), url: "https://reddit.com/r/fintech/123", flags: { false_claim: true, emergency: true }, topicKey: "Security", narrativeKey: "Security breach rumor" },
      { source: "twitter", author_name: "TechInsider", author_handle: "@techinsider", author_follower_count: 892000, author_verified: true, content: "Hearing reports that @NexusFinancial may be under SEC scrutiny for compliance issues. No official confirmation yet. Developing story.", sentiment_label: "negative", sentiment_score: -0.62, severity: "high", posted_at: new Date(Date.now() - 8 * 3600000).toISOString(), url: "https://x.com/techinsider/status/456", flags: { regulatory_risk: true }, topicKey: "Regulatory", narrativeKey: "Regulatory investigation rumor" },
      { source: "news", author_name: "FinanceDaily", content: "Nexus Financial announces partnership with Visa for new debit card program, expanding into 12 new markets.", sentiment_label: "positive", sentiment_score: 0.82, severity: "low", posted_at: new Date(Date.now() - 12 * 3600000).toISOString(), url: "https://financedaily.com/nexus-visa", flags: {}, topicKey: "Partnerships" },
      { source: "app_store_ios", author_name: "frustrated_user_2024", content: "App crashes every time I try to withdraw. Been 5 days and my $2000 is stuck. Support isn't responding. Considering legal action.", sentiment_label: "negative", sentiment_score: -0.88, severity: "high", posted_at: new Date(Date.now() - 18 * 3600000).toISOString(), flags: {}, topicKey: "Withdrawals", narrativeKey: "Withdrawal delays" },
      { source: "twitter", author_name: "NexusSupport_REAL", author_handle: "@NexusSupport_REAL", author_follower_count: 23, content: "DM us your account details and we'll fix your withdrawal issue immediately! We're the official Nexus support team 🔒", sentiment_label: "negative", sentiment_score: -0.92, severity: "emergency", posted_at: new Date(Date.now() - 3 * 3600000).toISOString(), url: "https://x.com/NexusSupport_REAL/status/789", flags: { scam_risk: true, emergency: true }, topicKey: "Scams/Impersonation", narrativeKey: "Impersonation scam wave" },
      { source: "twitter", author_name: "HappyUser", author_handle: "@happyuser", author_follower_count: 340, content: "Switched from Revolut to @NexusFinancial last month. The Pro account is actually amazing - instant transfers and great rates.", sentiment_label: "positive", sentiment_score: 0.75, severity: "low", posted_at: new Date(Date.now() - 24 * 3600000).toISOString(), flags: {} },
      { source: "reddit", author_name: "compliance_expert", author_handle: "u/compliance_expert", author_follower_count: 5600, content: "Nexus Financial's new KYC process is actually one of the better implementations I've seen. Smooth and compliant with latest EU regulations.", sentiment_label: "positive", sentiment_score: 0.65, severity: "low", posted_at: new Date(Date.now() - 30 * 3600000).toISOString(), flags: {}, topicKey: "Compliance" },
      { source: "news", author_name: "Bloomberg", content: "Nexus Financial reports Q3 revenue up 34% YoY, user base crosses 5 million. CEO Marcus Chen says 'We're just getting started.'", sentiment_label: "positive", sentiment_score: 0.88, severity: "low", posted_at: new Date(Date.now() - 48 * 3600000).toISOString(), url: "https://bloomberg.com/nexus-q3", flags: {}, topicKey: "Leadership" },
      { source: "twitter", author_name: "AngryCrypto", author_handle: "@angrycrypto", author_follower_count: 12300, content: "Nexus just locked my account for 'verification' after I tried to move $50k. This is NOT okay. They're holding people's money hostage! Thread 🧵", sentiment_label: "negative", sentiment_score: -0.85, severity: "high", posted_at: new Date(Date.now() - 6 * 3600000).toISOString(), url: "https://x.com/angrycrypto/status/101", flags: {}, topicKey: "Withdrawals", narrativeKey: "Withdrawal delays" },
      { source: "twitter", author_name: "FintechAnalyst", author_handle: "@fintechanalyst", author_follower_count: 67000, author_verified: true, content: "The Nexus Financial hidden fees story is overblown. Their fee schedule clearly lists the processing fee. People just don't read ToS.", sentiment_label: "neutral", sentiment_score: 0.1, severity: "low", posted_at: new Date(Date.now() - 4 * 3600000).toISOString(), flags: {}, topicKey: "Fees/Pricing", narrativeKey: "Hidden fees narrative" },
      { source: "reddit", author_name: "security_researcher", author_handle: "u/security_researcher", author_follower_count: 28000, content: "I've done a thorough analysis of the alleged Nexus breach claims. There is ZERO evidence of a breach. The screenshots being shared are fabricated. Don't spread FUD.", sentiment_label: "positive", sentiment_score: 0.45, severity: "medium", posted_at: new Date(Date.now() - 7 * 3600000).toISOString(), flags: {}, topicKey: "Security", narrativeKey: "Security breach rumor" },
      { source: "app_store_google", author_name: "MobileUser123", content: "Update fixed the crash issues. App works great now. 5 stars!", sentiment_label: "positive", sentiment_score: 0.72, severity: "low", posted_at: new Date(Date.now() - 36 * 3600000).toISOString(), flags: {}, topicKey: "Product/Outage" },
      { source: "twitter", author_name: "ScamAlert", author_handle: "@scamalert_org", author_follower_count: 156000, author_verified: true, content: "⚠️ WARNING: Multiple fake @NexusFinancial support accounts are active on X right now. Official support NEVER asks for passwords or seed phrases via DM.", sentiment_label: "negative", sentiment_score: -0.7, severity: "high", posted_at: new Date(Date.now() - 1 * 3600000).toISOString(), flags: { scam_risk: true }, topicKey: "Scams/Impersonation", narrativeKey: "Impersonation scam wave" },
      { source: "news", author_name: "TechCrunch", content: "Nexus Financial hires former Stripe exec as new CTO, signals push into enterprise payments.", sentiment_label: "positive", sentiment_score: 0.7, severity: "low", posted_at: new Date(Date.now() - 72 * 3600000).toISOString(), url: "https://techcrunch.com/nexus-cto", flags: {}, topicKey: "Leadership" },
    ];

    const { data: mentions } = await sb.from("mentions").insert(
      mentionData.map((m, i) => ({
        org_id: orgId,
        scan_run_id: runIds[Math.min(i % runIds.length, runIds.length - 1)] || null,
        source: m.source,
        author_name: m.author_name,
        author_handle: m.author_handle || null,
        author_follower_count: m.author_follower_count || 0,
        author_verified: m.author_verified || false,
        content: m.content,
        sentiment_label: m.sentiment_label,
        sentiment_score: m.sentiment_score,
        sentiment_confidence: 0.7 + Math.random() * 0.25,
        severity: m.severity,
        posted_at: m.posted_at,
        url: m.url || null,
        flags: m.flags,
        language: "en",
        status: "new",
        metrics: { likes: Math.floor(Math.random() * 500), shares: Math.floor(Math.random() * 100), comments: Math.floor(Math.random() * 80) },
      }))
    ).select("id");
    const mentionIds = (mentions || []).map(m => m.id);

    // Link mentions to topics and narratives
    for (let i = 0; i < mentionData.length; i++) {
      const m = mentionData[i];
      const mentionId = mentionIds[i];
      if (!mentionId) continue;
      if (m.topicKey && topicMap[m.topicKey]) {
        await sb.from("mention_topics").insert({ mention_id: mentionId, topic_id: topicMap[m.topicKey] });
      }
      if (m.narrativeKey && narrativeMap[m.narrativeKey]) {
        await sb.from("mention_narratives").insert({ mention_id: mentionId, narrative_id: narrativeMap[m.narrativeKey] });
      }
    }

    // Approved Facts
    await sb.from("approved_facts").insert([
      { org_id: orgId, title: "Official fee schedule", statement_text: "Nexus Financial's complete fee schedule is published at nexusfinancial.com/fees. All fees including the 2.5% international processing fee are clearly disclosed before any transaction.", source_link: "https://nexusfinancial.com/fees", category: "Fees/Pricing", status: "active", owner_department: "Legal", jurisdiction: "Global" },
      { org_id: orgId, title: "No data breach confirmed", statement_text: "Nexus Financial has not experienced any data breach. Our security team continuously monitors all systems. We are SOC 2 Type II certified and undergo regular third-party security audits.", source_link: "https://nexusfinancial.com/security", category: "Security", status: "active", owner_department: "Security", jurisdiction: "Global" },
      { org_id: orgId, title: "Withdrawal processing times", statement_text: "Standard withdrawals are processed within 1-3 business days. Enhanced verification may be required for transactions exceeding $10,000 as part of our regulatory obligations.", source_link: "https://nexusfinancial.com/help/withdrawals", category: "Support", status: "active", owner_department: "Support", jurisdiction: "Global" },
      { org_id: orgId, title: "Official support channels", statement_text: "Nexus Financial's only official support channels are support@nexusfinancial.com and the in-app chat. We NEVER ask for passwords, seed phrases, or private keys via social media DMs.", source_link: "https://nexusfinancial.com/security/scams", category: "Security", status: "active", owner_department: "Security", jurisdiction: "Global" },
      { org_id: orgId, title: "Regulatory compliance status", statement_text: "Nexus Financial is registered with FinCEN and holds money transmitter licenses in all operating states. We are not under any active regulatory investigation.", source_link: "https://nexusfinancial.com/licenses", category: "Compliance", status: "active", owner_department: "Compliance", jurisdiction: "US" },
      { org_id: orgId, title: "Visa partnership details", statement_text: "Nexus Financial has partnered with Visa to offer the Nexus Card, a debit card available in 12 markets with no foreign transaction fees.", category: "Partnerships", status: "active", owner_department: "Communications", jurisdiction: "Global" },
    ]);

    // Approved Templates
    await sb.from("approved_templates").insert([
      { org_id: orgId, name: "Fee clarification response", scenario_type: "Misinformation", tone: "professional", platform_length: "general", status: "active", template_text: "Thank you for raising this. {FACT_1} If you believe there's a discrepancy, please contact our support team and we'll review your account. {LINK_1}" },
      { org_id: orgId, name: "Security breach denial", scenario_type: "Misinformation", tone: "authoritative", platform_length: "general", status: "active", template_text: "We take these claims very seriously. {FACT_1} We encourage all users to enable 2FA and report any suspicious activity. {LINK_1}" },
      { org_id: orgId, name: "Scam warning response", scenario_type: "Scam Warning", tone: "urgent", platform_length: "short", status: "active", template_text: "⚠️ {FACT_1} Report suspicious accounts to @NexusFinancial and your platform. {LINK_1}" },
      { org_id: orgId, name: "Withdrawal support response", scenario_type: "Support Issue", tone: "empathetic", platform_length: "general", status: "active", template_text: "We understand your frustration. {FACT_1} Please DM us your support ticket number and we'll escalate this immediately. {LINK_1}" },
      { org_id: orgId, name: "Regulatory rumor response", scenario_type: "Regulatory Rumor", tone: "authoritative", platform_length: "long", status: "draft", template_text: "{FACT_1} We remain committed to full transparency with our regulators and users. {LINK_1}" },
    ]);

    // Escalations
    await sb.from("escalations").insert([
      { org_id: orgId, title: "Viral breach claim needs official response", department: "Security", priority: "critical", status: "open", description: "Reddit post claiming data breach has 2.4k upvotes. Need Security team to confirm no breach and draft official statement.", requester_id: user.id },
      { org_id: orgId, title: "SEC investigation rumor - legal review needed", department: "Compliance", priority: "high", status: "in_progress", description: "TechInsider (892k followers) posted about potential SEC scrutiny. Legal needs to review and provide approved response.", requester_id: user.id },
      { org_id: orgId, title: "Impersonation accounts wave", department: "Security", priority: "high", status: "open", description: "Multiple fake Nexus support accounts detected. Need to coordinate takedown requests and issue scam warning.", requester_id: user.id },
    ]);

    // Alerts
    await sb.from("alerts").insert([
      { org_id: orgId, type: "spike", status: "active", payload: { narrative: "Security breach rumor", increase_pct: 340, window: "6h" } },
      { org_id: orgId, type: "emergency", status: "active", payload: { mention_count: 2, source: "twitter, reddit", severity: "emergency" } },
      { org_id: orgId, type: "influencer_amplification", status: "acknowledged", payload: { author: "TechInsider", followers: 892000, topic: "Regulatory" } },
    ]);

    return new Response(JSON.stringify({ success: true, org_id: orgId, mentions_created: mentionIds.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("seed-demo error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
