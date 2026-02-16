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
    const { org_id, keywords, limit, include_comments, date_from, date_to } = await req.json();
    if (!keywords || keywords.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Keywords required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    console.log("YouTube search:", query, "date_from:", date_from);

    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("maxResults", String(maxResults));
    searchUrl.searchParams.set("order", "date"); // Sort by date, not relevance
    searchUrl.searchParams.set("key", ytApiKey);

    // Apply date range filter — critical for "last 7 days" etc.
    if (date_from) {
      searchUrl.searchParams.set("publishedAfter", new Date(date_from).toISOString());
    }
    if (date_to) {
      searchUrl.searchParams.set("publishedBefore", new Date(date_to).toISOString());
    }

    const searchRes = await fetch(searchUrl.toString());

    // Validate response is JSON
    const ct = searchRes.headers.get("content-type");
    if (!ct?.includes("application/json")) {
      const textResp = await searchRes.text();
      console.error("YouTube returned non-JSON:", ct, textResp.substring(0, 200));
      return new Response(
        JSON.stringify({ success: false, error: `YouTube API returned non-JSON response (${searchRes.status})` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // Date filter for secondary validation
    const dateFromMs = date_from ? new Date(date_from).getTime() : 0;

    for (const item of items) {
      const videoId = item.id?.videoId;
      const snippet = item.snippet || {};
      const stats = statsMap[videoId] || {};
      const publishedAt = snippet.publishedAt || new Date().toISOString();

      // Double-check date range (API sometimes returns edge cases)
      if (dateFromMs > 0 && new Date(publishedAt).getTime() < dateFromMs) {
        console.log("Skipping video outside date range:", snippet.title, publishedAt);
        continue;
      }

      // Use title + description as content, skip if it looks like an error
      const title = snippet.title || "";
      const description = snippet.description || "";
      const content = `${title}\n\n${description}`.trim();

      results.push({
        source: "youtube",
        content,
        title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        author_name: snippet.channelTitle || "",
        author_handle: snippet.channelId || "",
        posted_at: publishedAt,
        metrics: {
          likes: parseInt(stats.likeCount || "0"),
          shares: 0,
          comments: parseInt(stats.commentCount || "0"),
          views: parseInt(stats.viewCount || "0"),
        },
      });
    }

    // Optionally fetch top comments
    if (include_comments !== false && videoIds.length > 0) {
      const commentVideoIds = videoIds.slice(0, 5);
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

              const commentDate = comment.publishedAt || new Date().toISOString();
              // Skip comments outside date range
              if (dateFromMs > 0 && new Date(commentDate).getTime() < dateFromMs) continue;

              // Strip HTML from comment text
              const commentText = (comment.textDisplay || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
              if (commentText.length < 10) continue;

              results.push({
                source: "youtube_comment",
                content: commentText,
                url: `https://www.youtube.com/watch?v=${videoId}&lc=${thread.id}`,
                author_name: comment.authorDisplayName || "",
                author_handle: comment.authorChannelId?.value || "",
                posted_at: commentDate,
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
