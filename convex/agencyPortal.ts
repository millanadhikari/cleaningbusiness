import { v } from 'convex/values';
import { mutation, query, type MutationCtx } from './_generated/server';
import { requireAgencyAccount } from './lib/auth';
import { allocateWorkReference } from './lib/workReferences';
import { assessPostcode } from './serviceAreas';
import {
  convertAcceptedQuoteRecord,
  prepareAdminQuote,
  type AdminQuoteInput,
} from './quoteRequests';
import { ensurePublicSlotAvailable } from './availability';

const answerValue = v.union(v.number(), v.boolean(), v.string(), v.array(v.string()));

const agencyQuoteFields = {
  firstName: v.string(),
  lastName: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.string(),
  serviceId: v.id('services'),
  answers: v.optional(v.record(v.string(), answerValue)),
  addressLine1: v.string(),
  addressLine2: v.optional(v.string()),
  suburb: v.string(),
  state: v.string(),
  postcode: v.string(),
  preferredDate: v.optional(v.string()),
  preferredTime: v.optional(v.string()),
  propertyType: v.optional(v.string()),
  bedrooms: v.optional(v.number()),
  bathrooms: v.optional(v.number()),
  notes: v.optional(v.string()),
};

function todayInSydney() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export const current = query({
  args: {},
  handler: async (ctx) => {
    const { account, agency } = await requireAgencyAccount(ctx, { allowPasswordChangePending: true });
    return {
      agencyId: agency._id,
      agencyName: agency.name,
      branchName: agency.branchName,
      username: account.username,
      teamName: account.teamName,
      mustChangePassword: account.mustChangePassword,
    };
  },
});

export const markPasswordChanged = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { account } = await requireAgencyAccount(ctx, { allowPasswordChangePending: true });
    await ctx.db.patch(account._id, { mustChangePassword: false, updatedAt: Date.now() });
    return null;
  },
});

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const { account, agency } = await requireAgencyAccount(ctx);
    const [quotes, bookings] = await Promise.all([
      ctx.db.query('quoteRequests').withIndex('by_agency', (q) => q.eq('agencyId', agency._id)).order('desc').take(100),
      ctx.db.query('bookings').withIndex('by_agency', (q) => q.eq('agencyId', agency._id)).order('desc').take(100),
    ]);
    const today = todayInSydney();
    const upcoming = bookings
      .filter((booking) => booking.status !== 'CANCELLED' && booking.scheduledDate >= today)
      .sort((a, b) => `${a.scheduledDate} ${a.scheduledTime}`.localeCompare(`${b.scheduledDate} ${b.scheduledTime}`));
    return {
      agency: { name: agency.name, branchName: agency.branchName },
      account: { teamName: account.teamName, username: account.username },
      quoteCounts: {
        pending: quotes.filter((quote) => quote.status === 'NEW' || quote.status === 'REVIEWING').length,
        ready: quotes.filter((quote) => quote.status === 'QUOTED').length,
        accepted: quotes.filter((quote) => quote.status === 'ACCEPTED').length,
      },
      upcomingCount: upcoming.length,
      nextJob: upcoming[0] ?? null,
      recentQuotes: quotes.slice(0, 4),
    };
  },
});

export const listQuotes = query({
  args: {},
  handler: async (ctx) => {
    const { agency } = await requireAgencyAccount(ctx);
    const quotes = await ctx.db.query('quoteRequests').withIndex('by_agency', (q) => q.eq('agencyId', agency._id)).order('desc').take(100);
    return Promise.all(quotes.map(async (quote) => ({ ...quote, customer: await ctx.db.get(quote.customerId) })));
  },
});

export const getQuote = query({
  args: { quoteRequestId: v.id('quoteRequests') },
  handler: async (ctx, args) => {
    const { agency } = await requireAgencyAccount(ctx);
    const quote = await ctx.db.get(args.quoteRequestId);
    if (!quote || quote.agencyId !== agency._id) return null;
    const [customer, service] = await Promise.all([
      ctx.db.get(quote.customerId),
      quote.serviceId ? ctx.db.get(quote.serviceId) : null,
    ]);
    return { ...quote, customer, service };
  },
});

async function createAgencyQuoteRecord(
  ctx: MutationCtx,
  args: Omit<AdminQuoteInput, 'pricingSource' | 'customTotalCents'>,
  options: { instantBooking: boolean },
) {
  const { account, agency } = await requireAgencyAccount(ctx);
  const prepared = await prepareAdminQuote(ctx, { ...args, pricingSource: 'SERVICE' });
  const serviceArea = await assessPostcode(ctx, args.postcode.trim());
  if (options.instantBooking) {
    if (prepared.quote.estimateType !== 'ESTIMATE' || prepared.quote.estimatedTotalCents === undefined) {
      throw new Error('This service needs review before it can be booked. Save the quote request instead.');
    }
    if (!serviceArea.canInstantBook) {
      throw new Error(
        serviceArea.status === 'CHECK_ADDRESS'
          ? 'We need to confirm this address before booking. Save the quote request for review.'
          : 'This postcode is outside our standard service area.',
      );
    }
    if (!prepared.quote.preferredDate || !prepared.quote.preferredTime) {
      throw new Error('Select an available date and time before booking.');
    }
    await ensurePublicSlotAvailable(
      ctx,
      prepared.quote.preferredDate,
      prepared.quote.preferredTime,
    );
  }
  const byEmail = prepared.customer.email
    ? await ctx.db.query('customers').withIndex('by_email', (q) => q.eq('email', prepared.customer.email)).first()
    : null;
  const byPhone = byEmail
    ? null
    : await ctx.db.query('customers').withIndex('by_phone', (q) => q.eq('phone', prepared.customer.phone)).first();
  const existing = byEmail ?? byPhone;
  const now = Date.now();
  const customerId = existing
    ? existing._id
    : await ctx.db.insert('customers', {
        ...prepared.customer,
        status: 'ACTIVE',
        source: 'AGENCY',
        createdAt: now,
        updatedAt: now,
      });
  if (existing) await ctx.db.patch(existing._id, { ...prepared.customer, updatedAt: now });
  const reference = await allocateWorkReference(ctx);
  const quoteRequestId = await ctx.db.insert('quoteRequests', {
    reference,
    customerId,
    agencyId: agency._id,
    agencyAccountId: account._id,
    source: 'AGENCY',
    ...prepared.quote,
    serviceAreaStatus: serviceArea.status,
    serviceAreaCheckedAt: now,
    status: options.instantBooking ? 'ACCEPTED' : 'NEW',
    createdAt: now,
    updatedAt: now,
  });
  return { quoteRequestId, reference };
}

export const createQuote = mutation({
  args: agencyQuoteFields,
  returns: v.object({ quoteRequestId: v.id('quoteRequests'), reference: v.string() }),
  handler: async (ctx, args) => {
    return createAgencyQuoteRecord(ctx, args, { instantBooking: false });
  },
});

export const createInstantBooking = mutation({
  args: agencyQuoteFields,
  returns: v.object({
    quoteRequestId: v.id('quoteRequests'),
    bookingId: v.id('bookings'),
    reference: v.string(),
  }),
  handler: async (ctx, args) => {
    const quote = await createAgencyQuoteRecord(ctx, args, { instantBooking: true });
    const bookingId = await convertAcceptedQuoteRecord(ctx, {
      quoteRequestId: quote.quoteRequestId,
      paymentOption: 'PAY_LATER',
      paymentMode: 'PAY_LATER',
    });
    return { ...quote, bookingId };
  },
});

export const bookExistingQuote = mutation({
  args: { quoteRequestId: v.id('quoteRequests') },
  returns: v.id('bookings'),
  handler: async (ctx, args) => {
    const { agency } = await requireAgencyAccount(ctx);
    const quote = await ctx.db.get(args.quoteRequestId);
    if (!quote || quote.agencyId !== agency._id) throw new Error('Quote not found.');
    if (quote.convertedBookingId) return quote.convertedBookingId;
    if (quote.status === 'DECLINED' || quote.status === 'EXPIRED') {
      throw new Error('This quote can no longer be booked.');
    }
    if (quote.estimateType !== 'ESTIMATE' || quote.estimatedTotalCents === undefined) {
      throw new Error('This quote needs review before it can be booked.');
    }
    if (!quote.preferredDate || !quote.preferredTime) {
      throw new Error('Add an available date and time before booking.');
    }
    const serviceArea = await assessPostcode(ctx, quote.postcode);
    if (!serviceArea.canInstantBook) {
      throw new Error('This address needs review before it can be booked.');
    }
    await ensurePublicSlotAvailable(ctx, quote.preferredDate, quote.preferredTime);
    await ctx.db.patch(quote._id, { status: 'ACCEPTED', updatedAt: Date.now() });
    return convertAcceptedQuoteRecord(ctx, {
      quoteRequestId: quote._id,
      paymentOption: 'PAY_LATER',
      paymentMode: 'PAY_LATER',
    });
  },
});

export const listJobs = query({
  args: {},
  handler: async (ctx) => {
    const { agency } = await requireAgencyAccount(ctx);
    const bookings = await ctx.db.query('bookings').withIndex('by_agency', (q) => q.eq('agencyId', agency._id)).order('desc').take(100);
    return Promise.all(bookings.map(async (booking) => ({
      ...booking,
      customer: await ctx.db.get(booking.customerId),
      service: await ctx.db.get(booking.serviceId),
    })));
  },
});

export const getJob = query({
  args: { bookingId: v.id('bookings') },
  handler: async (ctx, args) => {
    const { agency } = await requireAgencyAccount(ctx);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.agencyId !== agency._id) return null;
    const [customer, service, payments] = await Promise.all([
      ctx.db.get(booking.customerId),
      ctx.db.get(booking.serviceId),
      ctx.db.query('bookingPayments').withIndex('by_booking_and_created_at', (q) => q.eq('bookingId', booking._id)).collect(),
    ]);
    const amountPaidCents = payments.filter((payment) => payment.status === 'PAID').reduce((total, payment) => total + payment.amountCents, 0);
    return {
      ...booking,
      customer,
      service,
      paymentSnapshot: {
        totalCents: booking.finalTotalCents,
        amountPaidCents,
        balanceDueCents: Math.max(0, booking.finalTotalCents - amountPaidCents),
      },
    };
  },
});
