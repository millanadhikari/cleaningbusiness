import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireRole } from "./lib/auth";

export const month = query({
  args: {
    fromDate: v.string(),
    toDate: v.string(),
    cleanerId: v.optional(v.id("cleaners")),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_scheduled_date", (index) =>
        index.gte("scheduledDate", args.fromDate).lte("scheduledDate", args.toDate),
      )
      .collect();
    const jobs = (
      await Promise.all(
        bookings.map(async (booking) => {
          const assignments = await ctx.db
            .query("bookingCleanerAssignments")
            .withIndex("by_booking", (index) => index.eq("bookingId", booking._id))
            .collect();
          if (args.cleanerId && !assignments.some((item) => item.cleanerId === args.cleanerId)) {
            return null;
          }
          const [customer, service, cleaners] = await Promise.all([
            ctx.db.get(booking.customerId),
            ctx.db.get(booking.serviceId),
            Promise.all(assignments.map((item) => ctx.db.get(item.cleanerId))),
          ]);
          return {
            _id: booking._id,
            reference: booking.reference,
            scheduledDate: booking.scheduledDate,
            scheduledTime: booking.scheduledTime,
            status: booking.status,
            paymentStatus: booking.paymentStatus,
            suburb: booking.suburb,
            customerName: customer
              ? [customer.firstName, customer.lastName].filter(Boolean).join(" ")
              : "Unknown customer",
            serviceName: service?.name ?? "Unknown service",
            cleaners: cleaners
              .filter((cleaner) => cleaner !== null)
              .map((cleaner) => ({ _id: cleaner._id, name: `${cleaner.firstName} ${cleaner.lastName}` })),
          };
        }),
      )
    ).filter((job): job is NonNullable<typeof job> => job !== null);
    const blocks = args.cleanerId
      ? []
      : await ctx.db
          .query("publicAvailabilityBlocks")
          .withIndex("by_date", (index) =>
            index.gte("date", args.fromDate).lte("date", args.toDate),
          )
          .collect();
    return {
      jobs: jobs.sort((a, b) => `${a.scheduledDate} ${a.scheduledTime}`.localeCompare(`${b.scheduledDate} ${b.scheduledTime}`)),
      blocks: blocks.sort((a, b) => `${a.date} ${a.time ?? ""}`.localeCompare(`${b.date} ${b.time ?? ""}`)),
    };
  },
});
