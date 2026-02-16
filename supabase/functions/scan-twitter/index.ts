import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { org_id, keywords, max_results, date_from, date_to } = await req.json();
    if (!org_id || !keywords?.length) {
      return new Response(
        JSON.stringify({ success: false, error: "org_id and keywords required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Twitter credentials from org_api_keys
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: keys } = await supabase
      .from("org_api_keys")
      .select("key_name, key_value")
      .eq("org_id", org_id)
      .eq("provider", "twitter");

    const bearerToken = keys?.find(k => k.key_name === "bearer_token")?.key_value;

    if (!bearerToken) {
      return new Response(
        JSON.stringify({ success: false, error: "Twitter not connected. Add your Twitter Bearer Token in Settings → Connections." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build search query
    const query = keywords.map((kw: string) => `"${kw}"`).join(" OR ");
    const params = new URLSearchParams({
      query: `${query} -is:retweet lang:en`,
      max_results: String(Math.min(max_results || 10, 100)),
      "tweet.fields": "created_at,public_metrics,author_id,lang",
      "user.fields": "name,username,verified,public_metrics",
      expansions: "author_id",
    });

    if (date_from) {
      params.set("start_time", new Date(date_from).toISOString());
    }
    if (date_to) {
      params.set("end_time", new Date(date_to).toISOString());
    }

    console.log("Twitter search query:", query);

    const searchRes = await fetch(`https://api.twitter.com/2/tweets/search/recent?${params}`, {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    });

    if (!searchRes.ok) {
      const errData = await searchRes.json().catch(() => ({}));
      const errMsg = errData.detail || errData.title || `Twitter API error ${searchRes.status}`;
      throw new Error(errMsg);
    }

    const searchData = await searchRes.json();
    const tweets = searchData.data || [];
    const users = searchData.includes?.users || [];

    const userMap = new Map(users.map((u: any) => [u.id, u]));

    const results = tweets.map((tweet: any) => {
      const author = userMap.get(tweet.author_id) as any;
      return {
        source: "twitter",
        content: tweet.text || "",
        url: `https://twitter.com/${author?.username || "i"}/status/${tweet.id}`,
        author_name: author?.name || "Unknown",
        author_handle: `@${author?.username || "unknown"}`,
        author_verified: author?.verified || false,
        author_follower_count: author?.public_metrics?.followers_count || 0,
        posted_at: tweet.created_at || new Date().toISOString(),
        metrics: {
          likes: tweet.public_metrics?.like_count || 0,
          shares: tweet.public_metrics?.retweet_count || 0,
          comments: tweet.public_metrics?.reply_count || 0,
        },
      };
    });

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("scan-twitter error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
