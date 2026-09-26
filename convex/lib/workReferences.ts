import type { MutationCtx } from "../_generated/server";

const COUNTER_NAME = "work";
const REFERENCE_PATTERN = /^WD(\d+)$/;

function referenceNumber(reference: string | undefined) {
  const match = reference?.match(REFERENCE_PATTERN);
  return match ? Number(match[1]) : 0;
}

export function formatWorkReference(value: number) {
  return `WD${String(value).padStart(4, "0")}`;
}

export async function backfillWorkReferences(ctx: MutationCtx) {
  const existingCounter = await ctx.db
    .query("referenceCounters")
    .withIndex("by_name", (index) => index.eq("name", COUNTER_NAME))
    .unique();
  const [quotes, bookings] = await Promise.all([
    ctx.db.query("quoteRequests").order("asc").collect(),
    ctx.db.query("bookings").order("asc").collect(),
  ]);
  let currentValue = Math.max(
    existingCounter?.currentValue ?? 0,
    0,
    ...quotes.map((quote) => referenceNumber(quote.reference)),
    ...bookings.map((booking) => referenceNumber(booking.reference)),
  );
  const quoteById = new Map(quotes.map((quote) => [quote._id, quote]));
  const bookingById = new Map(bookings.map((booking) => [booking._id, booking]));
  const workItems = [
    ...quotes.map((quote) => ({ type: "quote" as const, document: quote })),
    ...bookings.map((booking) => ({ type: "booking" as const, document: booking })),
  ].sort((a, b) => a.document._creationTime - b.document._creationTime);
  let updated = 0;

  for (const item of workItems) {
    if (item.document.reference) continue;

    if (item.type === "quote") {
      const linkedBooking = item.document.convertedBookingId
        ? bookingById.get(item.document.convertedBookingId)
        : undefined;
      const reference =
        linkedBooking?.reference ?? formatWorkReference(++currentValue);
      await ctx.db.patch(item.document._id, { reference });
      item.document.reference = reference;
      updated += 1;

      if (linkedBooking && !linkedBooking.reference) {
        await ctx.db.patch(linkedBooking._id, { reference });
        linkedBooking.reference = reference;
        updated += 1;
      }
      continue;
    }

    const linkedQuote = item.document.quoteRequestId
      ? quoteById.get(item.document.quoteRequestId)
      : undefined;
    const reference =
      linkedQuote?.reference ?? formatWorkReference(++currentValue);
    await ctx.db.patch(item.document._id, { reference });
    item.document.reference = reference;
    updated += 1;

    if (linkedQuote && !linkedQuote.reference) {
      await ctx.db.patch(linkedQuote._id, { reference });
      linkedQuote.reference = reference;
      updated += 1;
    }
  }

  if (existingCounter) {
    if (existingCounter.currentValue !== currentValue) {
      await ctx.db.patch(existingCounter._id, { currentValue });
    }
  } else {
    await ctx.db.insert("referenceCounters", {
      name: COUNTER_NAME,
      currentValue,
    });
  }

  return { updated };
}

export async function allocateWorkReference(ctx: MutationCtx) {
  let counter = await ctx.db
    .query("referenceCounters")
    .withIndex("by_name", (index) => index.eq("name", COUNTER_NAME))
    .unique();

  if (!counter) {
    await backfillWorkReferences(ctx);
    counter = await ctx.db
      .query("referenceCounters")
      .withIndex("by_name", (index) => index.eq("name", COUNTER_NAME))
      .unique();
  }

  if (!counter) throw new Error("Unable to initialize the reference sequence.");
  const nextValue = counter.currentValue + 1;
  await ctx.db.patch(counter._id, { currentValue: nextValue });
  return formatWorkReference(nextValue);
}
