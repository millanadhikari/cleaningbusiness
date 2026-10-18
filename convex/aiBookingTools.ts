import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { activeService } from "./aiTools";
import { listPublicSlots, ensurePublicSlotAvailable } from "./availability";
import { assessPostcode } from "./serviceAreas";
import { normalizeEmail, normalizePhone, validateSchedule } from "./bookings";

const VERIFICATION_TTL_MS = 20 * 60_000;
const VERIFICATION_WINDOW_MS = 15 * 60_000;
const VERIFICATION_COOLDOWN_MS = 30 * 60_000;
const MAX_VERIFICATION_ATTEMPTS = 5;
const AVAILABILITY_WINDOW_MS = 5 * 60_000;
const MAX_AVAILABILITY_CHECKS = 10;

function validSessionId(value: string) {
  const id = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Invalid chat session.");
  }
  return id;
}

function cleanPage(value: string) {
  const page = value.trim().slice(0, 300);
  return page.startsWith("/") && !page.startsWith("//") ? page.split("#", 1)[0] || "/" : "/";
}

async function chatSession(ctx: MutationCtx, value: string) {
  const session = await ctx.db.query("chatSessions").withIndex("by_session_id", (q) => q.eq("sessionId", validSessionId(value))).unique();
  if (!session || session.status !== "ACTIVE") throw new Error("Active chat session not found.");
  return session;
}

async function track(ctx: MutationCtx, session: Doc<"chatSessions">, eventType: Doc<"websiteEvents">["eventType"], page: string) {
  if (!session.websiteSessionId) return;
  await ctx.db.insert("websiteEvents", { sessionId: session.websiteSessionId, eventType, page: cleanPage(page), createdAt: Date.now() });
}

export const checkAvailability = internalMutation({
  args: {
    sessionId: v.string(),
    service: v.string(),
    preferredDate: v.string(),
    preferredTimeWindow: v.union(v.literal("MORNING"), v.literal("AFTERNOON"), v.literal("ANY")),
    postcode: v.string(),
    page: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await chatSession(ctx, args.sessionId);
    const now = Date.now();
    const inWindow = session.availabilityWindowStartedAt !== undefined && now - session.availabilityWindowStartedAt < AVAILABILITY_WINDOW_MS;
    const checks = inWindow ? (session.availabilityChecks ?? 0) : 0;
    if (checks >= MAX_AVAILABILITY_CHECKS) return { status: "RATE_LIMITED" as const, error: "Please wait a few minutes before checking more times." };
    await ctx.db.patch(session._id, { availabilityChecks: checks + 1, availabilityWindowStartedAt: inWindow ? session.availabilityWindowStartedAt : now, updatedAt: now });
    const service = await activeService(ctx, args.service);
    if (!service) return { status: "ERROR" as const, error: "Active service not found." };
    const area = await assessPostcode(ctx, args.postcode);
    if (!area.canInstantBook) return { status: "UNAVAILABLE" as const, slots: [], note: "This address needs team review before availability can be confirmed." };
    const slots = (await listPublicSlots(ctx, args.preferredDate, args.preferredDate))
      .filter((slot) => args.preferredTimeWindow === "ANY" || (args.preferredTimeWindow === "MORNING" ? slot.time < "12:00" : slot.time >= "12:00"))
      .slice(0, 6)
      .map(({ date, time }) => ({ date, time }));
    await track(ctx, session, "AI_AVAILABILITY_CHECKED", args.page);
    return { status: "OK" as const, service: { id: service._id, name: service.name }, slots, note: "These slots are currently available and are not reserved." };
  },
});

export const verifyBookingIdentity = internalMutation({
  args: { sessionId: v.string(), bookingReference: v.string(), contact: v.string(), page: v.string() },
  handler: async (ctx, args) => {
    const session = await chatSession(ctx, args.sessionId);
    const now = Date.now();
    await track(ctx, session, "AI_BOOKING_VERIFICATION_STARTED", args.page);
    if ((session.bookingVerificationCooldownUntil ?? 0) > now) {
      return { status: "RATE_LIMITED" as const, error: "Verification is temporarily unavailable. Please try again later or request a callback." };
    }
    const inWindow = session.bookingVerificationWindowStartedAt !== undefined && now - session.bookingVerificationWindowStartedAt < VERIFICATION_WINDOW_MS;
    const attempts = inWindow ? (session.bookingVerificationAttempts ?? 0) : 0;
    if (attempts >= MAX_VERIFICATION_ATTEMPTS) {
      await ctx.db.patch(session._id, { bookingVerificationCooldownUntil: now + VERIFICATION_COOLDOWN_MS, updatedAt: now });
      return { status: "RATE_LIMITED" as const, error: "Verification is temporarily unavailable. Please try again later or request a callback." };
    }
    let matched = false;
    let booking: Doc<"bookings"> | null = null;
    try {
      const reference = args.bookingReference.trim().toUpperCase();
      if (!/^[A-Z0-9-]{3,40}$/.test(reference)) throw new Error("Invalid reference.");
      booking = await ctx.db.query("bookings").withIndex("by_reference", (q) => q.eq("reference", reference)).unique();
      if (booking) {
        const customer = await ctx.db.get(booking.customerId);
        const supplied = args.contact.includes("@") ? normalizeEmail(args.contact) : normalizePhone(args.contact);
        matched = Boolean(customer && (supplied === customer.email?.toLowerCase() || supplied === customer.phone));
      }
    } catch {
      matched = false;
    }
    if (!matched || !booking) {
      const nextAttempts = attempts + 1;
      await ctx.db.patch(session._id, {
        verifiedBookingId: undefined,
        bookingVerifiedAt: undefined,
        bookingVerificationExpiresAt: undefined,
        bookingVerificationAttempts: nextAttempts,
        bookingVerificationWindowStartedAt: inWindow ? session.bookingVerificationWindowStartedAt : now,
        bookingVerificationCooldownUntil: nextAttempts >= MAX_VERIFICATION_ATTEMPTS ? now + VERIFICATION_COOLDOWN_MS : undefined,
        updatedAt: now,
      });
      await track(ctx, session, "AI_BOOKING_VERIFICATION_FAILED", args.page);
      return { status: "FAILED" as const, error: "We couldn't verify those details. Check the booking reference and the email or phone used for the booking." };
    }
    const expiresAt = now + VERIFICATION_TTL_MS;
    await ctx.db.patch(session._id, {
      verifiedBookingId: booking._id,
      bookingVerifiedAt: now,
      bookingVerificationExpiresAt: expiresAt,
      bookingVerificationAttempts: 0,
      bookingVerificationCooldownUntil: undefined,
      customerId: booking.customerId,
      updatedAt: now,
    });
    await track(ctx, session, "AI_BOOKING_VERIFIED", args.page);
    return { status: "VERIFIED" as const, expiresAt };
  },
});

export const getVerifiedBookingSummary = internalQuery({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db.query("chatSessions").withIndex("by_session_id", (q) => q.eq("sessionId", validSessionId(args.sessionId))).unique();
    if (!session?.verifiedBookingId || (session.bookingVerificationExpiresAt ?? 0) <= Date.now()) {
      return { status: "VERIFICATION_REQUIRED" as const, error: "Booking verification is required." };
    }
    const booking = await ctx.db.get(session.verifiedBookingId);
    if (!booking) return { status: "VERIFICATION_REQUIRED" as const, error: "Booking verification is required." };
    const service = await ctx.db.get(booking.serviceId);
    return {
      status: "OK" as const,
      booking: {
        reference: booking.reference ?? "Reference unavailable",
        service: service?.name ?? "Cleaning service",
        scheduledDate: booking.scheduledDate,
        scheduledTime: booking.scheduledTime,
        location: `${booking.suburb}, ${booking.state}`,
        bookingStatus: booking.status,
        paymentStatus: booking.paymentStatus,
        total: new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(booking.finalTotalCents / 100),
      },
      verificationExpiresAt: session.bookingVerificationExpiresAt,
    };
  },
});

type RequestedChanges = {
  scheduledDate?: string;
  scheduledTime?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  notes?: string;
};

async function createRequest(
  ctx: MutationCtx,
  args: { sessionId: string; page: string; explicitConfirmation: boolean; type: "RESCHEDULE" | "DETAILS_CHANGE" | "CANCELLATION"; changes: RequestedChanges; reason?: string },
) {
  const session = await chatSession(ctx, args.sessionId);
  const now = Date.now();
  if (!args.explicitConfirmation) return { status: "CONFIRMATION_REQUIRED" as const, error: "The customer must explicitly confirm the request summary first." };
  if (!session.verifiedBookingId || (session.bookingVerificationExpiresAt ?? 0) <= now) return { status: "VERIFICATION_REQUIRED" as const, error: "Booking verification has expired. Please verify again." };
  const booking = await ctx.db.get(session.verifiedBookingId);
  if (!booking || booking.status === "CANCELLED") return { status: "ERROR" as const, error: "This booking cannot accept change requests." };
  const customer = await ctx.db.get(booking.customerId);
  if (!customer) return { status: "ERROR" as const, error: "Customer record unavailable." };
  const reason = args.reason?.trim().replace(/\s+/g, " ").slice(0, 1000) || undefined;
  const changes: RequestedChanges = {};
  if (args.type === "RESCHEDULE") {
    if (!args.changes.scheduledDate || !args.changes.scheduledTime) return { status: "ERROR" as const, error: "Requested date and time are required." };
    validateSchedule(args.changes.scheduledDate, args.changes.scheduledTime);
    await ensurePublicSlotAvailable(ctx, args.changes.scheduledDate, args.changes.scheduledTime, booking._id);
    changes.scheduledDate = args.changes.scheduledDate;
    changes.scheduledTime = args.changes.scheduledTime;
  } else if (args.type === "DETAILS_CHANGE") {
    if (args.changes.firstName !== undefined) changes.firstName = args.changes.firstName.trim().slice(0, 80);
    if (args.changes.lastName !== undefined) changes.lastName = args.changes.lastName.trim().slice(0, 80);
    if (args.changes.email !== undefined) changes.email = normalizeEmail(args.changes.email);
    if (args.changes.phone !== undefined) changes.phone = normalizePhone(args.changes.phone);
    if (args.changes.notes !== undefined) changes.notes = args.changes.notes.trim().slice(0, 2000);
    if (!Object.keys(changes).length) return { status: "ERROR" as const, error: "No supported changes were supplied." };
  }
  const fingerprint = JSON.stringify({ bookingId: booking._id, type: args.type, changes, reason });
  const idempotencyKey = fingerprint;
  const existing = await ctx.db.query("bookingChangeRequests").withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", idempotencyKey)).unique();
  if (existing) return { status: "SUCCESS" as const, bookingReference: booking.reference ?? "", requestStatus: existing.status, duplicate: true };
  const pending = await ctx.db.query("bookingChangeRequests").withIndex("by_booking_and_status", (q) => q.eq("bookingId", booking._id).eq("status", "PENDING")).collect();
  if (pending.length >= 3) return { status: "RATE_LIMITED" as const, error: "Too many pending requests. Please wait for the team to review them." };
  await ctx.db.insert("bookingChangeRequests", {
    bookingId: booking._id,
    customerId: customer._id,
    chatSessionId: session._id,
    source: "AI_CHAT",
    type: args.type,
    currentSnapshot: { scheduledDate: booking.scheduledDate, scheduledTime: booking.scheduledTime, bookingStatus: booking.status, bookingUpdatedAt: booking.updatedAt },
    requestedChanges: changes,
    reason,
    status: "PENDING",
    idempotencyKey,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(session._id, { intent: args.type === "CANCELLATION" ? "CANCELLATION" : "BOOKING_CHANGE", updatedAt: now });
  await track(ctx, session, args.type === "CANCELLATION" ? "AI_CANCELLATION_REQUEST_CREATED" : "AI_RESCHEDULE_REQUEST_CREATED", args.page);
  return { status: "SUCCESS" as const, bookingReference: booking.reference ?? "", requestStatus: "PENDING" as const, duplicate: false };
}

const changeFields = {
  scheduledDate: v.optional(v.string()), scheduledTime: v.optional(v.string()),
  firstName: v.optional(v.string()), lastName: v.optional(v.string()),
  email: v.optional(v.string()), phone: v.optional(v.string()), notes: v.optional(v.string()),
};

export const createBookingChangeRequest = internalMutation({
  args: { sessionId: v.string(), page: v.string(), explicitConfirmation: v.boolean(), type: v.union(v.literal("RESCHEDULE"), v.literal("DETAILS_CHANGE")), changes: v.object(changeFields), reason: v.optional(v.string()) },
  handler: (ctx, args) => createRequest(ctx, args),
});

export const createCancellationRequest = internalMutation({
  args: { sessionId: v.string(), page: v.string(), explicitConfirmation: v.boolean(), reason: v.optional(v.string()) },
  handler: (ctx, args) => createRequest(ctx, { ...args, type: "CANCELLATION", changes: {} }),
});
