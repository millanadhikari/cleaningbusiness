import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireRole } from "./lib/auth";

export const prepare = internalQuery({
  args: { quoteRequestId: v.id("quoteRequests") },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const quote = await ctx.db.get(args.quoteRequestId);
    if (!quote) throw new Error("Quote not found.");
    if (!quote.reference) {
      throw new Error("This quote needs a reference before a PDF can be generated.");
    }
    if (quote.estimatedTotalCents === undefined) {
      throw new Error("Add a quoted total before generating the quote PDF.");
    }

    const [customer, service] = await Promise.all([
      ctx.db.get(quote.customerId),
      quote.serviceId ? ctx.db.get(quote.serviceId) : null,
    ]);
    if (!customer) throw new Error("The quote customer could not be found.");

    const customerName = [customer.firstName, customer.lastName]
      .filter(Boolean)
      .join(" ");
    const customerAddress = [
      quote.addressLine1,
      quote.addressLine2,
      `${quote.suburb} ${quote.state} ${quote.postcode}`,
    ]
      .filter(Boolean)
      .join(", ");
    const items =
      quote.estimateBreakdown?.length
        ? quote.estimateBreakdown.map((item) => ({
            description: item.label,
            amountCents: item.amount,
          }))
        : [
            {
              description: service?.name ?? quote.serviceType,
              amountCents: quote.estimatedTotalCents,
            },
          ];
    const itemsTotal = items.reduce(
      (total, item) => total + item.amountCents,
      0,
    );
    if (itemsTotal !== quote.estimatedTotalCents) {
      items.push({
        description: "Quoted total adjustment",
        amountCents: quote.estimatedTotalCents - itemsTotal,
      });
    }

    return {
      quoteRequestId: quote._id,
      customerId: customer._id,
      reference: quote.reference,
      createdAt: quote.createdAt,
      customerName,
      customerFirstName: customer.firstName,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      customerAddress,
      serviceName: service?.name ?? quote.serviceType,
      preferredDate: quote.preferredDate,
      preferredTime: quote.preferredTime,
      propertyType: quote.propertyType,
      bedrooms: quote.bedrooms,
      bathrooms: quote.bathrooms,
      answers: quote.submittedAnswers ?? [],
      notes: quote.notes,
      items,
      totalCents: quote.estimatedTotalCents,
    };
  },
});

export const markSent = internalMutation({
  args: { quoteRequestId: v.id("quoteRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRole(ctx, ["SUPER_ADMIN", "ADMIN"]);
    const quote = await ctx.db.get(args.quoteRequestId);
    if (!quote) throw new Error("Quote not found.");
    if (quote.status === "NEW" || quote.status === "REVIEWING") {
      await ctx.db.patch(quote._id, {
        status: "QUOTED",
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});
