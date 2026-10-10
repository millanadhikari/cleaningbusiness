import { v } from 'convex/values';
import { internal } from './_generated/api';
import { action, internalQuery, query } from './_generated/server';
import { requireSuperAdmin } from './lib/auth';

const DAY_MS = 24 * 60 * 60 * 1000;
const RESEND_DAILY_LIMIT = 100;
const RESEND_MONTHLY_LIMIT = 3_000;
const CLERK_MONTHLY_RETAINED_USER_LIMIT = 50_000;
const CLOUDFLARE_DAILY_NEURON_LIMIT = 10_000;

function utcDayStart(value: number) {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function utcMonthStart(value: number) {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function extractClerkCount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || value === null) return undefined;

  const record = value as Record<string, unknown>;
  const count = record.total_count ?? record.totalCount ?? record.count;
  return typeof count === 'number' && Number.isFinite(count) ? count : undefined;
}

export const overview = query({
  args: {},
  returns: v.object({
    updatedAt: v.number(),
    daily: v.object({
      sent: v.number(),
      failed: v.number(),
      pending: v.number(),
      limit: v.number(),
      startsAt: v.number(),
    }),
    monthly: v.object({
      sent: v.number(),
      failed: v.number(),
      pending: v.number(),
      limit: v.number(),
      startsAt: v.number(),
    }),
    emailTrend: v.array(
      v.object({
        date: v.string(),
        sent: v.number(),
        failed: v.number(),
      }),
    ),
    cloudflare: v.object({
      inputTokens: v.number(),
      outputTokens: v.number(),
      totalTokens: v.number(),
      estimatedNeurons: v.number(),
      limitNeurons: v.number(),
      startsAt: v.number(),
      requestCount: v.number(),
    }),
  }),
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);

    const updatedAt = Date.now();
    const todayStart = utcDayStart(updatedAt);
    const monthStart = utcMonthStart(updatedAt);
    const trendStart = todayStart - DAY_MS * 6;
    const logs = await ctx.db
      .query('emailLogs')
      .withIndex('by_created_at', (index) =>
        index.gte('createdAt', Math.min(monthStart, trendStart)),
      )
      .collect();
    const aiUsage = await ctx.db
      .query('aiUsageEvents')
      .withIndex('by_provider_and_created_at', (index) =>
        index.eq('provider', 'CLOUDFLARE').gte('createdAt', todayStart),
      )
      .collect();

    const daily = { sent: 0, failed: 0, pending: 0 };
    const monthly = { sent: 0, failed: 0, pending: 0 };
    const trend = Array.from({ length: 7 }, (_, index) => {
      const timestamp = trendStart + index * DAY_MS;
      return {
        date: new Date(timestamp).toISOString().slice(0, 10),
        sent: 0,
        failed: 0,
      };
    });

    for (const log of logs) {
      if (log.createdAt >= monthStart) monthly[log.status.toLowerCase() as keyof typeof monthly] += 1;
      if (log.createdAt >= todayStart) daily[log.status.toLowerCase() as keyof typeof daily] += 1;

      const trendIndex = Math.floor((utcDayStart(log.createdAt) - trendStart) / DAY_MS);
      if (trendIndex >= 0 && trendIndex < trend.length && log.status !== 'PENDING') {
        trend[trendIndex][log.status === 'SENT' ? 'sent' : 'failed'] += 1;
      }
    }

    return {
      updatedAt,
      daily: { ...daily, limit: RESEND_DAILY_LIMIT, startsAt: todayStart },
      monthly: { ...monthly, limit: RESEND_MONTHLY_LIMIT, startsAt: monthStart },
      emailTrend: trend,
      cloudflare: {
        inputTokens: aiUsage.reduce((sum, item) => sum + item.inputTokens, 0),
        outputTokens: aiUsage.reduce((sum, item) => sum + item.outputTokens, 0),
        totalTokens: aiUsage.reduce((sum, item) => sum + item.totalTokens, 0),
        estimatedNeurons: aiUsage.reduce(
          (sum, item) => sum + (item.estimatedNeurons ?? 0),
          0,
        ),
        limitNeurons: CLOUDFLARE_DAILY_NEURON_LIMIT,
        startsAt: todayStart,
        requestCount: aiUsage.length,
      },
    };
  },
});

export const assertSuperAdmin = internalQuery({
  args: { clerkUserId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk_user_id', (index) =>
        index.eq('clerkUserId', args.clerkUserId),
      )
      .unique();

    if (!user || user.status !== 'ACTIVE' || user.role !== 'SUPER_ADMIN') {
      throw new Error('Super Admin access is required.');
    }

    return null;
  },
});

export const providerSnapshot = action({
  args: {},
  returns: v.object({
    updatedAt: v.number(),
    resendConfigured: v.boolean(),
    stripeConfigured: v.boolean(),
    cloudflareConfigured: v.boolean(),
    clerk: v.object({
      status: v.union(
        v.literal('AVAILABLE'),
        v.literal('NOT_CONFIGURED'),
        v.literal('UNAVAILABLE'),
      ),
      totalUsers: v.optional(v.number()),
      activeThisMonth: v.optional(v.number()),
      limit: v.number(),
      message: v.optional(v.string()),
    }),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Authentication required.');

    await ctx.runQuery(internal.platformUsage.assertSuperAdmin, {
      clerkUserId: identity.subject,
    });

    const updatedAt = Date.now();
    const secretKey = process.env.CLERK_SECRET_KEY?.trim();
    const baseResult = {
      updatedAt,
      resendConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
      stripeConfigured: Boolean(process.env.STRIPE_API_KEY?.trim()),
      cloudflareConfigured: Boolean(
        process.env.CLOUDFLARE_ACCOUNT_ID?.trim() &&
        process.env.CLOUDFLARE_API_TOKEN?.trim(),
      ),
    };

    if (!secretKey) {
      return {
        ...baseResult,
        clerk: {
          status: 'NOT_CONFIGURED' as const,
          limit: CLERK_MONTHLY_RETAINED_USER_LIMIT,
          message: 'CLERK_SECRET_KEY is not configured in this Convex deployment.',
        },
      };
    }

    const monthStart = utcMonthStart(updatedAt);
    const headers = { Authorization: `Bearer ${secretKey}` };

    try {
      const [totalResponse, activeResponse] = await Promise.all([
        fetch('https://api.clerk.com/v1/users/count', { headers }),
        fetch(
          `https://api.clerk.com/v1/users/count?last_sign_in_at_after=${monthStart}`,
          { headers },
        ),
      ]);

      if (!totalResponse.ok || !activeResponse.ok) {
        return {
          ...baseResult,
          clerk: {
            status: 'UNAVAILABLE' as const,
            limit: CLERK_MONTHLY_RETAINED_USER_LIMIT,
            message: 'Clerk usage could not be refreshed. Try again shortly.',
          },
        };
      }

      const [totalPayload, activePayload] = await Promise.all([
        totalResponse.json() as Promise<unknown>,
        activeResponse.json() as Promise<unknown>,
      ]);
      const totalUsers = extractClerkCount(totalPayload);
      const activeThisMonth = extractClerkCount(activePayload);

      if (totalUsers === undefined || activeThisMonth === undefined) {
        return {
          ...baseResult,
          clerk: {
            status: 'UNAVAILABLE' as const,
            limit: CLERK_MONTHLY_RETAINED_USER_LIMIT,
            message: 'Clerk returned an unexpected usage response.',
          },
        };
      }

      return {
        ...baseResult,
        clerk: {
          status: 'AVAILABLE' as const,
          totalUsers,
          activeThisMonth,
          limit: CLERK_MONTHLY_RETAINED_USER_LIMIT,
        },
      };
    } catch {
      return {
        ...baseResult,
        clerk: {
          status: 'UNAVAILABLE' as const,
          limit: CLERK_MONTHLY_RETAINED_USER_LIMIT,
          message: 'Clerk usage could not be refreshed. Try again shortly.',
        },
      };
    }
  },
});
