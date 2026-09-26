import Stripe from "stripe";
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("stripe-signature");
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!signature || !webhookSecret) {
      return new Response("Stripe webhook is not configured.", { status: 500 });
    }

    let event: Stripe.Event;
    try {
      event = await new Stripe("webhook_signature_verification_only", {
        apiVersion: "2026-08-26.dahlia",
      }).webhooks.constructEventAsync(
        await request.text(),
        signature,
        webhookSecret,
        undefined,
        Stripe.createSubtleCryptoProvider(),
      );
    } catch {
      return new Response("Invalid Stripe signature.", { status: 400 });
    }

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded" ||
      event.type === "checkout.session.async_payment_failed" ||
      event.type === "checkout.session.expired"
    ) {
      const session = event.data.object;
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;
      const stripeCustomerId =
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id;
      await ctx.runMutation(internal.stripeData.processCheckoutEvent, {
        eventId: event.id,
        eventType: event.type,
        checkoutSessionId: session.id,
        paymentStatus: session.payment_status,
        paymentIntentId,
        stripeCustomerId,
      });
    }

    return new Response("ok", { status: 200 });
  }),
});

export default http;
