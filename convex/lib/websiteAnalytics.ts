import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export function normalizeAnalyticsSessionId(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    normalized,
  )
    ? normalized
    : undefined;
}

async function insertLifecycleEvent(
  ctx: MutationCtx,
  sessionId: string,
  eventType: "QUOTE_SUBMITTED" | "BOOKING_CREATED" | "PAYMENT_COMPLETED",
  page: string,
  metadata: Record<string, string | number | boolean>,
) {
  await ctx.db.insert("websiteEvents", {
    sessionId,
    eventType,
    page,
    metadata,
    createdAt: Date.now(),
  });
}

export async function linkWebsiteQuote(
  ctx: MutationCtx,
  rawSessionId: string | undefined,
  quoteId: Id<"quoteRequests">,
  customerId: Id<"customers">,
) {
  const sessionId = normalizeAnalyticsSessionId(rawSessionId);
  if (!sessionId) return;
  const session = await ctx.db
    .query("websiteSessions")
    .withIndex("by_session_id", (query) => query.eq("sessionId", sessionId))
    .unique();
  if (!session || (session.quoteId && session.quoteId !== quoteId)) return;
  if (session.quoteId === quoteId) return;
  const now = Date.now();
  await ctx.db.patch(session._id, {
    quoteId,
    customerId,
    lastSeenAt: now,
    updatedAt: now,
  });
  await insertLifecycleEvent(ctx, sessionId, "QUOTE_SUBMITTED", session.currentPage, {
    quoteId,
  });
}

export async function linkWebsiteBooking(
  ctx: MutationCtx,
  args: {
    sessionId?: string;
    quoteId?: Id<"quoteRequests">;
    bookingId: Id<"bookings">;
    customerId: Id<"customers">;
  },
) {
  const sessionId = normalizeAnalyticsSessionId(args.sessionId);
  const session = sessionId
    ? await ctx.db
        .query("websiteSessions")
        .withIndex("by_session_id", (query) => query.eq("sessionId", sessionId))
        .unique()
    : args.quoteId
      ? await ctx.db
          .query("websiteSessions")
          .withIndex("by_quote", (query) => query.eq("quoteId", args.quoteId))
          .first()
      : null;
  if (!session || (session.bookingId && session.bookingId !== args.bookingId)) return;
  if (session.bookingId === args.bookingId) return;
  const now = Date.now();
  await ctx.db.patch(session._id, {
    bookingId: args.bookingId,
    quoteId: args.quoteId ?? session.quoteId,
    customerId: args.customerId,
    lastSeenAt: now,
    updatedAt: now,
  });
  await insertLifecycleEvent(
    ctx,
    session.sessionId,
    "BOOKING_CREATED",
    session.currentPage,
    { bookingId: args.bookingId, ...(args.quoteId ? { quoteId: args.quoteId } : {}) },
  );
}

export async function recordWebsitePayment(
  ctx: MutationCtx,
  bookingId: Id<"bookings">,
  amountCents?: number,
) {
  const session = await ctx.db
    .query("websiteSessions")
    .withIndex("by_booking", (query) => query.eq("bookingId", bookingId))
    .first();
  if (!session) return;
  const existing = await ctx.db
    .query("websiteEvents")
    .withIndex("by_session", (query) => query.eq("sessionId", session.sessionId))
    .filter((query) => query.eq(query.field("eventType"), "PAYMENT_COMPLETED"))
    .first();
  if (existing) return;
  await insertLifecycleEvent(
    ctx,
    session.sessionId,
    "PAYMENT_COMPLETED",
    session.currentPage,
    { bookingId, ...(amountCents ? { amountCents } : {}) },
  );
}
