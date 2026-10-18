import { v } from 'convex/values';
import { internal } from './_generated/api';
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { requireRole } from './lib/auth';

const INVITATION_LIFETIME_DAYS = 30;
const INVITATION_LIFETIME_MS = INVITATION_LIFETIME_DAYS * 24 * 60 * 60 * 1000;

type ClerkInvitationResponse = { id: string };
type ClerkUserResponse = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_email_address_id: string | null;
  email_addresses: Array<{
    id: string;
    email_address: string;
    verification: { status: string } | null;
  }>;
};

function clerkSecretKey() {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error('Cleaner invitations are not configured. Add CLERK_SECRET_KEY to Convex.');
  return key;
}

async function clerkRequest<Response>(path: string, init?: RequestInit) {
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${clerkSecretKey()}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!response.ok) {
    console.error('Clerk cleaner invitation failed', response.status, await response.text());
    throw new Error('Clerk could not complete the cleaner invitation request.');
  }
  return (await response.json()) as Response;
}

function cleanerInvitationUrl(appOrigin: string) {
  const url = new URL(appOrigin);
  const allowed = url.hostname === 'app.wedocleaning.com.au' ||
    url.hostname.endsWith('.vercel.app') ||
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1';
  if (!allowed || (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1')) {
    throw new Error('Cleaner invitations can only be sent from an approved app URL.');
  }
  return new URL('/cleaner-invitation', url.origin).toString();
}

const engagementType = v.union(
  v.literal('EMPLOYEE'),
  v.literal('CONTRACTOR'),
);
const cleanerStatus = v.union(v.literal('ACTIVE'), v.literal('INACTIVE'));
const availabilityDay = v.union(
  v.literal('MONDAY'),
  v.literal('TUESDAY'),
  v.literal('WEDNESDAY'),
  v.literal('THURSDAY'),
  v.literal('FRIDAY'),
  v.literal('SATURDAY'),
  v.literal('SUNDAY'),
);
const availabilityEntry = v.object({
  day: availabilityDay,
  available: v.boolean(),
  startTime: v.optional(v.string()),
  endTime: v.optional(v.string()),
});

function requiredText(value: string, label: string, maxLength: number) {
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (!cleaned) throw new Error(`${label} is required.`);
  if (cleaned.length > maxLength) throw new Error(`${label} is too long.`);
  return cleaned;
}

function optionalText(
  value: string | undefined,
  label: string,
  maxLength: number,
) {
  const cleaned = value?.trim().replace(/\s+/g, ' ');
  if (!cleaned) return undefined;
  if (cleaned.length > maxLength) throw new Error(`${label} is too long.`);
  return cleaned;
}

function normalizeEmail(value: string | undefined) {
  const email = value?.trim().toLowerCase();
  if (!email) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('Enter a valid email address.');
  }
  return email;
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (/^61[23478]\d{8}$/.test(digits)) return `+61${digits.slice(2)}`;
  if (/^0[23478]\d{8}$/.test(digits)) return `+61${digits.slice(1)}`;
  throw new Error('Enter a valid Australian phone number.');
}

function currentSydneyDate() {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function ensureEmailAvailable(
  ctx: MutationCtx,
  email: string | undefined,
  currentCleanerId?: string,
) {
  if (!email) return;
  const existing = await ctx.db
    .query('cleaners')
    .withIndex('by_email', (index) => index.eq('email', email))
    .first();
  if (existing && String(existing._id) !== currentCleanerId) {
    throw new Error('A cleaner with this email address already exists.');
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ['SUPER_ADMIN', 'ADMIN']);
    const cleaners = await ctx.db.query('cleaners').collect();
    return cleaners.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'ACTIVE' ? -1 : 1;
      return `${a.firstName} ${a.lastName}`.localeCompare(
        `${b.firstName} ${b.lastName}`,
      );
    });
  },
});

export const listActive = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ['SUPER_ADMIN', 'ADMIN']);
    const cleaners = await ctx.db
      .query('cleaners')
      .withIndex('by_status', (index) => index.eq('status', 'ACTIVE'))
      .collect();
    return cleaners
      .sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(
          `${b.firstName} ${b.lastName}`,
        ),
      )
      .map((cleaner) => ({
        ...cleaner,
        name: `${cleaner.firstName} ${cleaner.lastName}`,
      }));
  },
});

export const getDetails = query({
  args: { cleanerId: v.id('cleaners') },
  handler: async (ctx, args) => {
    await requireRole(ctx, ['SUPER_ADMIN', 'ADMIN']);
    const cleaner = await ctx.db.get(args.cleanerId);
    if (!cleaner) return null;

    const assignments = await ctx.db
      .query('bookingCleanerAssignments')
      .withIndex('by_cleaner', (index) => index.eq('cleanerId', cleaner._id))
      .collect();
    const today = currentSydneyDate();
    const upcomingJobs = (
      await Promise.all(
        assignments.map(async (assignment) => {
          const booking = await ctx.db.get(assignment.bookingId);
          if (!booking || booking.status === 'CANCELLED' || booking.scheduledDate < today) {
            return null;
          }
          const [customer, service] = await Promise.all([
            ctx.db.get(booking.customerId),
            ctx.db.get(booking.serviceId),
          ]);
          return {
            _id: booking._id,
            reference: booking.reference,
            customerName: customer
              ? [customer.firstName, customer.lastName].filter(Boolean).join(' ')
              : 'Unknown customer',
            serviceName: service?.name ?? 'Unknown service',
            scheduledDate: booking.scheduledDate,
            scheduledTime: booking.scheduledTime,
            address: [booking.addressLine1, booking.suburb, booking.state, booking.postcode]
              .filter(Boolean)
              .join(', '),
            status: booking.status,
            paymentStatus: booking.paymentStatus,
          };
        }),
      )
    )
      .filter((job): job is NonNullable<typeof job> => job !== null)
      .sort((a, b) =>
        `${a.scheduledDate} ${a.scheduledTime}`.localeCompare(
          `${b.scheduledDate} ${b.scheduledTime}`,
        ),
      );

    return { cleaner, upcomingJobs };
  },
});

export const updateAvailability = mutation({
  args: {
    cleanerId: v.id('cleaners'),
    availability: v.array(availabilityEntry),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRole(ctx, ['SUPER_ADMIN', 'ADMIN']);
    const cleaner = await ctx.db.get(args.cleanerId);
    if (!cleaner) throw new Error('Cleaner not found.');
    const days = new Set(args.availability.map((entry) => entry.day));
    if (days.size !== args.availability.length) {
      throw new Error('Each day can only appear once.');
    }
    for (const entry of args.availability) {
      if (!entry.available) continue;
      if (!entry.startTime || !entry.endTime) {
        throw new Error('Add a start and finish time for each available day.');
      }
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.startTime) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.endTime) ||
          entry.startTime >= entry.endTime) {
        throw new Error('Availability must have a valid finish time after the start time.');
      }
    }
    await ctx.db.patch(cleaner._id, {
      availability: args.availability.map((entry) => ({
        day: entry.day,
        available: entry.available,
        startTime: entry.available ? entry.startTime : undefined,
        endTime: entry.available ? entry.endTime : undefined,
      })),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const prepareInvitation = internalQuery({
  args: { cleanerId: v.id('cleaners'), clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_user_id', (index) => index.eq('clerkUserId', args.clerkUserId))
      .unique();
    if (!user || user.status !== 'ACTIVE' || !['SUPER_ADMIN', 'ADMIN'].includes(user.role)) {
      throw new Error('You do not have permission to send cleaner invitations.');
    }
    const cleaner = await ctx.db.get(args.cleanerId);
    if (!cleaner) throw new Error('Cleaner not found.');
    if (!cleaner.email) throw new Error('Add an email address before sending an invitation.');
    return {
      cleanerId: cleaner._id,
      firstName: cleaner.firstName,
      email: cleaner.email,
    };
  },
});

export const recordInvitationSent = internalMutation({
  args: {
    cleanerId: v.id('cleaners'),
    email: v.string(),
    clerkInvitationId: v.string(),
    sentAt: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const cleaner = await ctx.db.get(args.cleanerId);
    if (cleaner) {
      await ctx.db.patch(cleaner._id, {
        invitationSentAt: args.sentAt,
        invitationEmail: args.email,
        clerkInvitationId: args.clerkInvitationId,
        invitationExpiresAt: args.expiresAt,
        invitationAcceptedAt: undefined,
        onboardingStatus: 'INVITED',
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const sendInvitation = action({
  args: { cleanerId: v.id('cleaners'), appOrigin: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Authentication required.');
    const cleaner = await ctx.runQuery(internal.cleaners.prepareInvitation, {
      cleanerId: args.cleanerId,
      clerkUserId: identity.subject,
    });
    const invitation = await clerkRequest<ClerkInvitationResponse>('/invitations', {
      method: 'POST',
      body: JSON.stringify({
        email_address: cleaner.email,
        redirect_url: cleanerInvitationUrl(args.appOrigin),
        expires_in_days: INVITATION_LIFETIME_DAYS,
        ignore_existing: true,
        notify: true,
        public_metadata: { wedoRole: 'CLEANER' },
      }),
    });
    const sentAt = Date.now();
    await ctx.runMutation(internal.cleaners.recordInvitationSent, {
      cleanerId: cleaner.cleanerId,
      email: cleaner.email,
      clerkInvitationId: invitation.id,
      sentAt,
      expiresAt: sentAt + INVITATION_LIFETIME_MS,
    });
    return { status: 'SENT' as const, sentAt };
  },
});

export const provisionInvitedCleaner = internalMutation({
  args: {
    clerkUserId: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const cleaner = await ctx.db
      .query('cleaners')
      .withIndex('by_email', (index) => index.eq('email', args.email))
      .unique();
    if (!cleaner || cleaner.onboardingStatus !== 'INVITED') {
      throw new Error('No pending cleaner invitation was found for this email.');
    }
    if (!cleaner.invitationExpiresAt || cleaner.invitationExpiresAt < Date.now()) {
      throw new Error('This cleaner invitation has expired. Ask the admin team to resend it.');
    }
    const byClerk = await ctx.db
      .query('users')
      .withIndex('by_clerk_user_id', (index) => index.eq('clerkUserId', args.clerkUserId))
      .unique();
    let userId = byClerk?._id;
    if (byClerk && byClerk.role !== 'CLEANER') {
      throw new Error('This account is already registered with a different role.');
    }
    if (!userId) {
      const byEmail = await ctx.db.query('users').withIndex('by_email', (index) => index.eq('email', args.email)).unique();
      if (byEmail) throw new Error('An account already uses this email address.');
      const now = Date.now();
      userId = await ctx.db.insert('users', {
        clerkUserId: args.clerkUserId,
        firstName: args.firstName ?? cleaner.firstName,
        lastName: args.lastName ?? cleaner.lastName,
        email: args.email,
        role: 'CLEANER',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      });
    }
    const now = Date.now();
    await ctx.db.patch(cleaner._id, {
      userId,
      invitationAcceptedAt: now,
      onboardingStatus: 'IN_PROGRESS',
      updatedAt: now,
    });
    return cleaner._id;
  },
});

export const completeInvitation = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Sign in with the invited account to continue.');
    const clerkUser = await clerkRequest<ClerkUserResponse>(`/users/${encodeURIComponent(identity.subject)}`);
    const primaryEmail = clerkUser.email_addresses.find((item) => item.id === clerkUser.primary_email_address_id);
    if (!primaryEmail || primaryEmail.verification?.status !== 'verified') {
      throw new Error('The invited email address must be verified before continuing.');
    }
    await ctx.runMutation(internal.cleaners.provisionInvitedCleaner, {
      clerkUserId: clerkUser.id,
      firstName: clerkUser.first_name ?? undefined,
      lastName: clerkUser.last_name ?? undefined,
      email: normalizeEmail(primaryEmail.email_address)!,
    });
    return null;
  },
});

export const create = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    email: v.optional(v.string()),
    phone: v.string(),
    specialty: v.optional(v.string()),
    engagementType,
    notes: v.optional(v.string()),
  },
  returns: v.id('cleaners'),
  handler: async (ctx, args) => {
    await requireRole(ctx, ['SUPER_ADMIN', 'ADMIN']);
    const email = normalizeEmail(args.email);
    await ensureEmailAvailable(ctx, email);
    const now = Date.now();
    return ctx.db.insert('cleaners', {
      firstName: requiredText(args.firstName, 'First name', 80),
      lastName: requiredText(args.lastName, 'Last name', 80),
      email,
      phone: normalizePhone(args.phone),
      specialty: optionalText(args.specialty, 'Specialty', 120),
      engagementType: args.engagementType,
      status: 'ACTIVE',
      notes: optionalText(args.notes, 'Notes', 1000),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    cleanerId: v.id('cleaners'),
    firstName: v.string(),
    lastName: v.string(),
    email: v.optional(v.string()),
    phone: v.string(),
    specialty: v.optional(v.string()),
    engagementType,
    status: cleanerStatus,
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRole(ctx, ['SUPER_ADMIN', 'ADMIN']);
    const cleaner = await ctx.db.get(args.cleanerId);
    if (!cleaner) throw new Error('Cleaner not found.');
    const email = normalizeEmail(args.email);
    await ensureEmailAvailable(ctx, email, String(cleaner._id));
    await ctx.db.patch(cleaner._id, {
      firstName: requiredText(args.firstName, 'First name', 80),
      lastName: requiredText(args.lastName, 'Last name', 80),
      email,
      phone: normalizePhone(args.phone),
      specialty: optionalText(args.specialty, 'Specialty', 120),
      engagementType: args.engagementType,
      status: args.status,
      notes: optionalText(args.notes, 'Notes', 1000),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const remove = mutation({
  args: { cleanerId: v.id('cleaners') },
  returns: v.object({ removedAssignments: v.number() }),
  handler: async (ctx, args) => {
    await requireRole(ctx, ['SUPER_ADMIN', 'ADMIN']);
    const cleaner = await ctx.db.get(args.cleanerId);
    if (!cleaner) throw new Error('Cleaner not found.');
    const assignments = await ctx.db
      .query('bookingCleanerAssignments')
      .withIndex('by_cleaner', (index) => index.eq('cleanerId', cleaner._id))
      .collect();
    await Promise.all(assignments.map((assignment) => ctx.db.delete(assignment._id)));
    await ctx.db.delete(cleaner._id);
    return { removedAssignments: assignments.length };
  },
});
