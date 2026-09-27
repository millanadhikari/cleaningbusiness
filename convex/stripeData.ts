import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireRole } from "./lib/auth";
import {
  calculateQuotePaymentAmount,
  convertAcceptedQuoteRecord,
} from "./quoteRequests";

export const prepareCheckout = internalQuery({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, { bookingId }) => {
    const booking = await ctx.db.get(bookingId);
    if (!booking) throw new Error("Booking not found.");
    if (
      booking.source !== "WEBSITE" ||
      booking.status !== "PENDING_PAYMENT" ||
      booking.paymentMode !== "STRIPE_CHECKOUT" ||
      booking.paymentOption === "PAY_LATER"
    ) {
      throw new Error("This booking is not awaiting an online payment.");
    }

    const [customer, service] = await Promise.all([
      ctx.db.get(booking.customerId),
      ctx.db.get(booking.serviceId),
    ]);
    if (!customer || !service) throw new Error("Booking details are incomplete.");

    const amountCents =
      booking.paymentOption === "DEPOSIT"
        ? booking.depositAmountCents
        : booking.finalTotalCents;
    if (!amountCents || amountCents < 50) {
      throw new Error("The payment amount is invalid.");
    }

    return {
      bookingId: booking._id,
      bookingReference: booking.reference ?? String(booking._id),
      customerId: customer._id,
      customerEmail: customer.email,
      serviceName: service.name,
      paymentOption: booking.paymentOption,
      amountCents,
    };
  },
});

export const saveCheckoutSession = internalMutation({
  args: {
    bookingId: v.id("bookings"),
    checkoutSessionId: v.string(),
    amountCents: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.paymentMode !== "STRIPE_CHECKOUT") {
      throw new Error("Booking is not eligible for Stripe Checkout.");
    }
    if (
      booking.stripeCheckoutSessionId &&
      booking.stripeCheckoutSessionId !== args.checkoutSessionId
    ) {
      throw new Error("A different checkout session already exists.");
    }
    await ctx.db.patch(booking._id, {
      stripeCheckoutSessionId: args.checkoutSessionId,
      updatedAt: Date.now(),
    });
    const requestKey = `initial:${booking._id}`;
    const existingPayment = await ctx.db
      .query("bookingPayments")
      .withIndex("by_request_key", (index) => index.eq("requestKey", requestKey))
      .unique();
    if (!existingPayment) {
      const now = Date.now();
      await ctx.db.insert("bookingPayments", {
        bookingId: booking._id,
        kind: "INITIAL",
        status: "PENDING",
        amountCents: args.amountCents,
        requestKey,
        paymentMethod: "STRIPE",
        checkoutSessionId: args.checkoutSessionId,
        createdAt: now,
        updatedAt: now,
      });
    }
    return null;
  },
});

export const prepareBalanceCheckout = internalMutation({
  args: {
    bookingId: v.id("bookings"),
    requestKey: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const requestKey = args.requestKey.trim();
    if (!/^[0-9a-f-]{36}$/i.test(requestKey)) {
      throw new Error("The payment request identifier is invalid.");
    }
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found.");
    if (booking.status !== "CONFIRMED") {
      throw new Error("Only confirmed bookings can receive a balance link.");
    }
    const [customer, service, payments, adjustments] = await Promise.all([
      ctx.db.get(booking.customerId),
      ctx.db.get(booking.serviceId),
      ctx.db
        .query("bookingPayments")
        .withIndex("by_booking_and_created_at", (index) =>
          index.eq("bookingId", booking._id),
        )
        .collect(),
      ctx.db
        .query("bookingAdjustments")
        .withIndex("by_booking_and_created_at", (index) =>
          index.eq("bookingId", booking._id),
        )
        .collect(),
    ]);
    if (!customer?.email) throw new Error("Add a customer email before sending a payment link.");
    if (!service) throw new Error("Booking service not found.");

    const existing = await ctx.db
      .query("bookingPayments")
      .withIndex("by_request_key", (index) => index.eq("requestKey", requestKey))
      .unique();
    const adjustmentsTotal = adjustments.reduce(
      (total, adjustment) => total + adjustment.amountCents,
      0,
    );
    const hasInitialRecord = payments.some((payment) => payment.kind === "INITIAL");
    const legacyPaid = booking.paymentLedgerInitializedAt || hasInitialRecord
      ? 0
      : booking.paymentStatus === "PAID"
        ? (booking.estimatedTotalCents ?? booking.finalTotalCents - adjustmentsTotal)
        : booking.paymentStatus === "DEPOSIT_PAID"
          ? (booking.depositAmountCents ?? 0)
          : 0;
    const amountPaidCents =
      legacyPaid +
      payments
        .filter((payment) => payment.status === "PAID")
        .reduce((total, payment) => total + payment.amountCents, 0);
    const balanceDueCents = Math.max(0, booking.finalTotalCents - amountPaidCents);
    if (balanceDueCents < 50) throw new Error("There is no payable balance on this booking.");

    const authorName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.email ||
      "Admin";
    const now = Date.now();
    if (!booking.paymentLedgerInitializedAt && !hasInitialRecord) {
      if (legacyPaid > 0) {
        await ctx.db.insert("bookingPayments", {
          bookingId: booking._id,
          kind: "INITIAL",
          status: "PAID",
          amountCents: legacyPaid,
          requestKey: `legacy-initial:${booking._id}`,
          paymentMethod: "STRIPE",
          paymentIntentId: booking.stripePaymentIntentId,
          paidAt: booking.updatedAt,
          createdAt: booking.createdAt,
          updatedAt: now,
        });
      }
      await ctx.db.patch(booking._id, { paymentLedgerInitializedAt: now });
    }
    let paymentId = existing?._id;
    if (!paymentId) {
      paymentId = await ctx.db.insert("bookingPayments", {
        bookingId: booking._id,
        kind: "BALANCE",
        status: "PENDING",
        amountCents: balanceDueCents,
        requestKey,
        paymentMethod: "STRIPE",
        createdByUserId: user._id,
        createdByName: authorName,
        createdAt: now,
        updatedAt: now,
      });
    }

    const staleSessionIds: string[] = [];
    for (const payment of payments) {
      if (
        payment.kind === "BALANCE" &&
        payment.status === "PENDING" &&
        payment._id !== paymentId
      ) {
        if (payment.checkoutSessionId) staleSessionIds.push(payment.checkoutSessionId);
        await ctx.db.patch(payment._id, { status: "EXPIRED", updatedAt: Date.now() });
      }
    }

    return {
      paymentId,
      existingCheckoutSessionId: existing?.checkoutSessionId,
      alreadySent: Boolean(existing?.sentAt),
      staleSessionIds,
      bookingId: booking._id,
      bookingReference: booking.reference ?? String(booking._id),
      customerId: customer._id,
      customerEmail: customer.email,
      customerFirstName: customer.firstName,
      serviceName: service.name,
      scheduledDate: booking.scheduledDate,
      address: [
        booking.addressLine1,
        booking.addressLine2,
        `${booking.suburb} ${booking.state} ${booking.postcode}`,
      ]
        .filter(Boolean)
        .join(", "),
      revisedTotalCents: booking.finalTotalCents,
      amountPaidCents,
      balanceDueCents,
    };
  },
});

export const saveBalanceCheckoutSession = internalMutation({
  args: {
    paymentId: v.id("bookingPayments"),
    checkoutSessionId: v.string(),
    sentTo: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Payment request not found.");
    const now = Date.now();
    await ctx.db.patch(payment._id, {
      checkoutSessionId: args.checkoutSessionId,
      sentTo: args.sentTo,
      sentAt: now,
      updatedAt: now,
    });
    if (payment.createdByUserId && payment.createdByName) {
      await ctx.db.insert("bookingNotes", {
        bookingId: payment.bookingId,
        authorUserId: payment.createdByUserId,
        authorName: payment.createdByName,
        kind: "ADMIN_NOTE",
        body: `Payment link generated and email requested for ${args.sentTo} for ${new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(payment.amountCents / 100)}.`,
        createdAt: now,
      });
    }
    return null;
  },
});

export const markBalanceCheckoutFailed = internalMutation({
  args: { paymentId: v.id("bookingPayments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (payment && payment.status === "PENDING") {
      await ctx.db.patch(payment._id, { status: "FAILED", updatedAt: Date.now() });
    }
    return null;
  },
});

export const prepareQuoteCheckout = internalMutation({
  args: {
    quoteRequestId: v.id("quoteRequests"),
    paymentOption: v.union(v.literal("DEPOSIT"), v.literal("FULL")),
    requestKey: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    if (!/^[0-9a-f-]{36}$/i.test(args.requestKey.trim())) {
      throw new Error("The payment request identifier is invalid.");
    }
    const quote = await ctx.db.get(args.quoteRequestId);
    if (!quote) throw new Error("Quote not found.");
    if (quote.status !== "ACCEPTED") {
      throw new Error("Mark the quote as accepted before requesting payment.");
    }
    if (quote.convertedBookingId) {
      throw new Error("This quote has already been converted to a booking.");
    }
    if (!quote.serviceId || quote.estimatedTotalCents === undefined) {
      throw new Error("The quote does not have a payable total.");
    }
    if (!quote.preferredDate || !quote.preferredTime) {
      throw new Error("Add a scheduled date and time before requesting payment.");
    }
    const [customer, service, existing, previousPayments] = await Promise.all([
      ctx.db.get(quote.customerId),
      ctx.db.get(quote.serviceId),
      ctx.db
        .query("quotePayments")
        .withIndex("by_request_key", (index) =>
          index.eq("requestKey", args.requestKey.trim()),
        )
        .unique(),
      ctx.db
        .query("quotePayments")
        .withIndex("by_quote_and_created_at", (index) =>
          index.eq("quoteRequestId", quote._id),
        )
        .collect(),
    ]);
    if (!customer?.email) {
      throw new Error("Add a customer email before sending a payment link.");
    }
    if (!service) throw new Error("The selected service no longer exists.");
    const amountCents = calculateQuotePaymentAmount(
      service,
      quote.estimatedTotalCents,
      args.paymentOption,
    );
    if (amountCents < 50) throw new Error("The payment amount is invalid.");
    const now = Date.now();
    const createdByName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.email ||
      "Admin";
    const paymentId =
      existing?._id ??
      (await ctx.db.insert("quotePayments", {
        quoteRequestId: quote._id,
        paymentOption: args.paymentOption,
        status: "PENDING",
        amountCents,
        requestKey: args.requestKey.trim(),
        createdByUserId: user._id,
        createdByName,
        createdAt: now,
        updatedAt: now,
      }));

    const staleSessionIds: string[] = [];
    for (const payment of previousPayments) {
      if (payment.status === "PENDING" && payment._id !== paymentId) {
        if (payment.checkoutSessionId) staleSessionIds.push(payment.checkoutSessionId);
        await ctx.db.patch(payment._id, { status: "EXPIRED", updatedAt: now });
      }
    }
    return {
      paymentId,
      existingCheckoutSessionId: existing?.checkoutSessionId,
      alreadySent: Boolean(existing?.sentAt),
      staleSessionIds,
      quoteRequestId: quote._id,
      quoteReference: quote.reference ?? String(quote._id),
      customerId: customer._id,
      customerEmail: customer.email,
      customerFirstName: customer.firstName,
      serviceName: service.name,
      scheduledDate: quote.preferredDate,
      address: [
        quote.addressLine1,
        quote.addressLine2,
        `${quote.suburb} ${quote.state} ${quote.postcode}`,
      ]
        .filter(Boolean)
        .join(", "),
      totalAmountCents: quote.estimatedTotalCents,
      amountCents,
      paymentOption: args.paymentOption,
    };
  },
});

export const saveQuoteCheckoutSession = internalMutation({
  args: {
    paymentId: v.id("quotePayments"),
    checkoutSessionId: v.string(),
    sentTo: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Quote payment request not found.");
    const now = Date.now();
    await ctx.db.patch(payment._id, {
      checkoutSessionId: args.checkoutSessionId,
      sentTo: args.sentTo,
      sentAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const markQuoteCheckoutFailed = internalMutation({
  args: { paymentId: v.id("quotePayments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (payment?.status === "PENDING") {
      await ctx.db.patch(payment._id, { status: "FAILED", updatedAt: Date.now() });
    }
    return null;
  },
});

export const processCheckoutEvent = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    checkoutSessionId: v.string(),
    paymentStatus: v.string(),
    paymentIntentId: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
  },
  returns: v.object({ duplicate: v.boolean(), bookingFound: v.boolean() }),
  handler: async (ctx, args) => {
    const existingEvent = await ctx.db
      .query("stripeEvents")
      .withIndex("by_event_id", (index) => index.eq("eventId", args.eventId))
      .unique();
    if (existingEvent) return { duplicate: true, bookingFound: true };

    const confirmsPayment =
      (args.eventType === "checkout.session.completed" ||
        args.eventType === "checkout.session.async_payment_succeeded") &&
      args.paymentStatus !== "unpaid";
    const quotePayment = await ctx.db
      .query("quotePayments")
      .withIndex("by_checkout_session", (index) =>
        index.eq("checkoutSessionId", args.checkoutSessionId),
      )
      .unique();
    if (quotePayment) {
      let bookingId: Id<"bookings"> | undefined;
      if (confirmsPayment) {
        const now = Date.now();
        await ctx.db.patch(quotePayment._id, {
          status: "PAID",
          paymentIntentId: args.paymentIntentId,
          paidAt: now,
          updatedAt: now,
        });
        bookingId = await convertAcceptedQuoteRecord(ctx, {
          quoteRequestId: quotePayment.quoteRequestId,
          paymentOption: quotePayment.paymentOption,
          paymentMode: "STRIPE_CHECKOUT",
          amountPaidCents: quotePayment.amountCents,
          paymentMethod: "STRIPE",
          paymentIntentId: args.paymentIntentId,
          checkoutSessionId: args.checkoutSessionId,
          paymentRequestKey: `quote-payment:${quotePayment._id}`,
        });
      } else if (
        args.eventType === "checkout.session.async_payment_failed" ||
        args.eventType === "checkout.session.expired"
      ) {
        await ctx.db.patch(quotePayment._id, {
          status:
            args.eventType === "checkout.session.expired" ? "EXPIRED" : "FAILED",
          updatedAt: Date.now(),
        });
      }
      await ctx.db.insert("stripeEvents", {
        eventId: args.eventId,
        eventType: args.eventType,
        status:
          confirmsPayment ||
          args.eventType === "checkout.session.async_payment_failed" ||
          args.eventType === "checkout.session.expired"
            ? "PROCESSED"
            : "IGNORED",
        checkoutSessionId: args.checkoutSessionId,
        bookingId,
        quoteRequestId: quotePayment.quoteRequestId,
        createdAt: Date.now(),
      });
      return { duplicate: false, bookingFound: Boolean(bookingId) };
    }

    const payment = await ctx.db
      .query("bookingPayments")
      .withIndex("by_checkout_session", (index) =>
        index.eq("checkoutSessionId", args.checkoutSessionId),
      )
      .unique();
    const booking = payment
      ? await ctx.db.get(payment.bookingId)
      : await ctx.db
          .query("bookings")
          .withIndex("by_stripe_checkout_session_id", (index) =>
            index.eq("stripeCheckoutSessionId", args.checkoutSessionId),
          )
          .unique();
    if (!booking) {
      await ctx.db.insert("stripeEvents", {
        eventId: args.eventId,
        eventType: args.eventType,
        status: "IGNORED",
        checkoutSessionId: args.checkoutSessionId,
        createdAt: Date.now(),
      });
      return { duplicate: false, bookingFound: false };
    }

    const wasPendingPayment = booking.status === "PENDING_PAYMENT";

    if (confirmsPayment) {
      if (payment) {
        await ctx.db.patch(payment._id, {
          status: "PAID",
          paymentIntentId: args.paymentIntentId,
          paidAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      const [allPayments, adjustments] = await Promise.all([
        ctx.db
          .query("bookingPayments")
          .withIndex("by_booking_and_created_at", (index) =>
            index.eq("bookingId", booking._id),
          )
          .collect(),
        ctx.db
          .query("bookingAdjustments")
          .withIndex("by_booking_and_created_at", (index) =>
            index.eq("bookingId", booking._id),
          )
          .collect(),
      ]);
      const adjustmentsTotal = adjustments.reduce(
        (total, adjustment) => total + adjustment.amountCents,
        0,
      );
      const hasInitialRecord = allPayments.some((item) => item.kind === "INITIAL");
      const legacyPaid = booking.paymentLedgerInitializedAt || hasInitialRecord
        ? 0
        : booking.paymentStatus === "PAID"
          ? (booking.estimatedTotalCents ?? booking.finalTotalCents - adjustmentsTotal)
          : booking.paymentStatus === "DEPOSIT_PAID"
            ? (booking.depositAmountCents ?? 0)
            : 0;
      const recordedPaid = allPayments
        .filter((item) => item.status === "PAID" || item._id === payment?._id)
        .reduce((total, item) => total + item.amountCents, 0);
      const amountPaidCents = legacyPaid + recordedPaid;
      const paymentStatus =
        amountPaidCents >= booking.finalTotalCents
          ? ("PAID" as const)
          : ("DEPOSIT_PAID" as const);
      await ctx.db.patch(booking._id, {
        status: "CONFIRMED",
        paymentStatus,
        stripePaymentIntentId: args.paymentIntentId,
        updatedAt: Date.now(),
      });
      if (args.stripeCustomerId) {
        await ctx.db.patch(booking.customerId, {
          stripeCustomerId: args.stripeCustomerId,
          updatedAt: Date.now(),
        });
      }

      if (booking.quoteRequestId) {
        await ctx.db.patch(booking.quoteRequestId, {
          status: "ACCEPTED",
          updatedAt: Date.now(),
        });
      }

      if (wasPendingPayment) {
        const [customer, service] = await Promise.all([
          ctx.db.get(booking.customerId),
          ctx.db.get(booking.serviceId),
        ]);
        if (customer?.email && service) {
          await ctx.scheduler.runAfter(
            0,
            internal.emails.sendBookingConfirmation,
            {
              bookingId: booking._id,
              bookingReference: booking.reference ?? String(booking._id),
              customerId: booking.customerId,
              to: customer.email,
              customerFirstName: customer.firstName,
              serviceName: service.name,
              scheduledDate: booking.scheduledDate,
              scheduledTime: booking.scheduledTime,
              address: [
                booking.addressLine1,
                booking.addressLine2,
                `${booking.suburb} ${booking.state} ${booking.postcode}`,
              ]
                .filter(Boolean)
                .join(", "),
              totalAmountCents: booking.finalTotalCents,
              amountPaidCents:
                amountPaidCents,
              paymentStatus,
              developmentPayment: false,
            },
          );
        }
      }
    }

    if (
      args.eventType === "checkout.session.async_payment_failed" ||
      args.eventType === "checkout.session.expired"
    ) {
      if (payment) {
        await ctx.db.patch(payment._id, {
          status:
            args.eventType === "checkout.session.expired" ? "EXPIRED" : "FAILED",
          updatedAt: Date.now(),
        });
      }
      if (!payment || payment.kind === "INITIAL") {
        await ctx.db.patch(booking._id, {
          status: "CANCELLED",
          updatedAt: Date.now(),
        });
      }
      if ((!payment || payment.kind === "INITIAL") && booking.quoteRequestId) {
        await ctx.db.patch(booking.quoteRequestId, {
          status:
            args.eventType === "checkout.session.expired"
              ? "EXPIRED"
              : "DECLINED",
          updatedAt: Date.now(),
        });
      }
    }

    await ctx.db.insert("stripeEvents", {
      eventId: args.eventId,
      eventType: args.eventType,
      status:
        confirmsPayment ||
        args.eventType === "checkout.session.async_payment_failed" ||
        args.eventType === "checkout.session.expired"
          ? "PROCESSED"
          : "IGNORED",
      checkoutSessionId: args.checkoutSessionId,
      bookingId: booking._id,
      createdAt: Date.now(),
    });
    return { duplicate: false, bookingFound: true };
  },
});
