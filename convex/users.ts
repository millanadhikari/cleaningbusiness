import { v } from 'convex/values';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { requireSuperAdmin, requireUser } from './lib/auth';

const userRole = v.union(
  v.literal('SUPER_ADMIN'),
  v.literal('ADMIN'),
  v.literal('CLEANER'),
);
const adminRole = v.union(v.literal('SUPER_ADMIN'), v.literal('ADMIN'));
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

export const currentAdmin = query({
  args: {},
  returns: v.object({
    name: v.string(),
    email: v.optional(v.string()),
    role: adminRole,
  }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      throw new Error('Admin access required.');
    }
    return {
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Admin',
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
      role: adminRole,
      status: userStatus,
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);

    const users = (await ctx.db.query('users').order('desc').collect()).filter(
      (user): user is typeof user & { role: 'SUPER_ADMIN' | 'ADMIN' } =>
        user.role === 'SUPER_ADMIN' || user.role === 'ADMIN',
    );

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

export const assertCanInviteAdmin = internalQuery({
  args: { email: v.string() },
  returns: v.id('users'),
  handler: async (ctx, args) => {
    const superAdmin = await requireSuperAdmin(ctx);
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_email', (index) => index.eq('email', args.email))
      .unique();

    if (existingUser) {
      throw new Error('An internal user already uses that email address.');
    }

    return superAdmin._id;
  },
});

export const recordAdminInvitation = internalMutation({
  args: {
    email: v.string(),
    clerkInvitationId: v.string(),
    invitedByUserId: v.id('users'),
    expiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existingInvitation = await ctx.db
      .query('adminInvitations')
      .withIndex('by_email', (index) => index.eq('email', args.email))
      .unique();
    const now = Date.now();

    if (existingInvitation) {
      await ctx.db.patch(existingInvitation._id, {
        clerkInvitationId: args.clerkInvitationId,
        invitedByUserId: args.invitedByUserId,
        status: 'PENDING',
        expiresAt: args.expiresAt,
        acceptedAt: undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert('adminInvitations', {
        ...args,
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      });
    }

    return null;
  },
});

export const provisionInvitedAdmin = internalMutation({
  args: {
    clerkUserId: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.string(),
  },
  returns: v.id('users'),
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_clerk_user_id', (index) =>
        index.eq('clerkUserId', args.clerkUserId),
      )
      .unique();

    if (existingUser) {
      if (existingUser.status !== 'ACTIVE') {
        throw new Error('This admin account is inactive. Contact a Super Admin.');
      }
      return existingUser._id;
    }

    const invitation = await ctx.db
      .query('adminInvitations')
      .withIndex('by_email', (index) => index.eq('email', args.email))
      .unique();

    if (!invitation || invitation.status !== 'PENDING') {
      throw new Error('No pending admin invitation was found for this email.');
    }

    if (invitation.expiresAt < Date.now()) {
      throw new Error('This admin invitation has expired. Ask a Super Admin to send a new one.');
    }

    const existingEmailUser = await ctx.db
      .query('users')
      .withIndex('by_email', (index) => index.eq('email', args.email))
      .unique();

    if (existingEmailUser) {
      throw new Error('An internal user already uses this email address.');
    }

    const now = Date.now();
    const userId = await ctx.db.insert('users', {
      clerkUserId: args.clerkUserId,
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(invitation._id, {
      status: 'ACCEPTED',
      acceptedAt: now,
      updatedAt: now,
    });

    return userId;
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
    if (targetUser.role !== 'ADMIN') {
      throw new Error('Only Admin accounts can be changed here.');
    }

    await ctx.db.patch(targetUser._id, {
      status: args.status,
      updatedAt: Date.now(),
    });

    return null;
  },
});
