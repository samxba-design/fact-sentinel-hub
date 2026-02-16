import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // redirect_uri from frontend
    const error = url.searchParams.get("error");

    if (error || !code) {
      const redirectUrl = state || "/exports";
      return new Response(null, {
        status: 302,
        headers: { Location: `${redirectUrl}?google_error=${error || "no_code"}` },
      });
    }

    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const callbackUrl = `${SUPABASE_URL}/functions/v1/google-sheets-callback`;

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("Token exchange error:", err);
      return new Response(null, {
        status: 302,
        headers: { Location: `${state || "/exports"}?google_error=token_exchange_failed` },
      });
    }

    const tokens = await tokenRes.json();

    // Get user's Google email
    const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userinfo = await userinfoRes.json();

    // We need to extract user_id and org_id from the state
    // State format: "redirect_uri|user_id|org_id"
    const stateParts = (state || "").split("|");
    const redirectUri = stateParts[0] || "/exports";
    const userId = stateParts[1];
    const orgId = stateParts[2];

    if (!userId || !orgId) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${redirectUri}?google_error=missing_context` },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Upsert the token record
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

    const { error: dbError } = await supabase
      .from("user_google_tokens")
      .upsert(
        {
          user_id: userId,
          org_id: orgId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || "",
          token_expires_at: expiresAt,
          google_email: userinfo.email || null,
        },
        { onConflict: "user_id,org_id" }
      );

    if (dbError) {
      console.error("DB upsert error:", dbError);
      return new Response(null, {
        status: 302,
        headers: { Location: `${redirectUri}?google_error=db_save_failed` },
      });
    }

    return new Response(null, {
      status: 302,
      headers: { Location: `${redirectUri}?google_connected=true` },
    });
  } catch (e) {
    console.error("google-sheets-callback error:", e);
    return new Response("Internal Server Error", { status: 500 });
  }
});
