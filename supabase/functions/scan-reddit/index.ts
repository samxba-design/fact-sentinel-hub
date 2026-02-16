import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getRedditAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "FactSentinel/1.0",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Reddit auth failed: ${text}`);
  }

  const data = await response.json();
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { org_id, keywords, limit, sort, time_filter } = await req.json();
    if (!org_id || !keywords?.length) {
      return new Response(
        JSON.stringify({ success: false, error: "org_id and keywords required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Reddit credentials from org_api_keys
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: keys } = await supabase
      .from("org_api_keys")
      .select("key_name, key_value")
      .eq("org_id", org_id)
      .eq("provider", "reddit");

    const clientId = keys?.find(k => k.key_name === "client_id")?.key_value;
    const clientSecret = keys?.find(k => k.key_name === "client_secret")?.key_value;

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ success: false, error: "Reddit not connected. Add your Reddit API keys in Settings → Connections." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get access token
    const accessToken = await getRedditAccessToken(clientId, clientSecret);

    // Search Reddit
    const query = keywords.join(" OR ");
    const params = new URLSearchParams({
      q: query,
      sort: sort || "relevance",
      t: time_filter || "week",
      limit: String(limit || 25),
      type: "link,comment",
    });

    const searchRes = await fetch(`https://oauth.reddit.com/search?${params}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "FactSentinel/1.0",
      },
    });

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      throw new Error(`Reddit search failed: ${errText}`);
    }

    const searchData = await searchRes.json();
    const posts = searchData.data?.children || [];

    const results = posts.map((child: any) => {
      const post = child.data;
      return {
        source: "reddit",
        content: post.selftext?.slice(0, 500) || post.title || "",
        title: post.title || "",
        url: `https://reddit.com${post.permalink}`,
        author_name: post.author || "unknown",
        author_handle: `u/${post.author}`,
        posted_at: new Date(post.created_utc * 1000).toISOString(),
        metrics: {
          likes: post.ups || 0,
          comments: post.num_comments || 0,
          shares: 0,
        },
        subreddit: post.subreddit_name_prefixed || "",
      };
    });

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("scan-reddit error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
