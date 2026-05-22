import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { geminiChat } from "../_lib/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { domain, org_id } = await req.json();
    if (!domain || !org_id) throw new Error("Missing domain or org_id");

    // Verify org membership
    const { data: isMember } = await supabase.rpc("is_org_member", { _user_id: userId, _org_id: org_id });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gather internal data about this source
    const [orgRes, mentionsRes, keywordsRes] = await Promise.all([
      supabase.from("organizations").select("name, domain, industry").eq("id", org_id).single(),
      supabase.from("mentions").select("content, sentiment_label, severity, author_name, posted_at, url")
        .eq("org_id", org_id)
        .ilike("url", `%${domain}%`)
        .order("posted_at", { ascending: false })
        .limit(50),
      supabase.from("keywords").select("value, type").eq("org_id", org_id).eq("type", "competitor"),
    ]);

    const org = orgRes.data;
    const mentions = mentionsRes.data || [];
    const competitors = (keywordsRes.data || []).map(k => k.value);

    const sentimentCounts: Record<string, number> = { positive: 0, negative: 0, neutral: 0, mixed: 0 };
    const severityCounts: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    const authors = new Set<string>();
    const contentSamples: string[] = [];

    for (const m of mentions) {
      if (m.sentiment_label) sentimentCounts[m.sentiment_label] = (sentimentCounts[m.sentiment_label] || 0) + 1;
      if (m.severity) severityCounts[m.severity] = (severityCounts[m.severity] || 0) + 1;
      if (m.author_name) authors.add(m.author_name);
      if (m.content && contentSamples.length < 5) {
        contentSamples.push(m.content.slice(0, 300));
      }
    }

    const responseText = await geminiChat([
      {
            role: "system",
            content: `You are a media intelligence analyst. Given a domain/source and internal monitoring data, produce a concise intelligence profile.`,
          },
          {
            role: "user",
            content: `Analyze this source for ${org?.name || "our organization"} (Industry: ${org?.industry || "unknown"}):

Domain: ${domain}

Internal monitoring data:
- Total mentions from this source: ${mentions.length}
- Sentiment breakdown: ${JSON.stringify(sentimentCounts)}
- Severity breakdown: ${JSON.stringify(severityCounts)}
- Known authors: ${[...authors].slice(0, 10).join(", ") || "none identified"}
- Tracked competitors: ${competitors.join(", ") || "none"}

Sample content from this source:
${contentSamples.map((c, i) => `[${i + 1}] ${c}`).join("\n\n")}`,
          },
    ], true);

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No profile generated");

    const profile = JSON.parse(toolCall.function.arguments);

    const result = {
      ...profile,
      internal_stats: {
        total_mentions: mentions.length,
        sentiment: sentimentCounts,
        severity: severityCounts,
        unique_authors: authors.size,
        first_seen: mentions.length > 0 ? mentions[mentions.length - 1].posted_at : null,
        last_seen: mentions.length > 0 ? mentions[0].posted_at : null,
      },
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-source error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
