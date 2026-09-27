import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { requireRole } from './lib/auth';

const engagementType = v.union(
  v.literal('EMPLOYEE'),
  v.literal('CONTRACTOR'),
);
const cleanerStatus = v.union(v.literal('ACTIVE'), v.literal('INACTIVE'));

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
