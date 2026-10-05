import Stripe from "stripe";
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

function decodeBase64UrlJson(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

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

http.route({
  path: "/google/gmail/push",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authorization = request.headers.get("authorization");
    const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!bearer) {
      console.error("Rejected Gmail Pub/Sub push: missing bearer token");
      return new Response("Missing bearer token.", { status: 401 });
    }

    try {
      await ctx.runAction(internal.gmailActions.verifyPubSubToken, { token: bearer });
    } catch (error) {
      console.error(
        "Rejected Gmail Pub/Sub push: token verification failed",
        error instanceof Error ? error.message.slice(0, 300) : "Unknown verification error",
      );
      return new Response("Invalid bearer token.", { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response("Malformed Pub/Sub payload.", { status: 400 });
    }
    const data = typeof body === "object" && body !== null &&
      "message" in body && typeof body.message === "object" && body.message !== null &&
      "data" in body.message && typeof body.message.data === "string"
      ? body.message.data
      : null;
    if (!data) return new Response("Malformed Pub/Sub payload.", { status: 400 });

    let notification: unknown;
    try {
      notification = decodeBase64UrlJson(data);
    } catch {
      return new Response("Malformed Gmail notification.", { status: 400 });
    }
    if (
      typeof notification !== "object" ||
      notification === null ||
      !("emailAddress" in notification) ||
      typeof notification.emailAddress !== "string" ||
      !("historyId" in notification) ||
      typeof notification.historyId !== "string" ||
      !/^\d+$/.test(notification.historyId)
    ) {
      return new Response("Malformed Gmail notification.", { status: 400 });
    }

    await ctx.scheduler.runAfter(0, internal.gmailActions.processHistoryNotification, {
      emailAddress: notification.emailAddress,
      historyId: notification.historyId,
    });
    return new Response(null, { status: 204 });
  }),
});

export default http;
