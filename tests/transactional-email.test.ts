import assert from "node:assert/strict";
import test from "node:test";
import type { ActionCtx } from "../convex/_generated/server";
import {
  bookingConfirmationEmail,
  bookingPaymentLinkEmail,
  quoteRequestReceivedEmail,
} from "../convex/emailTemplates";
import {
  sendTransactionalEmail,
  type DeliveryInput,
} from "../convex/lib/sendTransactionalEmail";

const deliveryInput = {
  type: "BOOKING_CONFIRMATION",
  to: "customer@example.com",
  subject: "Booking confirmed",
  html: "<p>Confirmed</p>",
  text: "Confirmed",
  customerId: "customer-id",
  bookingId: "booking-id",
} as unknown as DeliveryInput;

function fakeActionContext() {
  const mutationArgs: Array<Record<string, unknown>> = [];
  const ctx = {
    runMutation: async (
      _reference: unknown,
      args: Record<string, unknown>,
    ) => {
      mutationArgs.push(args);
      return mutationArgs.length === 1 ? "email-log-id" : null;
    },
  } as unknown as ActionCtx;
  return { ctx, mutationArgs };
}

function restoreApiKey(previousApiKey: string | undefined) {
  if (previousApiKey === undefined) {
    delete process.env.RESEND_API_KEY;
  } else {
    process.env.RESEND_API_KEY = previousApiKey;
  }
}

test("booking confirmation contains details and labels mock payment safely", () => {
  const email = bookingConfirmationEmail({
    customerFirstName: "Sam <script>",
    bookingReference: "booking-123",
    serviceName: "End of Lease Cleaning",
    scheduledDate: "2026-10-02",
    scheduledTime: "13:30",
    address: "1 Example Street, Sydney NSW 2000",
    totalAmountCents: 42000,
    amountPaidCents: 12000,
    paymentStatus: "DEPOSIT_PAID",
    developmentPayment: true,
  });

  assert.equal(email.subject, "Your We Do Cleaning booking is confirmed");
  assert.match(email.html, /booking-123/);
  assert.match(email.html, /\$420\.00/);
  assert.match(email.html, /\$300\.00/);
  assert.match(email.html, /test status only/);
  assert.doesNotMatch(email.html, /Sam <script>/);
});

test("callback and custom quote acknowledgements use the correct copy without pricing", () => {
  const callback = quoteRequestReceivedEmail({
    customerFirstName: "Alex",
    quoteReference: "quote-1",
    serviceName: "Office Cleaning",
    requestType: "CALLBACK_REQUEST",
  });
  const customQuote = quoteRequestReceivedEmail({
    customerFirstName: "Alex",
    quoteReference: "quote-2",
    serviceName: "Commercial Cleaning",
    requestType: "CUSTOM_QUOTE",
  });

  assert.equal(callback.subject, "We've received your callback request");
  assert.match(callback.text, /will contact you/);
  assert.equal(
    customQuote.subject,
    "We've received your cleaning quote request",
  );
  assert.match(customQuote.text, /review your request/);
  assert.doesNotMatch(`${callback.text}${customQuote.text}`, /\$|price|total/i);
});

test("balance payment email shows the revised payment snapshot and secure link", () => {
  const email = bookingPaymentLinkEmail({
    customerFirstName: "Sam",
    bookingReference: "booking-456",
    serviceName: "End of Lease Cleaning",
    scheduledDate: "2026-10-03",
    address: "1 Bligh Street, Sydney NSW 2000",
    revisedTotalCents: 55000,
    amountPaidCents: 15000,
    balanceDueCents: 40000,
    checkoutUrl: "https://checkout.stripe.com/example",
  });

  assert.equal(email.subject, "Your updated We Do Cleaning balance");
  assert.match(email.html, /booking-456/);
  assert.match(email.html, /\$550\.00/);
  assert.match(email.html, /\$400\.00/);
  assert.match(email.html, /checkout\.stripe\.com\/example/);
});

test("successful Resend response records the provider message ID", async () => {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "test-key";
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ id: "resend-message-id" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  const { ctx, mutationArgs } = fakeActionContext();

  try {
    await sendTransactionalEmail(ctx, deliveryInput);
    assert.equal(mutationArgs.length, 2);
    assert.equal(mutationArgs[1].providerMessageId, "resend-message-id");
    assert.equal(mutationArgs[1].emailLogId, "email-log-id");
  } finally {
    restoreApiKey(previousApiKey);
    globalThis.fetch = previousFetch;
  }
});

test("provider failure records a failed attempt without throwing", async () => {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "test-key";
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: "Provider rejected request" }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    });
  const { ctx, mutationArgs } = fakeActionContext();

  try {
    await sendTransactionalEmail(ctx, deliveryInput);
    assert.equal(mutationArgs.length, 2);
    assert.equal(mutationArgs[1].emailLogId, "email-log-id");
    assert.match(String(mutationArgs[1].errorMessage), /status 422/);
  } finally {
    restoreApiKey(previousApiKey);
    globalThis.fetch = previousFetch;
  }
});

test("missing API key records a failed attempt and never calls fetch", async () => {
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousFetch = globalThis.fetch;
  delete process.env.RESEND_API_KEY;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called");
  };
  const { ctx, mutationArgs } = fakeActionContext();

  try {
    await sendTransactionalEmail(ctx, deliveryInput);
    assert.equal(fetchCalled, false);
    assert.equal(mutationArgs.length, 2);
    assert.match(String(mutationArgs[1].errorMessage), /not configured/);
  } finally {
    restoreApiKey(previousApiKey);
    globalThis.fetch = previousFetch;
  }
});
