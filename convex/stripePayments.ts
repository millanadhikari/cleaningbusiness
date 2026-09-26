import Stripe from "stripe";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

const STRIPE_API_VERSION = "2026-08-26.dahlia" as const;
const DEFAULT_INTEGRATION_IDENTIFIER = "wedocleaning_checkout_kqmvzrta";

function stripeClient() {
  const apiKey = process.env.STRIPE_API_KEY?.trim();
  if (!apiKey) throw new Error("Stripe is not configured.");
  return new Stripe(apiKey, { apiVersion: STRIPE_API_VERSION });
}

function publicAppUrl() {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  const url = configured || "http://localhost:3000";
  return url.replace(/\/$/, "");
}

export const createBookingCheckoutSession = action({
  args: { bookingId: v.id("bookings") },
  returns: v.object({ checkoutUrl: v.string() }),
  handler: async (ctx, { bookingId }) => {
    const booking = await ctx.runQuery(internal.stripeData.prepareCheckout, {
      bookingId,
    });
    const metadata = {
      bookingId: String(booking.bookingId),
      customerId: String(booking.customerId),
      paymentOption: booking.paymentOption,
    };

    try {
      const session = await stripeClient().checkout.sessions.create(
        {
          mode: "payment",
          customer_email: booking.customerEmail,
          client_reference_id: String(booking.bookingId),
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: "aud",
                unit_amount: booking.amountCents,
                product_data: {
                  name:
                    booking.paymentOption === "DEPOSIT"
                      ? `${booking.serviceName} deposit`
                      : booking.serviceName,
                },
              },
            },
          ],
          metadata,
          payment_intent_data: { metadata },
          success_url: `${publicAppUrl()}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${publicAppUrl()}/?checkout=cancelled`,
          integration_identifier:
            process.env.STRIPE_INTEGRATION_IDENTIFIER?.trim() ||
            DEFAULT_INTEGRATION_IDENTIFIER,
        },
        { idempotencyKey: `booking-checkout:${booking.bookingId}` },
      );
      if (!session.url) throw new Error("Stripe did not return a checkout URL.");

      await ctx.runMutation(internal.stripeData.saveCheckoutSession, {
        bookingId,
        checkoutSessionId: session.id,
        amountCents: booking.amountCents,
      });
      return { checkoutUrl: session.url };
    } catch (error) {
      console.error(
        "Unable to create Stripe Checkout session",
        error instanceof Error ? error.message : "Unknown Stripe error",
      );
      throw new Error("Unable to start secure checkout. Please try again.");
    }
  },
});

export const createBalanceCheckoutSession = action({
  args: {
    bookingId: v.id("bookings"),
    requestKey: v.string(),
  },
  returns: v.object({ checkoutUrl: v.string(), sentTo: v.string() }),
  handler: async (ctx, args): Promise<{ checkoutUrl: string; sentTo: string }> => {
    const prepared = await ctx.runMutation(
      internal.stripeData.prepareBalanceCheckout,
      args,
    );
    const stripe = stripeClient();
    for (const sessionId of prepared.staleSessionIds) {
      try {
        await stripe.checkout.sessions.expire(sessionId);
      } catch {
        // A completed or already-expired session cannot be expired again.
      }
    }

    try {
      let session: Stripe.Checkout.Session;
      if (prepared.existingCheckoutSessionId) {
        session = await stripe.checkout.sessions.retrieve(
          prepared.existingCheckoutSessionId,
        );
      } else {
        const metadata = {
          bookingId: String(prepared.bookingId),
          bookingPaymentId: String(prepared.paymentId),
          paymentPurpose: "BALANCE",
        };
        session = await stripe.checkout.sessions.create(
          {
            mode: "payment",
            customer_email: prepared.customerEmail,
            client_reference_id: String(prepared.bookingId),
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: "aud",
                  unit_amount: prepared.balanceDueCents,
                  product_data: {
                    name: `${prepared.serviceName} remaining balance`,
                  },
                },
              },
            ],
            metadata,
            payment_intent_data: { metadata },
            success_url: `${publicAppUrl()}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${publicAppUrl()}/booking/success?payment=cancelled`,
            integration_identifier:
              process.env.STRIPE_INTEGRATION_IDENTIFIER?.trim() ||
              DEFAULT_INTEGRATION_IDENTIFIER,
          },
          { idempotencyKey: `booking-balance:${prepared.paymentId}` },
        );
      }
      if (!session.url) throw new Error("Stripe did not return a checkout URL.");

      if (!prepared.alreadySent) {
        await ctx.runMutation(internal.stripeData.saveBalanceCheckoutSession, {
          paymentId: prepared.paymentId,
          checkoutSessionId: session.id,
          sentTo: prepared.customerEmail,
        });
        await ctx.runAction(internal.emails.sendBookingPaymentLink, {
          bookingId: prepared.bookingId,
          customerId: prepared.customerId,
          to: prepared.customerEmail,
          customerFirstName: prepared.customerFirstName,
          serviceName: prepared.serviceName,
          scheduledDate: prepared.scheduledDate,
          address: prepared.address,
          revisedTotalCents: prepared.revisedTotalCents,
          amountPaidCents: prepared.amountPaidCents,
          balanceDueCents: prepared.balanceDueCents,
          checkoutUrl: session.url,
        });
      }
      return { checkoutUrl: session.url, sentTo: prepared.customerEmail };
    } catch (error) {
      await ctx.runMutation(internal.stripeData.markBalanceCheckoutFailed, {
        paymentId: prepared.paymentId,
      });
      console.error(
        "Unable to create balance Checkout session",
        error instanceof Error ? error.message : "Unknown Stripe error",
      );
      throw new Error("Unable to create and send the payment link. Please try again.");
    }
  },
});
