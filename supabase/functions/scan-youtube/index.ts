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
    const { org_id, keywords, limit, include_comments } = await req.json();
    if (!keywords || keywords.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Keywords required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get YouTube API key from org_api_keys
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: apiKeyRow } = await supabase
      .from("org_api_keys")
      .select("key_value")
      .eq("org_id", org_id)
      .eq("provider", "youtube")
      .eq("key_name", "api_key")
      .maybeSingle();

    if (!apiKeyRow?.key_value) {
      return new Response(
        JSON.stringify({ success: false, error: "YouTube API key not configured. Add it in Settings → Sources." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ytApiKey = apiKeyRow.key_value;
    const query = keywords.join(" | ");
    const maxResults = Math.min(limit || 15, 50);

    console.log("YouTube search:", query);

    // Search videos
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("maxResults", String(maxResults));
    searchUrl.searchParams.set("order", "relevance");
    searchUrl.searchParams.set("key", ytApiKey);

    const searchRes = await fetch(searchUrl.toString());
    const searchData = await searchRes.json();

    if (!searchRes.ok) {
      console.error("YouTube search error:", searchData);
      return new Response(
        JSON.stringify({ success: false, error: searchData.error?.message || `YouTube API error ${searchRes.status}` }),
        { status: searchRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const items = searchData.items || [];
    if (items.length === 0) {
      return new Response(
        JSON.stringify({ success: true, results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get video statistics
    const videoIds = items.map((v: any) => v.id?.videoId).filter(Boolean);
    const statsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    statsUrl.searchParams.set("part", "statistics,contentDetails");
    statsUrl.searchParams.set("id", videoIds.join(","));
    statsUrl.searchParams.set("key", ytApiKey);

    const statsRes = await fetch(statsUrl.toString());
    const statsData = await statsRes.json();
    const statsMap: Record<string, any> = {};
    for (const v of (statsData.items || [])) {
      statsMap[v.id] = v.statistics;
    }

    const results: any[] = [];

    // Transform video results
    for (const item of items) {
      const videoId = item.id?.videoId;
      const snippet = item.snippet || {};
      const stats = statsMap[videoId] || {};

      results.push({
        source: "youtube",
        content: `[VIDEO] ${snippet.title || ""}\n\n${snippet.description || ""}`,
        title: snippet.title || "",
        url: `https://www.youtube.com/watch?v=${videoId}`,
        author_name: snippet.channelTitle || "",
        author_handle: snippet.channelId || "",
        posted_at: snippet.publishedAt || new Date().toISOString(),
        metrics: {
          likes: parseInt(stats.likeCount || "0"),
          shares: 0,
          comments: parseInt(stats.commentCount || "0"),
          views: parseInt(stats.viewCount || "0"),
        },
      });
    }

    // Optionally fetch top comments for each video
    if (include_comments !== false && videoIds.length > 0) {
      const commentVideoIds = videoIds.slice(0, 5); // Limit to save quota
      for (const videoId of commentVideoIds) {
        try {
          const commentsUrl = new URL("https://www.googleapis.com/youtube/v3/commentThreads");
          commentsUrl.searchParams.set("part", "snippet");
          commentsUrl.searchParams.set("videoId", videoId);
          commentsUrl.searchParams.set("maxResults", "5");
          commentsUrl.searchParams.set("order", "relevance");
          commentsUrl.searchParams.set("key", ytApiKey);

          const commRes = await fetch(commentsUrl.toString());
          if (commRes.ok) {
            const commData = await commRes.json();
            for (const thread of (commData.items || [])) {
              const comment = thread.snippet?.topLevelComment?.snippet;
              if (!comment) continue;
              results.push({
                source: "youtube_comment",
                content: comment.textDisplay || "",
                url: `https://www.youtube.com/watch?v=${videoId}&lc=${thread.id}`,
                author_name: comment.authorDisplayName || "",
                author_handle: comment.authorChannelId?.value || "",
                posted_at: comment.publishedAt || new Date().toISOString(),
                metrics: {
                  likes: comment.likeCount || 0,
                  shares: 0,
                  comments: 0,
                },
              });
            }
          }
        } catch (e) {
          console.error(`Comment fetch failed for ${videoId}:`, e);
        }
      }
    }

    console.log(`YouTube scan complete: ${results.length} results`);
    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("scan-youtube error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
