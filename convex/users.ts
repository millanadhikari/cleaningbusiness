import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireSuperAdmin, requireUser } from './lib/auth';

const userRole = v.union(v.literal('SUPER_ADMIN'), v.literal('ADMIN'));
const userStatus = v.union(v.literal('ACTIVE'), v.literal('INACTIVE'));

export const current = query({
  args: {},
  returns: v.object({
    name: v.string(),
    email: v.optional(v.string()),
    role: userRole,
  }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');

    return {
      name: fullName || user.email || 'Admin',
      email: user.email,
      role: user.role,
    };
  },
});

export const listInternalUsers = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('users'),
      clerkUserId: v.string(),
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      email: v.optional(v.string()),
      role: userRole,
      status: userStatus,
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);

    const users = await ctx.db.query('users').order('desc').collect();

    return users.map((user) => ({
      _id: user._id,
      clerkUserId: user.clerkUserId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
    }));
  },
});

export const createAdmin = mutation({
  args: {
    clerkUserId: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  returns: v.id('users'),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);

    const clerkUserId = args.clerkUserId.trim();
    const firstName = args.firstName?.trim() || undefined;
    const lastName = args.lastName?.trim() || undefined;
    const email = args.email?.trim().toLowerCase() || undefined;

    if (!clerkUserId.startsWith('user_')) {
      throw new Error('Enter a valid Clerk user ID beginning with user_.');
    }

    if (email && !email.includes('@')) {
      throw new Error('Enter a valid email address.');
    }

    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_clerk_user_id', (index) =>
        index.eq('clerkUserId', clerkUserId),
      )
      .unique();

    if (existingUser) {
      throw new Error('That Clerk user is already registered.');
    }

    const now = Date.now();

    return ctx.db.insert('users', {
      clerkUserId,
      firstName,
      lastName,
      email,
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setAdminStatus = mutation({
  args: {
    userId: v.id('users'),
    status: userStatus,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);

    const targetUser = await ctx.db.get(args.userId);

    if (!targetUser) {
      throw new Error('Admin user not found.');
    }

    if (targetUser.role === 'SUPER_ADMIN') {
      throw new Error('Super Admin accounts cannot be changed here.');
    }

    await ctx.db.patch(targetUser._id, {
      status: args.status,
      updatedAt: Date.now(),
    });

    return null;
  },
});
