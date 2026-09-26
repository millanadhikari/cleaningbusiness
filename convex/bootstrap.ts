import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

export const bootstrapFirstSuperAdmin = internalMutation({
  args: {
    clerkUserId: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  returns: v.id('users'),
  handler: async (ctx, args) => {
    const existingUser = await ctx.db.query('users').first();

    if (existingUser) {
      if (
        existingUser.clerkUserId === 'user_REPLACE_ME' &&
        existingUser.role === 'SUPER_ADMIN'
      ) {
        await ctx.db.patch(existingUser._id, {
          clerkUserId: args.clerkUserId,
          firstName: args.firstName,
          lastName: args.lastName,
          email: args.email,
          status: 'ACTIVE',
          updatedAt: Date.now(),
        });

        return existingUser._id;
      }

      throw new Error(
        'Bootstrap refused: the users table is not empty. Manage additional admins through an authenticated server-side flow.',
      );
    }

    const now = Date.now();

    return ctx.db.insert('users', {
      clerkUserId: args.clerkUserId,
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
  },
});
