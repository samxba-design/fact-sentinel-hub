import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_KEY = Deno.env.get("GOOGLE_API_KEY") ?? "";
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

async function aiChat(messages: Array<{role: string; content: string}>, jsonMode = false): Promise<string> {
  if (GEMINI_KEY) {
    try {
      const prompt = messages.map(m => `${m.role === "system" ? "Instructions" : "User"}: ${m.content}`).join("\n\n");
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              ...(jsonMode ? { responseMimeType: "application/json" } : {}),
            },
          }),
        }
      );
      if (res.ok) {
        const d = await res.json();
        const text = d.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        if (text) return text;
      }
    } catch (_) {}
  }
  throw new Error("Gemini call failed. Ensure GOOGLE_API_KEY is set and valid in Supabase Edge Function secrets.");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_KEY}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages,
    }),
  });
  if (!res.ok) throw new Error(`AI gateway error ${res.status}`);
  const d = await res.json();
  return d.choices?.[0]?.message?.content ?? "";
}


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

    const responseText = await aiChat([
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
