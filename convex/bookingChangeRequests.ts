import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireRole } from "./lib/auth";
import { applyBookingDetails } from "./bookings";

export const listForBooking = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    return ctx.db
      .query("bookingChangeRequests")
      .withIndex("by_booking", (index) => index.eq("bookingId", args.bookingId))
      .order("desc")
      .collect();
  },
});

export const review = mutation({
  args: {
    requestId: v.id("bookingChangeRequests"),
    decision: v.union(v.literal("APPROVE"), v.literal("DECLINE")),
    adminReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Change request not found.");
    if (request.status !== "PENDING" && request.status !== "NEEDS_ATTENTION") {
      throw new Error("This request has already been reviewed.");
    }
    const adminReason = args.adminReason?.trim().replace(/\s+/g, " ").slice(0, 1000) || undefined;
    const now = Date.now();
    if (args.decision === "DECLINE") {
      await ctx.db.patch(request._id, { status: "DECLINED", adminReason, reviewedByUserId: user._id, reviewedAt: now, updatedAt: now });
      return { status: "DECLINED" as const, message: "Request declined. The booking was not changed." };
    }
    const booking = await ctx.db.get(request.bookingId);
    if (!booking) {
      await ctx.db.patch(request._id, { status: "NEEDS_ATTENTION", adminReason: "Booking no longer exists.", reviewedByUserId: user._id, reviewedAt: now, updatedAt: now });
      return { status: "NEEDS_ATTENTION" as const, message: "Booking no longer exists." };
    }
    if (booking.updatedAt !== request.currentSnapshot.bookingUpdatedAt) {
      await ctx.db.patch(request._id, { status: "NEEDS_ATTENTION", adminReason: "Booking changed after this request was submitted. Review the current booking before applying it.", reviewedByUserId: user._id, reviewedAt: now, updatedAt: now });
      return { status: "NEEDS_ATTENTION" as const, message: "The booking changed after this request was submitted. Review it manually." };
    }
    if (booking.status === "CANCELLED") {
      await ctx.db.patch(request._id, { status: "NEEDS_ATTENTION", adminReason: "Booking is already cancelled.", reviewedByUserId: user._id, reviewedAt: now, updatedAt: now });
      return { status: "NEEDS_ATTENTION" as const, message: "The booking is already cancelled." };
    }
    if (request.type === "CANCELLATION") {
      if (booking.paymentStatus !== "UNPAID") {
        await ctx.db.patch(request._id, { status: "NEEDS_ATTENTION", adminReason: "Payment or refund review is required before cancellation.", reviewedByUserId: user._id, reviewedAt: now, updatedAt: now });
        return { status: "NEEDS_ATTENTION" as const, message: "Payment or refund review is required. The booking was not cancelled." };
      }
      await ctx.db.patch(booking._id, { status: "CANCELLED", updatedAt: now });
      await ctx.scheduler.runAfter(0, internal.notifications.notifyAssignedCleaners, {
        bookingId: booking._id,
        type: "BOOKING_CANCELLED",
        title: "Job cancelled",
        body: `Booking ${booking.reference ?? String(booking._id)} has been cancelled.`,
        priority: "HIGH",
        dedupeKey: `booking-cancelled:${request._id}`,
      });
      await ctx.scheduler.runAfter(0, internal.jobReminders.rescheduleBookingReminders, {
        bookingId: booking._id,
      });
    } else {
      const customer = await ctx.db.get(booking.customerId);
      if (!customer) throw new Error("Customer record not found.");
      try {
        await applyBookingDetails(
          ctx,
          booking,
          {
            firstName: request.requestedChanges.firstName ?? customer.firstName,
            lastName: request.requestedChanges.lastName ?? customer.lastName,
            email: request.requestedChanges.email ?? customer.email,
            phone: request.requestedChanges.phone ?? customer.phone,
            addressLine1: booking.addressLine1,
            addressLine2: booking.addressLine2,
            suburb: booking.suburb,
            state: booking.state,
            postcode: booking.postcode,
            scheduledDate: request.requestedChanges.scheduledDate ?? booking.scheduledDate,
            scheduledTime: request.requestedChanges.scheduledTime ?? booking.scheduledTime,
            notes: request.requestedChanges.notes ?? booking.notes,
          },
          { recheckAvailability: request.type === "RESCHEDULE" },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "The request could not be applied.";
        await ctx.db.patch(request._id, { status: "NEEDS_ATTENTION", adminReason: message.slice(0, 1000), reviewedByUserId: user._id, reviewedAt: now, updatedAt: now });
        return { status: "NEEDS_ATTENTION" as const, message };
      }
      await ctx.scheduler.runAfter(0, internal.notifications.notifyAssignedCleaners, {
        bookingId: booking._id,
        type: "BOOKING_UPDATED",
        title: "Job details updated",
        body: `Booking ${booking.reference ?? String(booking._id)} has been updated. Review the latest date, time, and job details.`,
        priority: "HIGH",
        dedupeKey: `booking-change-approved:${request._id}`,
      });
      await ctx.scheduler.runAfter(0, internal.jobReminders.rescheduleBookingReminders, {
        bookingId: booking._id,
      });
    }
    await ctx.db.patch(request._id, { status: "APPROVED", adminReason, reviewedByUserId: user._id, reviewedAt: now, updatedAt: now });
    return { status: "APPROVED" as const, message: request.type === "CANCELLATION" ? "Cancellation approved and booking cancelled." : "Request approved and booking updated." };
  },
});
