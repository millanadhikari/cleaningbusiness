import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const emailType = v.union(
  v.literal("BOOKING_CONFIRMATION"),
  v.literal("QUOTE_REQUEST_RECEIVED"),
  v.literal("BOOKING_PAYMENT_LINK"),
);

export const createPendingLog = internalMutation({
  args: {
    type: emailType,
    to: v.string(),
    subject: v.string(),
    customerId: v.optional(v.id("customers")),
    bookingId: v.optional(v.id("bookings")),
    quoteRequestId: v.optional(v.id("quoteRequests")),
  },
  returns: v.id("emailLogs"),
  handler: async (ctx, args) =>
    ctx.db.insert("emailLogs", {
      ...args,
      status: "PENDING",
      createdAt: Date.now(),
    }),
});

export const markSent = internalMutation({
  args: {
    emailLogId: v.id("emailLogs"),
    providerMessageId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.emailLogId, {
      status: "SENT",
      providerMessageId: args.providerMessageId,
      errorMessage: undefined,
      sentAt: Date.now(),
    });
    return null;
  },
});

export const markFailed = internalMutation({
  args: {
    emailLogId: v.id("emailLogs"),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.emailLogId, {
      status: "FAILED",
      errorMessage: args.errorMessage.slice(0, 1000),
    });
    return null;
  },
});
