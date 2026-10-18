import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireCleaner } from './lib/auth';

const availabilityDay = v.union(
  v.literal('MONDAY'), v.literal('TUESDAY'), v.literal('WEDNESDAY'),
  v.literal('THURSDAY'), v.literal('FRIDAY'), v.literal('SATURDAY'), v.literal('SUNDAY'),
);
const availabilityEntry = v.object({
  day: availabilityDay,
  available: v.boolean(),
  startTime: v.optional(v.string()),
  endTime: v.optional(v.string()),
});

function cleanText(value: string, label: string, max: number) {
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (!cleaned) throw new Error(`${label} is required.`);
  if (cleaned.length > max) throw new Error(`${label} is too long.`);
  return cleaned;
}

function validateAvailability(availability: Array<{ day: string; available: boolean; startTime?: string; endTime?: string }>) {
  if (new Set(availability.map((entry) => entry.day)).size !== availability.length) {
    throw new Error('Each day can only appear once.');
  }
  for (const entry of availability) {
    if (!entry.available) continue;
    if (!entry.startTime || !entry.endTime || entry.startTime >= entry.endTime) {
      throw new Error('Add a valid start and finish time for each available day.');
    }
  }
}

async function cleanerJobs(ctx: Parameters<typeof requireCleaner>[0], cleanerId: Parameters<typeof ctx.db.get<'cleaners'>>[0]) {
  const assignments = await ctx.db
    .query('bookingCleanerAssignments')
    .withIndex('by_cleaner', (index) => index.eq('cleanerId', cleanerId))
    .collect();
  const jobs = await Promise.all(assignments.map(async (assignment) => {
    const booking = await ctx.db.get(assignment.bookingId);
    if (!booking) return null;
    const [customer, service] = await Promise.all([
      ctx.db.get(booking.customerId),
      ctx.db.get(booking.serviceId),
    ]);
    return {
      assignmentId: assignment._id,
      assignmentStatus: assignment.status ?? 'ACCEPTED' as const,
      bookingId: booking._id,
      reference: booking.reference,
      bookingStatus: booking.status,
      serviceName: service?.name ?? 'Cleaning service',
      customerName: customer ? [customer.firstName, customer.lastName].filter(Boolean).join(' ') : 'Customer',
      customerPhone: customer?.phone,
      scheduledDate: booking.scheduledDate,
      scheduledTime: booking.scheduledTime,
      addressLine1: booking.addressLine1,
      addressLine2: booking.addressLine2,
      suburb: booking.suburb,
      state: booking.state,
      postcode: booking.postcode,
      notes: booking.notes,
      serviceAnswers: booking.serviceAnswers,
    };
  }));
  return jobs.filter((job): job is NonNullable<typeof job> => job !== null)
    .sort((a, b) => `${a.scheduledDate} ${a.scheduledTime}`.localeCompare(`${b.scheduledDate} ${b.scheduledTime}`));
}

export const current = query({
  args: {},
  handler: async (ctx) => {
    const { cleaner } = await requireCleaner(ctx);
    return cleaner;
  },
});

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const { cleaner } = await requireCleaner(ctx);
    const jobs = await cleanerJobs(ctx, cleaner._id);
    const today = new Date().toISOString().slice(0, 10);
    const active = jobs.filter((job) => job.bookingStatus !== 'CANCELLED' && job.assignmentStatus !== 'DECLINED');
    return {
      cleaner,
      offers: jobs.filter((job) => job.assignmentStatus === 'OFFERED'),
      nextJob: active.find((job) => job.scheduledDate >= today) ?? null,
      upcomingCount: active.filter((job) => job.scheduledDate >= today).length,
      completedCount: jobs.filter((job) => job.assignmentStatus === 'COMPLETED').length,
    };
  },
});

export const listJobs = query({
  args: {},
  handler: async (ctx) => {
    const { cleaner } = await requireCleaner(ctx);
    return cleanerJobs(ctx, cleaner._id);
  },
});

export const getJob = query({
  args: { bookingId: v.id('bookings') },
  handler: async (ctx, args) => {
    const { cleaner } = await requireCleaner(ctx);
    const assignment = await ctx.db.query('bookingCleanerAssignments')
      .withIndex('by_booking_and_cleaner', (index) => index.eq('bookingId', args.bookingId).eq('cleanerId', cleaner._id))
      .unique();
    if (!assignment) throw new Error('This job is not assigned to you.');
    const jobs = await cleanerJobs(ctx, cleaner._id);
    const job = jobs.find((item) => item.bookingId === args.bookingId);
    if (!job) return null;
    const [booking, notes, adjustments, payments] = await Promise.all([
      ctx.db.get(args.bookingId),
      ctx.db.query('bookingNotes')
        .withIndex('by_booking_and_created_at', (index) => index.eq('bookingId', args.bookingId))
        .order('desc').take(50),
      ctx.db.query('bookingAdjustments')
        .withIndex('by_booking_and_created_at', (index) => index.eq('bookingId', args.bookingId))
        .collect(),
      ctx.db.query('bookingPayments')
        .withIndex('by_booking_and_created_at', (index) => index.eq('bookingId', args.bookingId))
        .collect(),
    ]);
    if (!booking) return null;
    const adjustmentsTotalCents = adjustments.reduce(
      (total, adjustment) => total + adjustment.amountCents,
      0,
    );
    const hasInitialPaymentRecord = payments.some((payment) => payment.kind === 'INITIAL');
    const legacyPaidCents = booking.paymentLedgerInitializedAt || hasInitialPaymentRecord
      ? 0
      : booking.paymentStatus === 'PAID'
        ? (booking.estimatedTotalCents ?? booking.finalTotalCents - adjustmentsTotalCents)
        : booking.paymentStatus === 'DEPOSIT_PAID'
          ? (booking.depositAmountCents ?? 0)
          : 0;
    const amountPaidCents = legacyPaidCents + payments
      .filter((payment) => payment.status === 'PAID')
      .reduce((total, payment) => total + payment.amountCents, 0);
    return {
      ...job,
      jobNotes: notes.filter((note) => note.kind === 'JOB_NOTE'),
      paymentSnapshot: {
        paymentStatus: booking.paymentStatus,
        totalCents: booking.finalTotalCents,
        amountPaidCents,
        balanceDueCents: Math.max(0, booking.finalTotalCents - amountPaidCents),
      },
    };
  },
});

export const respondToJob = mutation({
  args: { bookingId: v.id('bookings'), response: v.union(v.literal('ACCEPTED'), v.literal('DECLINED')) },
  handler: async (ctx, args) => {
    const { cleaner } = await requireCleaner(ctx);
    const assignment = await ctx.db.query('bookingCleanerAssignments')
      .withIndex('by_booking_and_cleaner', (index) => index.eq('bookingId', args.bookingId).eq('cleanerId', cleaner._id)).unique();
    if (!assignment) throw new Error('This job is not assigned to you.');
    if ((assignment.status ?? 'ACCEPTED') !== 'OFFERED') throw new Error('This job offer has already been answered.');
    await ctx.db.patch(assignment._id, { status: args.response, respondedAt: Date.now() });
    return null;
  },
});

export const updateJobProgress = mutation({
  args: { bookingId: v.id('bookings'), status: v.union(v.literal('IN_PROGRESS'), v.literal('COMPLETED')) },
  handler: async (ctx, args) => {
    const { cleaner } = await requireCleaner(ctx);
    const assignment = await ctx.db.query('bookingCleanerAssignments')
      .withIndex('by_booking_and_cleaner', (index) => index.eq('bookingId', args.bookingId).eq('cleanerId', cleaner._id)).unique();
    if (!assignment) throw new Error('This job is not assigned to you.');
    const current = assignment.status ?? 'ACCEPTED';
    if (args.status === 'IN_PROGRESS' && current !== 'ACCEPTED') throw new Error('Accept this job before starting it.');
    if (args.status === 'COMPLETED' && current !== 'IN_PROGRESS') throw new Error('Start the job before marking it complete.');
    const now = Date.now();
    await ctx.db.patch(assignment._id, {
      status: args.status,
      startedAt: args.status === 'IN_PROGRESS' ? now : assignment.startedAt,
      completedAt: args.status === 'COMPLETED' ? now : undefined,
    });
    return null;
  },
});

export const addJobNote = mutation({
  args: { bookingId: v.id('bookings'), body: v.string() },
  handler: async (ctx, args) => {
    const { user, cleaner } = await requireCleaner(ctx);
    const assignment = await ctx.db.query('bookingCleanerAssignments')
      .withIndex('by_booking_and_cleaner', (index) => index.eq('bookingId', args.bookingId).eq('cleanerId', cleaner._id)).unique();
    if (!assignment) throw new Error('This job is not assigned to you.');
    return ctx.db.insert('bookingNotes', {
      bookingId: args.bookingId,
      authorUserId: user._id,
      authorName: `${cleaner.firstName} ${cleaner.lastName}`,
      kind: 'JOB_NOTE',
      body: cleanText(args.body, 'Job note', 4000),
      createdAt: Date.now(),
    });
  },
});

export const updateAvailability = mutation({
  args: { availability: v.array(availabilityEntry) },
  handler: async (ctx, args) => {
    const { cleaner } = await requireCleaner(ctx);
    validateAvailability(args.availability);
    await ctx.db.patch(cleaner._id, { availability: args.availability, updatedAt: Date.now() });
    return null;
  },
});

export const completeOnboarding = mutation({
  args: {
    phone: v.string(),
    homeAddress: v.string(),
    serviceArea: v.string(),
    emergencyContactName: v.string(),
    emergencyContactPhone: v.string(),
    availability: v.array(availabilityEntry),
  },
  handler: async (ctx, args) => {
    const { cleaner } = await requireCleaner(ctx);
    validateAvailability(args.availability);
    const now = Date.now();
    await ctx.db.patch(cleaner._id, {
      phone: cleanText(args.phone, 'Phone', 40),
      homeAddress: cleanText(args.homeAddress, 'Home address', 240),
      serviceArea: cleanText(args.serviceArea, 'Service area', 160),
      emergencyContactName: cleanText(args.emergencyContactName, 'Emergency contact name', 120),
      emergencyContactPhone: cleanText(args.emergencyContactPhone, 'Emergency contact phone', 40),
      availability: args.availability,
      onboardingStatus: 'COMPLETED',
      onboardingCompletedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const updateProfile = mutation({
  args: { phone: v.string(), homeAddress: v.string(), serviceArea: v.string(), emergencyContactName: v.string(), emergencyContactPhone: v.string() },
  handler: async (ctx, args) => {
    const { cleaner } = await requireCleaner(ctx);
    await ctx.db.patch(cleaner._id, {
      phone: cleanText(args.phone, 'Phone', 40),
      homeAddress: cleanText(args.homeAddress, 'Home address', 240),
      serviceArea: cleanText(args.serviceArea, 'Service area', 160),
      emergencyContactName: cleanText(args.emergencyContactName, 'Emergency contact name', 120),
      emergencyContactPhone: cleanText(args.emergencyContactPhone, 'Emergency contact phone', 40),
      updatedAt: Date.now(),
    });
    return null;
  },
});
