import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth check
    const authHeader = req.headers.get("Authorization");
    const supabaseUser = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader! } } }
    );
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { org_id, title, auto_populate } = await req.json();
    if (!org_id) throw new Error("Missing org_id");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get user's Google token
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("user_google_tokens")
      .select("*")
      .eq("user_id", user.id)
      .eq("org_id", org_id)
      .maybeSingle();

    if (tokenErr || !tokenRow) {
      return new Response(
        JSON.stringify({ error: "Google account not connected. Please connect first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accessToken = tokenRow.access_token;

    // Refresh if expired
    if (new Date(tokenRow.token_expires_at) <= new Date()) {
      const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
      const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        throw new Error("Google OAuth credentials not configured");
      }

      const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: tokenRow.refresh_token,
          grant_type: "refresh_token",
        }),
      });

      if (!refreshRes.ok) {
        await supabase.from("user_google_tokens").delete().eq("id", tokenRow.id);
        return new Response(
          JSON.stringify({ error: "Google token expired. Please reconnect your Google account." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const refreshData = await refreshRes.json();
      accessToken = refreshData.access_token;
      const newExpiry = new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString();
      await supabase
        .from("user_google_tokens")
        .update({ access_token: accessToken, token_expires_at: newExpiry })
        .eq("id", tokenRow.id);
    }

    // Create a new Google Sheet
    const sheetTitle = title || `SentiWatch Export — ${new Date().toISOString().slice(0, 10)}`;
    const tabNames = ["Mentions", "Narratives", "Incidents", "Escalations", "Facts", "People"];
    const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: { title: sheetTitle },
        sheets: tabNames.map(name => ({ properties: { title: name } })),
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      console.error("Google Sheets create error:", err);
      throw new Error("Failed to create Google Sheet. Check Google account permissions.");
    }

    const sheet = await createRes.json();
    const spreadsheetId = sheet.spreadsheetId;
    const spreadsheetUrl = sheet.spreadsheetUrl;

    // Auto-populate with data if requested
    let populatedTabs: string[] = [];
    if (auto_populate !== false) {
      try {
        // Fetch all data types
        const [mentionsRes, narrativesRes, incidentsRes, escalationsRes, factsRes, peopleRes] = await Promise.all([
          supabase.from("mentions").select("id, source, content, author_name, author_handle, sentiment_label, sentiment_score, severity, status, posted_at, url, author_follower_count, language").eq("org_id", org_id).order("posted_at", { ascending: false }).limit(2000),
          supabase.from("narratives").select("id, name, description, status, confidence, first_seen, last_seen, example_phrases").eq("org_id", org_id).order("created_at", { ascending: false }).limit(500),
          supabase.from("incidents").select("id, name, description, status, started_at, ended_at, stakeholders").eq("org_id", org_id).order("created_at", { ascending: false }).limit(500),
          supabase.from("escalations").select("id, title, description, status, priority, department, created_at, updated_at").eq("org_id", org_id).order("created_at", { ascending: false }).limit(500),
          supabase.from("approved_facts").select("id, title, statement_text, category, status, jurisdiction, owner_department, source_link, approved_by, version, last_reviewed, created_at").eq("org_id", org_id).order("created_at", { ascending: false }).limit(500),
          supabase.from("org_people").select("person_id, tier, status, confidence, evidence, people(id, name, titles, handles, follower_count, links)").eq("org_id", org_id).limit(500),
        ]);

        // Build data for each tab
        const tabData: Record<string, string[][]> = {};

        const mentions = mentionsRes.data || [];
        if (mentions.length > 0) {
          tabData["Mentions"] = [
            ["ID", "Source", "Content", "Author", "Handle", "Sentiment", "Score", "Severity", "Status", "Posted At", "URL", "Followers", "Language"],
            ...mentions.map((m: any) => [m.id, m.source, m.content, m.author_name, m.author_handle, m.sentiment_label, m.sentiment_score, m.severity, m.status, m.posted_at, m.url, m.author_follower_count, m.language]),
          ];
        }

        const narratives = narrativesRes.data || [];
        if (narratives.length > 0) {
          tabData["Narratives"] = [
            ["ID", "Name", "Description", "Status", "Confidence", "First Seen", "Last Seen", "Example Phrases"],
            ...narratives.map((n: any) => [n.id, n.name, n.description, n.status, n.confidence, n.first_seen, n.last_seen, (n.example_phrases || []).join("; ")]),
          ];
        }

        const incidents = incidentsRes.data || [];
        if (incidents.length > 0) {
          tabData["Incidents"] = [
            ["ID", "Name", "Description", "Status", "Started At", "Ended At", "Stakeholders"],
            ...incidents.map((i: any) => [i.id, i.name, i.description, i.status, i.started_at, i.ended_at, (i.stakeholders || []).join("; ")]),
          ];
        }

        const escalations = escalationsRes.data || [];
        if (escalations.length > 0) {
          tabData["Escalations"] = [
            ["ID", "Title", "Description", "Status", "Priority", "Department", "Created At", "Updated At"],
            ...escalations.map((e: any) => [e.id, e.title, e.description, e.status, e.priority, e.department, e.created_at, e.updated_at]),
          ];
        }

        const facts = factsRes.data || [];
        if (facts.length > 0) {
          tabData["Facts"] = [
            ["ID", "Title", "Statement", "Category", "Status", "Jurisdiction", "Department", "Source Link", "Approved By", "Version", "Last Reviewed", "Created At"],
            ...facts.map((f: any) => [f.id, f.title, f.statement_text, f.category, f.status, f.jurisdiction, f.owner_department, f.source_link, f.approved_by, f.version, f.last_reviewed, f.created_at]),
          ];
        }

        const people = peopleRes.data || [];
        if (people.length > 0) {
          tabData["People"] = [
            ["Person ID", "Name", "Titles", "Tier", "Status", "Confidence", "Follower Count", "Handles", "Links", "Evidence"],
            ...people.map((op: any) => {
              const p = op.people || {};
              return [p.id, p.name, (p.titles || []).join("; "), op.tier, op.status, op.confidence, p.follower_count, JSON.stringify(p.handles || {}), (p.links || []).join("; "), op.evidence];
            }),
          ];
        }

        // Write all data to sheets
        for (const [tabName, rows] of Object.entries(tabData)) {
          const writeRes = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tabName)}!A1:ZZ?valueInputOption=RAW`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ values: rows }),
            }
          );
          if (writeRes.ok) {
            populatedTabs.push(`${tabName} (${rows.length - 1} rows)`);
          } else {
            console.error(`Failed to write tab ${tabName}:`, await writeRes.text());
          }
        }

        // Save export records
        for (const tabName of Object.keys(tabData)) {
          await supabase.from("exports").insert({
            org_id,
            type: tabName.toLowerCase(),
            sheet_id: spreadsheetId,
            last_exported_at: new Date().toISOString(),
          });
        }
      } catch (popErr) {
        console.error("Auto-populate error (non-fatal):", popErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sheet_id: spreadsheetId,
        sheet_url: spreadsheetUrl,
        title: sheetTitle,
        populated_tabs: populatedTabs,
        message: populatedTabs.length > 0
          ? `Sheet created and populated: ${populatedTabs.join(", ")}`
          : `Sheet "${sheetTitle}" created with empty tabs. Use Sync to populate.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("create-google-sheet error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
