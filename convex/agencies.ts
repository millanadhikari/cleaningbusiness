import { v } from 'convex/values';
import { internal } from './_generated/api';
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import { requireRole } from './lib/auth';
import type { Id } from './_generated/dataModel';

const status = v.union(v.literal('ACTIVE'), v.literal('INACTIVE'));

function cleanRequired(value: string, label: string, maxLength: number) {
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (!cleaned) throw new Error(`${label} is required.`);
  if (cleaned.length > maxLength) throw new Error(`${label} is too long.`);
  return cleaned;
}

function cleanOptional(value: string | undefined, label: string, maxLength: number) {
  const cleaned = value?.trim().replace(/\s+/g, ' ');
  if (!cleaned) return undefined;
  if (cleaned.length > maxLength) throw new Error(`${label} is too long.`);
  return cleaned;
}

function normalizeUsername(value: string) {
  const username = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{3,31}$/.test(username)) {
    throw new Error('Username must be 4–32 characters using letters, numbers, hyphens or underscores.');
  }
  return username;
}

function clerkSecretKey() {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error('Agency accounts are not configured. Add CLERK_SECRET_KEY to Convex.');
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
    const details = await response.text();
    console.error('Clerk agency account request failed', response.status, details);
    if (
      details.includes('email_address') &&
      (details.includes('form_data_missing') || details.includes('user requirements'))
    ) {
      throw new Error(
        'Clerk currently requires an email address for every user. In Clerk Dashboard, make Email optional and enable Username sign-in, then try again.',
      );
    }
    if (details.toLowerCase().includes('username')) {
      throw new Error('Clerk rejected the username. Confirm username sign-in is enabled and email is not required.');
    }
    throw new Error('Clerk could not complete the agency account request.');
  }
  if (response.status === 204) return undefined as Response;
  return (await response.json()) as Response;
}

function temporaryPassword() {
  const groups = [
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    'abcdefghijkmnopqrstuvwxyz',
    '23456789',
    '!@#$%',
  ];
  const alphabet = groups.join('');
  const bytes = new Uint8Array(40);
  crypto.getRandomValues(bytes);
  const characters = groups.map((group, index) => group[bytes[index] % group.length]);
  for (let index = groups.length; index < 18; index += 1) {
    characters.push(alphabet[bytes[index] % alphabet.length]);
  }
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = bytes[18 + index] % (index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join('');
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ['SUPER_ADMIN', 'ADMIN']);
    const agencies = await ctx.db.query('agencies').withIndex('by_name').collect();
    return Promise.all(
      agencies.map(async (agency) => {
        const [accounts, quotes, bookings] = await Promise.all([
          ctx.db.query('agencyAccounts').withIndex('by_agency', (q) => q.eq('agencyId', agency._id)).collect(),
          ctx.db.query('quoteRequests').withIndex('by_agency', (q) => q.eq('agencyId', agency._id)).collect(),
          ctx.db.query('bookings').withIndex('by_agency', (q) => q.eq('agencyId', agency._id)).collect(),
        ]);
        return {
          ...agency,
          accountCount: accounts.length,
          quoteCount: quotes.length,
          upcomingJobCount: bookings.filter((booking) => booking.status !== 'CANCELLED').length,
        };
      }),
    );
  },
});

export const get = query({
  args: { agencyId: v.id('agencies') },
  handler: async (ctx, args) => {
    await requireRole(ctx, ['SUPER_ADMIN', 'ADMIN']);
    const agency = await ctx.db.get(args.agencyId);
    if (!agency) return null;
    const [accounts, quotes, bookings] = await Promise.all([
      ctx.db.query('agencyAccounts').withIndex('by_agency', (q) => q.eq('agencyId', agency._id)).collect(),
      ctx.db.query('quoteRequests').withIndex('by_agency', (q) => q.eq('agencyId', agency._id)).order('desc').take(50),
      ctx.db.query('bookings').withIndex('by_agency', (q) => q.eq('agencyId', agency._id)).order('desc').take(50),
    ]);
    const quoteRows = await Promise.all(quotes.map(async (quote) => ({
      ...quote,
      customer: await ctx.db.get(quote.customerId),
    })));
    const bookingRows = await Promise.all(bookings.map(async (booking) => ({
      ...booking,
      customer: await ctx.db.get(booking.customerId),
      service: await ctx.db.get(booking.serviceId),
    })));
    return { agency, accounts, quotes: quoteRows, bookings: bookingRows };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    branchName: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.id('agencies'),
  handler: async (ctx, args) => {
    const admin = await requireRole(ctx, ['SUPER_ADMIN', 'ADMIN']);
    const now = Date.now();
    return ctx.db.insert('agencies', {
      name: cleanRequired(args.name, 'Agency name', 120),
      branchName: cleanOptional(args.branchName, 'Branch name', 120),
      phone: cleanOptional(args.phone, 'Phone', 40),
      address: cleanOptional(args.address, 'Address', 240),
      notes: cleanOptional(args.notes, 'Notes', 2000),
      status: 'ACTIVE',
      createdByUserId: admin._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    agencyId: v.id('agencies'),
    name: v.string(),
    branchName: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
    status,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRole(ctx, ['SUPER_ADMIN', 'ADMIN']);
    const agency = await ctx.db.get(args.agencyId);
    if (!agency) throw new Error('Agency not found.');
    await ctx.db.patch(agency._id, {
      name: cleanRequired(args.name, 'Agency name', 120),
      branchName: cleanOptional(args.branchName, 'Branch name', 120),
      phone: cleanOptional(args.phone, 'Phone', 40),
      address: cleanOptional(args.address, 'Address', 240),
      notes: cleanOptional(args.notes, 'Notes', 2000),
      status: args.status,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const prepareAccountCreation = internalQuery({
  args: { clerkUserId: v.string(), agencyId: v.id('agencies'), username: v.string() },
  handler: async (ctx, args) => {
    const admin = await ctx.db.query('users').withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', args.clerkUserId)).unique();
    if (!admin || admin.status !== 'ACTIVE' || !['SUPER_ADMIN', 'ADMIN'].includes(admin.role)) {
      throw new Error('Admin access required.');
    }
    const agency = await ctx.db.get(args.agencyId);
    if (!agency || agency.status !== 'ACTIVE') throw new Error('Select an active agency.');
    const username = normalizeUsername(args.username);
    const existing = await ctx.db.query('agencyAccounts').withIndex('by_username', (q) => q.eq('username', username)).unique();
    if (existing) throw new Error('That username is already in use.');
    return { adminUserId: admin._id, username };
  },
});

export const recordAccountCreation = internalMutation({
  args: {
    agencyId: v.id('agencies'),
    clerkUserId: v.string(),
    username: v.string(),
    teamName: v.string(),
    createdByUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const userId = await ctx.db.insert('users', {
      clerkUserId: args.clerkUserId,
      firstName: args.teamName,
      role: 'AGENCY_USER',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
    return ctx.db.insert('agencyAccounts', {
      agencyId: args.agencyId,
      userId,
      username: args.username,
      teamName: args.teamName,
      status: 'ACTIVE',
      mustChangePassword: true,
      lastPasswordResetAt: now,
      createdByUserId: args.createdByUserId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const createAccount = action({
  args: { agencyId: v.id('agencies'), username: v.string(), teamName: v.string() },
  returns: v.object({ username: v.string(), temporaryPassword: v.string() }),
  handler: async (ctx, args): Promise<{ username: string; temporaryPassword: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Authentication required.');
    const prepared: { adminUserId: Id<'users'>; username: string } = await ctx.runQuery(internal.agencies.prepareAccountCreation, {
      clerkUserId: identity.subject,
      agencyId: args.agencyId,
      username: args.username,
    });
    const teamName = cleanRequired(args.teamName, 'Team name', 100);
    const password = temporaryPassword();
    const clerkUser = await clerkRequest<{ id: string }>('/users', {
      method: 'POST',
      body: JSON.stringify({
        username: prepared.username,
        password,
        first_name: teamName,
        public_metadata: { wedoRole: 'AGENCY_USER' },
      }),
    });
    try {
      await ctx.runMutation(internal.agencies.recordAccountCreation, {
        agencyId: args.agencyId,
        clerkUserId: clerkUser.id,
        username: prepared.username,
        teamName,
        createdByUserId: prepared.adminUserId,
      });
    } catch (error) {
      await clerkRequest(`/users/${encodeURIComponent(clerkUser.id)}`, { method: 'DELETE' }).catch(() => undefined);
      throw error;
    }
    return { username: prepared.username, temporaryPassword: password };
  },
});

export const preparePasswordReset = internalQuery({
  args: { clerkUserId: v.string(), accountId: v.id('agencyAccounts') },
  handler: async (ctx, args) => {
    const admin = await ctx.db.query('users').withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', args.clerkUserId)).unique();
    if (!admin || admin.status !== 'ACTIVE' || !['SUPER_ADMIN', 'ADMIN'].includes(admin.role)) throw new Error('Admin access required.');
    const account = await ctx.db.get(args.accountId);
    if (!account) throw new Error('Agency account not found.');
    const user = await ctx.db.get(account.userId);
    if (!user) throw new Error('Agency user not found.');
    return { clerkUserId: user.clerkUserId, username: account.username };
  },
});

export const recordPasswordReset = internalMutation({
  args: { accountId: v.id('agencyAccounts') },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) throw new Error('Agency account not found.');
    await ctx.db.patch(account._id, { mustChangePassword: true, lastPasswordResetAt: Date.now(), updatedAt: Date.now() });
    return null;
  },
});

export const resetPassword = action({
  args: { accountId: v.id('agencyAccounts') },
  returns: v.object({ username: v.string(), temporaryPassword: v.string() }),
  handler: async (ctx, args): Promise<{ username: string; temporaryPassword: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Authentication required.');
    const prepared: { clerkUserId: string; username: string } = await ctx.runQuery(internal.agencies.preparePasswordReset, { clerkUserId: identity.subject, accountId: args.accountId });
    const password = temporaryPassword();
    await clerkRequest(`/users/${encodeURIComponent(prepared.clerkUserId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ password, sign_out_of_other_sessions: true }),
    });
    await ctx.runMutation(internal.agencies.recordPasswordReset, { accountId: args.accountId });
    return { username: prepared.username, temporaryPassword: password };
  },
});

export const setAccountStatus = mutation({
  args: { accountId: v.id('agencyAccounts'), status },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRole(ctx, ['SUPER_ADMIN', 'ADMIN']);
    const account = await ctx.db.get(args.accountId);
    if (!account) throw new Error('Agency account not found.');
    const user = await ctx.db.get(account.userId);
    if (!user) throw new Error('Agency user not found.');
    await Promise.all([
      ctx.db.patch(account._id, { status: args.status, updatedAt: Date.now() }),
      ctx.db.patch(user._id, { status: args.status, updatedAt: Date.now() }),
    ]);
    return null;
  },
});
