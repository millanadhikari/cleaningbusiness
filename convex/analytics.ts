import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireSuperAdmin } from "./lib/auth";

const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

function validateRange(from: number, to: number) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
    throw new Error("Select a valid analytics date range.");
  }
  if (to - from > MAX_RANGE_MS) {
    throw new Error("Analytics ranges are limited to 366 days.");
  }
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 100 : 0;
}

function sourceLabel(session: {
  source?: string;
  medium?: string;
  referrer?: string;
}) {
  if (session.source) {
    const source = session.source.toLowerCase();
    if (source.includes("google") && session.medium?.toLowerCase() === "cpc") return "Google Ads";
    if (source.includes("google")) return "Organic Search";
    if (source.includes("facebook") || source.includes("instagram") || source.includes("meta")) {
      return "Social";
    }
    return session.source.slice(0, 40);
  }
  if (!session.referrer) return "Direct";
  try {
    const host = new URL(session.referrer).hostname.replace(/^www\./, "");
    if (host.includes("google.")) return "Organic Search";
    if (host.includes("facebook.") || host.includes("instagram.")) return "Social";
    return `Referral: ${host}`;
  } catch {
    return "Referral";
  }
}

function dayKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export const overview = query({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    validateRange(args.from, args.to);
    const now = Date.now();
    const [sessions, events, quotes, bookings, paidPayments, liveSessions, services] =
      await Promise.all([
        ctx.db
          .query("websiteSessions")
          .withIndex("by_created_at", (index) =>
            index.gte("createdAt", args.from).lt("createdAt", args.to),
          )
          .collect(),
        ctx.db
          .query("websiteEvents")
          .withIndex("by_created_at", (index) =>
            index.gte("createdAt", args.from).lt("createdAt", args.to),
          )
          .collect(),
        ctx.db
          .query("quoteRequests")
          .withIndex("by_created_at", (index) =>
            index.gte("createdAt", args.from).lt("createdAt", args.to),
          )
          .collect(),
        ctx.db
          .query("bookings")
          .withIndex("by_created_at", (index) =>
            index.gte("createdAt", args.from).lt("createdAt", args.to),
          )
          .collect(),
        ctx.db
          .query("bookingPayments")
          .withIndex("by_paid_at", (index) =>
            index.gte("paidAt", args.from).lt("paidAt", args.to),
          )
          .filter((filter) => filter.eq(filter.field("status"), "PAID"))
          .collect(),
        ctx.db
          .query("websiteSessions")
          .withIndex("by_last_seen", (index) => index.gte("lastSeenAt", now - 5 * 60_000))
          .collect(),
        ctx.db.query("services").collect(),
      ]);

    const sessionIdsByEvent = new Map<string, Set<string>>();
    for (const event of events) {
      const values = sessionIdsByEvent.get(event.eventType) ?? new Set<string>();
      values.add(event.sessionId);
      sessionIdsByEvent.set(event.eventType, values);
    }
    const quoteSessionIds = new Set(
      sessions.filter((session) => session.quoteId).map((session) => session.sessionId),
    );
    const bookingSessionIds = new Set(
      sessions.filter((session) => session.bookingId).map((session) => session.sessionId),
    );
    const paidBookingIds = new Set(paidPayments.map((payment) => String(payment.bookingId)));
    const paidSessionIds = new Set(
      sessions
        .filter((session) => session.bookingId && paidBookingIds.has(String(session.bookingId)))
        .map((session) => session.sessionId),
    );
    const collectedRevenueCents = paidPayments.reduce(
      (total, payment) => total + payment.amountCents,
      0,
    );
    const paidBookings = paidBookingIds.size;

    const bookingPaymentTotals = new Map<string, number>();
    await Promise.all(
      bookings.map(async (booking) => {
        const payments = await ctx.db
          .query("bookingPayments")
          .withIndex("by_booking_and_created_at", (index) => index.eq("bookingId", booking._id))
          .collect();
        bookingPaymentTotals.set(
          String(booking._id),
          payments
            .filter((payment) => payment.status === "PAID")
            .reduce((total, payment) => total + payment.amountCents, 0),
        );
      }),
    );
    const outstandingCents = bookings.reduce(
      (total, booking) =>
        total +
        Math.max(0, booking.finalTotalCents - (bookingPaymentTotals.get(String(booking._id)) ?? 0)),
      0,
    );

    const bookingById = new Map(bookings.map((booking) => [String(booking._id), booking]));
    const serviceById = new Map(services.map((service) => [String(service._id), service.name]));
    const serviceStats = new Map<string, { service: string; bookings: number; revenueCents: number }>();
    for (const booking of bookings) {
      const key = String(booking.serviceId);
      const current = serviceStats.get(key) ?? {
        service: serviceById.get(key) ?? "Unknown service",
        bookings: 0,
        revenueCents: 0,
      };
      current.bookings += 1;
      serviceStats.set(key, current);
    }
    for (const payment of paidPayments) {
      const booking = bookingById.get(String(payment.bookingId)) ?? (await ctx.db.get(payment.bookingId));
      if (!booking) continue;
      const key = String(booking.serviceId);
      const current = serviceStats.get(key) ?? {
        service: serviceById.get(key) ?? "Unknown service",
        bookings: 0,
        revenueCents: 0,
      };
      current.revenueCents += payment.amountCents;
      serviceStats.set(key, current);
    }

    const attribution = new Map<
      string,
      { source: string; visitors: number; quotes: number; bookings: number; paid: number; revenueCents: number }
    >();
    const paymentByBooking = new Map<string, number>();
    for (const payment of paidPayments) {
      const key = String(payment.bookingId);
      paymentByBooking.set(key, (paymentByBooking.get(key) ?? 0) + payment.amountCents);
    }
    for (const session of sessions) {
      const source = sourceLabel(session);
      const current = attribution.get(source) ?? {
        source,
        visitors: 0,
        quotes: 0,
        bookings: 0,
        paid: 0,
        revenueCents: 0,
      };
      current.visitors += 1;
      if (session.quoteId) current.quotes += 1;
      if (session.bookingId) {
        current.bookings += 1;
        const revenue = paymentByBooking.get(String(session.bookingId)) ?? 0;
        if (revenue > 0) current.paid += 1;
        current.revenueCents += revenue;
      }
      attribution.set(source, current);
    }

    const pageViews = sessionIdsByEvent.get("PAGE_VIEW")?.size ?? 0;
    const quoteStarted = sessionIdsByEvent.get("QUOTE_STARTED")?.size ?? 0;
    const quoteSubmitted = new Set([
      ...(sessionIdsByEvent.get("QUOTE_SUBMITTED") ?? []),
      ...quoteSessionIds,
    ]).size;
    const bookingStarted = sessionIdsByEvent.get("BOOKING_STARTED")?.size ?? 0;
    const bookingCreated = new Set([
      ...(sessionIdsByEvent.get("BOOKING_CREATED") ?? []),
      ...bookingSessionIds,
    ]).size;
    const paymentStarted = sessionIdsByEvent.get("PAYMENT_STARTED")?.size ?? 0;
    const paymentCompleted = new Set([
      ...(sessionIdsByEvent.get("PAYMENT_COMPLETED") ?? []),
      ...paidSessionIds,
    ]).size;

    const daily = new Map<string, { date: string; bookings: number; revenueCents: number }>();
    for (const booking of bookings) {
      const date = dayKey(booking.createdAt);
      const current = daily.get(date) ?? { date, bookings: 0, revenueCents: 0 };
      current.bookings += 1;
      daily.set(date, current);
    }
    for (const payment of paidPayments) {
      const date = dayKey(payment.paidAt ?? payment.createdAt);
      const current = daily.get(date) ?? { date, bookings: 0, revenueCents: 0 };
      current.revenueCents += payment.amountCents;
      daily.set(date, current);
    }

    return {
      kpis: {
        visitors: sessions.length,
        liveVisitors: liveSessions.length,
        quotes: quotes.length,
        bookings: bookings.length,
        paidBookings,
        collectedRevenueCents,
        averageBookingValueCents: bookings.length
          ? Math.round(bookings.reduce((sum, booking) => sum + booking.finalTotalCents, 0) / bookings.length)
          : 0,
        visitorToQuotePercent: percent(quoteSubmitted, sessions.length),
        quoteToBookingPercent: percent(bookingCreated, quoteSubmitted),
        visitorToPaidPercent: percent(paymentCompleted, sessions.length),
      },
      funnel: [
        { label: "Visitors", value: sessions.length },
        { label: "Page viewers", value: pageViews },
        { label: "Quote started", value: quoteStarted },
        { label: "Quote submitted", value: quoteSubmitted },
        { label: "Booking started", value: bookingStarted },
        { label: "Booking created", value: bookingCreated },
        { label: "Payment started", value: paymentStarted },
        { label: "Payment completed", value: paymentCompleted },
      ],
      traffic: {
        sources: Array.from(attribution.values()).sort((a, b) => b.visitors - a.visitors),
        referrers: Object.entries(
          sessions.reduce<Record<string, number>>((result, session) => {
            if (!session.referrer) return result;
            try {
              const key = new URL(session.referrer).hostname.replace(/^www\./, "");
              result[key] = (result[key] ?? 0) + 1;
            } catch {
              result.Referral = (result.Referral ?? 0) + 1;
            }
            return result;
          }, {}),
        )
          .map(([label, value]) => ({ label, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 6),
        devices: Object.entries(
          sessions.reduce<Record<string, number>>((result, session) => {
            const key = session.deviceType ?? "Unknown";
            result[key] = (result[key] ?? 0) + 1;
            return result;
          }, {}),
        ).map(([label, value]) => ({ label, value })),
        landingPages: Object.entries(
          sessions.reduce<Record<string, number>>((result, session) => {
            result[session.landingPage] = (result[session.landingPage] ?? 0) + 1;
            return result;
          }, {}),
        )
          .map(([label, value]) => ({ label, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 8),
      },
      business: {
        outstandingCents,
        topServices: Array.from(serviceStats.values())
          .sort((a, b) => b.revenueCents - a.revenueCents || b.bookings - a.bookings)
          .slice(0, 8),
        daily: Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date)),
      },
      attribution: Array.from(attribution.values())
        .map((row) => ({
          ...row,
          visitorToQuotePercent: percent(row.quotes, row.visitors),
          quoteToBookingPercent: percent(row.bookings, row.quotes),
          visitorToPaidPercent: percent(row.paid, row.visitors),
        }))
        .sort((a, b) => b.revenueCents - a.revenueCents || b.visitors - a.visitors),
    };
  },
});
