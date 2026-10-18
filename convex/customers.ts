import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireRole } from './lib/auth';

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ['SUPER_ADMIN', 'ADMIN']);
    const customers = await ctx.db.query('customers').order('desc').take(100);

    return Promise.all(
      customers.map(async (customer) => {
        const quotes = await ctx.db
          .query('quoteRequests')
          .withIndex('by_customer', (index) =>
            index.eq('customerId', customer._id),
          )
          .collect();

        return {
          ...customer,
          quoteRequestCount: quotes.length,
        };
      }),
    );
  },
});

export const get = query({
  args: { customerId: v.id('customers') },
  handler: async (ctx, args) => {
    await requireRole(ctx, ['SUPER_ADMIN', 'ADMIN']);
    const customer = await ctx.db.get(args.customerId);
    if (!customer) return null;
    const quoteRequests = await ctx.db
      .query('quoteRequests')
      .withIndex('by_customer', (index) =>
        index.eq('customerId', customer._id),
      )
      .order('desc')
      .take(50);
    return { ...customer, quoteRequests };
  },
});
