import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2023-10-16",
  });

  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  let event: Stripe.Event;
  try {
    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not configured");
      return new Response(JSON.stringify({ error: "Webhook not configured" }), { status: 500 });
    }
    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing stripe-signature" }), { status: 400 });
    }
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.org_id;
        if (!orgId) break;

        const subscriptionId = session.subscription as string;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const interval = subscription.items.data[0]?.price?.recurring?.interval;

        await supabase.from("organizations").update({
          subscription_status: "active",
          subscription_type: interval === "year" ? "yearly" : "monthly",
          subscription_approved_at: new Date().toISOString(),
          subscription_expires_at: new Date(subscription.current_period_end * 1000).toISOString(),
        }).eq("id", orgId);

        console.log(`Activated subscription for org ${orgId}`);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId = subscription.metadata?.org_id;
        if (!orgId) break;

        const status = subscription.status === "active" ? "active" : "expired";
        await supabase.from("organizations").update({
          subscription_status: status,
          subscription_expires_at: new Date(subscription.current_period_end * 1000).toISOString(),
        }).eq("id", orgId);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId = subscription.metadata?.org_id;
        if (!orgId) break;

        await supabase.from("organizations").update({
          subscription_status: "expired",
          subscription_type: null,
        }).eq("id", orgId);
        console.log(`Subscription cancelled for org ${orgId}`);
        break;
      }
    }
  } catch (err: any) {
    console.error("Webhook processing error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
