import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';

type AuthContext = Pick<QueryCtx, 'auth' | 'db'>;
type UserRole = Doc<'users'>['role'];

export async function requireUser(ctx: AuthContext): Promise<Doc<'users'>> {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new Error('Authentication required.');
  }

  const user = await ctx.db
    .query('users')
    .withIndex('by_clerk_user_id', (query) =>
      query.eq('clerkUserId', identity.subject),
    )
    .unique();

  if (!user) {
    throw new Error('Authenticated user is not registered as an internal admin.');
  }

  if (user.status !== 'ACTIVE') {
    throw new Error('User account is inactive.');
  }

  return user;
}

export async function requireRole(
  ctx: AuthContext,
  roles: readonly UserRole[],
): Promise<Doc<'users'>> {
  const user = await requireUser(ctx);

  if (!roles.includes(user.role)) {
    throw new Error('You do not have permission to perform this action.');
  }

  return user;
}

export function requireSuperAdmin(ctx: AuthContext): Promise<Doc<'users'>> {
  return requireRole(ctx, ['SUPER_ADMIN']);
}

export async function requireCleaner(ctx: AuthContext) {
  const user = await requireRole(ctx, ['CLEANER']);
  const cleaner = await ctx.db
    .query('cleaners')
    .withIndex('by_user', (query) => query.eq('userId', user._id))
    .unique();
  if (!cleaner || cleaner.status !== 'ACTIVE') {
    throw new Error('Cleaner profile is unavailable or inactive.');
  }
  return { user, cleaner };
}

export async function requireAgencyAccount(
  ctx: AuthContext,
  options: { allowPasswordChangePending?: boolean } = {},
) {
  const user = await requireRole(ctx, ['AGENCY_USER']);
  const account = await ctx.db
    .query('agencyAccounts')
    .withIndex('by_user', (query) => query.eq('userId', user._id))
    .unique();
  if (!account || account.status !== 'ACTIVE') {
    throw new Error('Agency portal account is unavailable or inactive.');
  }
  const agency = await ctx.db.get(account.agencyId);
  if (!agency || agency.status !== 'ACTIVE') {
    throw new Error('Agency access is inactive. Contact WeDo Cleaning.');
  }
  if (account.mustChangePassword && !options.allowPasswordChangePending) {
    throw new Error('Change your temporary password before continuing.');
  }
  return { user, account, agency };
}
