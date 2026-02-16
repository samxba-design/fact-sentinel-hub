import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ExportRequest {
  org_id: string;
  data_type: "mentions" | "narratives" | "incidents" | "escalations";
  mode: "csv" | "sheets";
  sheet_id?: string;
  selected_ids?: string[];
  filters?: Record<string, string>;
}

// ── Google Sheets helpers ──────────────────────────────────

async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const claimSet = btoa(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );

  const signInput = `${header}.${claimSet}`;

  // Import the private key
  const pemContent = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binaryKey = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signInput)
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${header}.${claimSet}.${sig}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google token error: ${err}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

async function writeToSheet(
  accessToken: string,
  sheetId: string,
  sheetName: string,
  rows: string[][]
) {
  // Clear existing data
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName)}!A1:ZZ?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: rows }),
    }
  );
}

async function ensureSheetTab(
  accessToken: string,
  sheetId: string,
  sheetName: string
) {
  // Get existing sheets
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  const existing = data.sheets?.map((s: any) => s.properties.title) || [];

  if (!existing.includes(sheetName)) {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [{ addSheet: { properties: { title: sheetName } } }],
        }),
      }
    );
  }
}

// ── Data fetchers ──────────────────────────────────────────

async function fetchMentions(
  supabase: any,
  orgId: string,
  selectedIds?: string[]
) {
  let q = supabase
    .from("mentions")
    .select(
      "id, source, content, author_name, author_handle, sentiment_label, sentiment_score, severity, status, posted_at, url, author_follower_count, language"
    )
    .eq("org_id", orgId)
    .order("posted_at", { ascending: false })
    .limit(2000);

  if (selectedIds?.length) q = q.in("id", selectedIds);
  const { data } = await q;
  return data || [];
}

async function fetchNarratives(
  supabase: any,
  orgId: string,
  selectedIds?: string[]
) {
  let q = supabase
    .from("narratives")
    .select(
      "id, name, description, status, confidence, first_seen, last_seen, example_phrases"
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (selectedIds?.length) q = q.in("id", selectedIds);
  const { data } = await q;
  return data || [];
}

async function fetchIncidents(
  supabase: any,
  orgId: string,
  selectedIds?: string[]
) {
  let q = supabase
    .from("incidents")
    .select(
      "id, name, description, status, started_at, ended_at, stakeholders"
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (selectedIds?.length) q = q.in("id", selectedIds);
  const { data } = await q;
  return data || [];
}

async function fetchEscalations(
  supabase: any,
  orgId: string,
  selectedIds?: string[]
) {
  let q = supabase
    .from("escalations")
    .select(
      "id, title, description, status, priority, department, created_at, updated_at"
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (selectedIds?.length) q = q.in("id", selectedIds);
  const { data } = await q;
  return data || [];
}

// ── CSV builder ────────────────────────────────────────────

function toCSV(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? "");
          if (s.includes(",") || s.includes('"') || s.includes("\n")) {
            return `"${s.replace(/"/g, '""')}"`;
          }
          return s;
        })
        .join(",")
    )
    .join("\n");
}

function mentionsToRows(data: any[]): string[][] {
  const header = [
    "ID", "Source", "Content", "Author", "Handle", "Sentiment",
    "Sentiment Score", "Severity", "Status", "Posted At", "URL",
    "Followers", "Language",
  ];
  const rows = data.map((m) => [
    m.id, m.source, m.content, m.author_name, m.author_handle,
    m.sentiment_label, m.sentiment_score, m.severity, m.status,
    m.posted_at, m.url, m.author_follower_count, m.language,
  ]);
  return [header, ...rows];
}

function narrativesToRows(data: any[]): string[][] {
  const header = [
    "ID", "Name", "Description", "Status", "Confidence",
    "First Seen", "Last Seen", "Example Phrases",
  ];
  const rows = data.map((n) => [
    n.id, n.name, n.description, n.status, n.confidence,
    n.first_seen, n.last_seen,
    (n.example_phrases || []).join("; "),
  ]);
  return [header, ...rows];
}

function incidentsToRows(data: any[]): string[][] {
  const header = [
    "ID", "Name", "Description", "Status", "Started At",
    "Ended At", "Stakeholders",
  ];
  const rows = data.map((i) => [
    i.id, i.name, i.description, i.status, i.started_at,
    i.ended_at, (i.stakeholders || []).join("; "),
  ]);
  return [header, ...rows];
}

function escalationsToRows(data: any[]): string[][] {
  const header = [
    "ID", "Title", "Description", "Status", "Priority",
    "Department", "Created At", "Updated At",
  ];
  const rows = data.map((e) => [
    e.id, e.title, e.description, e.status, e.priority,
    e.department, e.created_at, e.updated_at,
  ]);
  return [header, ...rows];
}

// ── Main handler ───────────────────────────────────────────

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
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader! } } }
    );
    const {
      data: { user },
    } = await supabaseUser.auth.getUser();
    if (!user)
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const body: ExportRequest = await req.json();
    const { org_id, data_type, mode, sheet_id, selected_ids } = body;

    if (!org_id || !data_type)
      throw new Error("Missing org_id or data_type");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch the data
    let rawData: any[];
    let rows: string[][];
    const sheetTabName =
      data_type.charAt(0).toUpperCase() + data_type.slice(1);

    switch (data_type) {
      case "mentions":
        rawData = await fetchMentions(supabase, org_id, selected_ids);
        rows = mentionsToRows(rawData);
        break;
      case "narratives":
        rawData = await fetchNarratives(supabase, org_id, selected_ids);
        rows = narrativesToRows(rawData);
        break;
      case "incidents":
        rawData = await fetchIncidents(supabase, org_id, selected_ids);
        rows = incidentsToRows(rawData);
        break;
      case "escalations":
        rawData = await fetchEscalations(supabase, org_id, selected_ids);
        rows = escalationsToRows(rawData);
        break;
      default:
        throw new Error(`Unknown data_type: ${data_type}`);
    }

    if (mode === "csv") {
      const csv = toCSV(rows);
      return new Response(csv, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${data_type}_export_${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    // Google Sheets mode — per-user OAuth tokens
    if (mode === "sheets") {
      if (!sheet_id) {
        return new Response(
          JSON.stringify({ error: "No Google Sheet ID provided." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get user's Google token
      const { data: tokenRow, error: tokenErr } = await supabase
        .from("user_google_tokens")
        .select("*")
        .eq("user_id", user!.id)
        .eq("org_id", org_id)
        .maybeSingle();

      if (tokenErr || !tokenRow) {
        return new Response(
          JSON.stringify({ error: "Google account not connected. Please connect your Google account first." }),
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
          // Token revoked — delete and ask user to reconnect
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

      await ensureSheetTab(accessToken, sheet_id, sheetTabName);
      await writeToSheet(accessToken, sheet_id, sheetTabName, rows);

      // Update export record
      const { data: existingExport } = await supabase
        .from("exports")
        .select("id")
        .eq("org_id", org_id)
        .eq("type", data_type)
        .eq("sheet_id", sheet_id)
        .maybeSingle();

      if (existingExport) {
        await supabase
          .from("exports")
          .update({ last_exported_at: new Date().toISOString() })
          .eq("id", existingExport.id);
      } else {
        await supabase.from("exports").insert({
          org_id,
          type: data_type,
          sheet_id,
          last_exported_at: new Date().toISOString(),
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          rows_written: rows.length - 1,
          sheet_tab: sheetTabName,
          message: `Exported ${rows.length - 1} ${data_type} to Google Sheet tab "${sheetTabName}"`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unknown mode: ${mode}`);
  } catch (e) {
    console.error("export-data error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
