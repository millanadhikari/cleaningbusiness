# Stripe integration plan

## Scope

We Do Cleaning Services accepts one-time payments for end-of-lease,
residential, and commercial cleaning in Australia. The first Stripe phase
covers:

- full and deposit payments for website bookings;
- pay-later and custom commercial work through Stripe Invoicing;
- AUD payments in a dedicated Stripe sandbox during development;
- reconciliation back into Convex through verified webhooks.

It does not include subscriptions, Stripe Connect, marketplace payouts,
Terminal, or automatic tax calculation.

## Recommended Stripe products

### Website booking payments

Use Stripe-hosted Checkout Sessions in `payment` mode. The application creates
the amount from the server-side Convex estimate and redirects the customer to
Stripe. Do not accept a price supplied by the browser and do not pass
`payment_method_types`; payment methods remain configurable in Stripe.

Each Checkout Session should include:

- the Convex booking ID as `client_reference_id`;
- booking and customer IDs in metadata;
- a server-generated description of the service;
- `integration_identifier` for this checkout flow;
- a success URL containing `{CHECKOUT_SESSION_ID}`;
- a cancellation URL that returns to the booking flow.

The booking remains `PENDING_PAYMENT` until a verified Stripe webhook confirms
payment. The redirect success page is informational and must never confirm or
fulfil the booking by itself.

### Invoicing

Use the Invoicing API for admin-approved custom quotes and commercial or
pay-later work. The application creates the invoice from a business event, such
as an accepted quote or an admin choosing to invoice a confirmed booking.

Use:

- a Stripe Customer mapped to the Convex customer;
- customer-visible invoice item descriptions;
- invoice metadata for Convex customer, quote, and booking IDs;
- `send_invoice` collection with an explicit due date;
- Stripe's Hosted Invoice Page for customer payment;
- idempotency keys for customer, invoice item, invoice, finalization, and send
  operations.

Stripe can send the invoice email. The platform should store the hosted invoice
URL for authenticated admin access, but should not expose it through a public
lookup endpoint.

## Application data model

Extend `customers` with an optional `stripeCustomerId`.

Extend `bookings` with optional Stripe references:

- `stripeCheckoutSessionId`
- `stripePaymentIntentId`
- `stripeInvoiceId`
- `stripeInvoiceStatus`
- `stripeHostedInvoiceUrl`

Replace the development-only payment mode with explicit modes while retaining
the old value for existing development records:

- `DEVELOPMENT_MOCK`
- `STRIPE_CHECKOUT`
- `STRIPE_INVOICE`
- `PAY_LATER`

Add a small `stripeEvents` table keyed by Stripe event ID. It provides webhook
idempotency and records the event type and processing time. Do not store API
keys, webhook secrets, card data, Checkout payloads, or complete webhook bodies.

## Booking payment flow

1. The public booking mutation validates customer details and recalculates the
   estimate in Convex.
2. For `FULL` or `DEPOSIT`, it creates a `PENDING_PAYMENT` booking with
   `UNPAID` payment status.
3. A Convex action loads the amount from that booking and creates a hosted
   Checkout Session using an idempotency key derived from the booking ID.
4. The browser redirects to the returned Stripe URL.
5. The webhook verifies the Stripe signature and deduplicates the event ID.
6. `checkout.session.completed` and
   `checkout.session.async_payment_succeeded` confirm the booking only when
   `payment_status` is not `unpaid`.
7. Convex stores the PaymentIntent and Checkout Session IDs, sets `PAID` or
   `DEPOSIT_PAID`, and schedules the existing booking confirmation email.
8. `checkout.session.async_payment_failed` and
   `checkout.session.expired` leave the booking unconfirmed and available for a
   safe retry.

`PAY_LATER` bookings bypass Checkout and can be confirmed without claiming that
money was collected.

## Invoice flow

1. An authenticated `ADMIN` or `SUPER_ADMIN` starts invoice creation for an
   eligible booking or accepted quote.
2. A Convex action checks authorization and loads all amounts from Convex.
3. It creates or reuses the Stripe Customer.
4. It creates the invoice and invoice item with deterministic idempotency keys.
5. Stripe finalizes and sends the invoice, returning its hosted invoice URL.
6. Convex stores the Stripe invoice ID, URL, and current status.
7. Verified invoice webhooks keep Convex synchronized.

## Webhook events

Required for booking payments:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

Required for invoices and reconciliation:

- `invoice.finalized`
- `invoice.sent`
- `invoice.paid`
- `invoice.payment_failed`
- `invoice.voided`
- `charge.refunded`
- `credit_note.created`

Every request must be verified with the endpoint-specific webhook signing
secret before parsing or processing the event.

## Secrets and configuration

Configure these in the Convex deployment, never as `NEXT_PUBLIC_` variables:

- `STRIPE_API_KEY` — prefer a least-privilege restricted sandbox key (`rk_`)
- `STRIPE_WEBHOOK_SECRET`
- `PUBLIC_APP_URL` — `http://localhost:3000` locally and the public application
  origin in deployed environments
- `STRIPE_INTEGRATION_IDENTIFIER` — a stable label with an eight-letter random
  suffix for the hosted Checkout flow

Use separate keys and webhook secrets for development, CI, and production.
Never log them or include raw Stripe errors in public responses.

For the local Convex deployment, forward only the Checkout events used by the
handler:

```powershell
stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired --forward-to http://127.0.0.1:3211/stripe/webhook
```

Copy the `whsec_...` value printed by that command into Convex:

```powershell
npx convex env set STRIPE_WEBHOOK_SECRET whsec_your_local_secret
```

Keep the listener running while completing sandbox payments. A deployed
environment instead needs a Stripe Workbench event destination pointing to its
public Convex HTTP URL plus `/stripe/webhook`.

The restricted key needs only the Stripe resources used by this integration,
including Checkout Sessions, Customers, Invoices, Invoice Items, and read access
to related PaymentIntents. Add Refunds write access only when refund controls
are implemented.

## Tax and Australian GST

Do not enable `automatic_tax` until We Do Cleaning has confirmed its GST
registration and the intended tax-inclusive or tax-exclusive pricing model.
Enabling Stripe Tax without the required registration can leave tax
uncollected without producing an integration error.

## Testing and rollout

1. Build and test only against the connected Stripe sandbox.
2. Test full payment, deposit, pay-later, cancellation, decline, 3DS, delayed
   success, expired Checkout, duplicate webhooks, invoice payment failure,
   refund, and credit note reconciliation.
3. Confirm no booking becomes paid from the success page alone.
4. Confirm duplicate webhook delivery does not duplicate emails, invoices, or
   state transitions.
5. Confirm public callers cannot choose an arbitrary amount or invoice another
   customer's booking.
6. Run TypeScript, lint, Convex code generation, and focused payment tests.
7. Complete Stripe branding and receipt/invoice email settings in the sandbox.
8. Repeat the configuration with separate restricted live credentials only
   after sandbox acceptance.

## Delivery phases

### Phase 1 — Checkout foundation

- install the current Stripe Node SDK;
- add server-only configuration helpers;
- create pending bookings and hosted Checkout Sessions;
- add the signed Convex webhook endpoint and event deduplication;
- replace the mock card form with a redirect to Stripe;
- send booking confirmation only after confirmed payment.

### Phase 2 — Invoicing

- add Stripe Customer mapping;
- create invoices from authenticated admin actions;
- expose invoice status and hosted URL on booking detail;
- reconcile paid, failed, voided, refunded, and credited states.

### Phase 3 — Production readiness

- complete GST/tax configuration if applicable;
- test refunds and operational recovery procedures;
- configure production event destinations and restricted keys;
- complete the Stripe go-live checklist and sandbox-to-live validation.
