import { query } from "./_generated/server";
import { requireRole } from "./lib/auth";

export const summary = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);

    const today = new Date().toISOString().slice(0, 10);
    const weekStart = Date.parse(`${today}T00:00:00Z`) - 6 * 86400000;
    const [
      newQuotes,
      allCustomers,
      recentQuotes,
      recentCustomers,
      upcomingBookings,
      weeklyQuotes,
    ] = await Promise.all([
      ctx.db
        .query("quoteRequests")
        .withIndex("by_status", (index) => index.eq("status", "NEW"))
        .collect(),
      ctx.db.query("customers").collect(),
      ctx.db
        .query("quoteRequests")
        .withIndex("by_created_at")
        .order("desc")
        .take(5),
      ctx.db.query("customers").order("desc").take(5),
      ctx.db
        .query("bookings")
        .withIndex("by_status_and_scheduled_date", (index) =>
          index.eq("status", "CONFIRMED").gte("scheduledDate", today),
        )
        .order("asc")
        .collect(),
      ctx.db
        .query("quoteRequests")
        .withIndex("by_created_at", (index) =>
          index.gte("createdAt", weekStart),
        )
        .collect(),
    ]);

    const recentQuoteRows = await Promise.all(
      recentQuotes.map(async (quote) => {
        const customer = await ctx.db.get(quote.customerId);
        return {
          _id: quote._id,
          customerName: customer
            ? [customer.firstName, customer.lastName].filter(Boolean).join(" ")
            : "Unknown customer",
          serviceType: quote.serviceType,
          suburb: quote.suburb,
          status: quote.status,
          createdAt: quote.createdAt,
        };
      }),
    );

    const upcomingBookingRows = await Promise.all(
      upcomingBookings.slice(0, 5).map(async (booking) => {
        const [customer, service] = await Promise.all([
          ctx.db.get(booking.customerId),
          ctx.db.get(booking.serviceId),
        ]);
        return {
          _id: booking._id,
          customerName: customer
            ? [customer.firstName, customer.lastName].filter(Boolean).join(" ")
            : "Unknown customer",
          serviceName: service?.name ?? "Unknown service",
          scheduledDate: booking.scheduledDate,
          scheduledTime: booking.scheduledTime,
          paymentStatus: booking.paymentStatus,
        };
      }),
    );

    return {
      weeklyActivity: Array.from({ length: 7 }, (_, index) => {
        const start = weekStart + index * 86400000;
        return {
          date: new Date(start).toISOString().slice(0, 10),
          quotes: weeklyQuotes.filter(
            (quote) =>
              quote.createdAt >= start && quote.createdAt < start + 86400000,
          ).length,
          customers: allCustomers.filter(
            (customer) =>
              customer.createdAt >= start &&
              customer.createdAt < start + 86400000,
          ).length,
        };
      }),
      weeklyQuoteStatuses: [
        "NEW",
        "REVIEWING",
        "QUOTED",
        "ACCEPTED",
        "DECLINED",
        "EXPIRED",
      ].map((status) => ({
        status,
        count: weeklyQuotes.filter((quote) => quote.status === status).length,
      })),
      newQuoteRequestCount: newQuotes.length,
      totalCustomerCount: allCustomers.length,
      upcomingBookingCount: upcomingBookings.length,
      upcomingBookings: upcomingBookingRows,
      recentQuotes: recentQuoteRows,
      recentCustomers: recentCustomers.map((customer) => ({
        _id: customer._id,
        name: [customer.firstName, customer.lastName].filter(Boolean).join(" "),
        email: customer.email,
        phone: customer.phone,
        createdAt: customer.createdAt,
      })),
    };
  },
});
