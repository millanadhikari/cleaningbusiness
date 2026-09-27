import { v } from 'convex/values';
import { internalQuery } from './_generated/server';
import { requireRole } from './lib/auth';

export const prepare = internalQuery({
  args: { bookingId: v.id('bookings') },
  handler: async (ctx, args) => {
    await requireRole(ctx, ['SUPER_ADMIN', 'ADMIN']);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error('Booking not found.');
    if (!booking.reference) {
      throw new Error('This booking needs a reference before an invoice can be generated.');
    }

    const [customer, service, adjustments, payments] = await Promise.all([
      ctx.db.get(booking.customerId),
      ctx.db.get(booking.serviceId),
      ctx.db
        .query('bookingAdjustments')
        .withIndex('by_booking_and_created_at', (index) =>
          index.eq('bookingId', booking._id),
        )
        .collect(),
      ctx.db
        .query('bookingPayments')
        .withIndex('by_booking_and_created_at', (index) =>
          index.eq('bookingId', booking._id),
        )
        .collect(),
    ]);
    if (!customer) throw new Error('The booking customer could not be found.');

    const adjustmentsTotalCents = adjustments.reduce(
      (total, adjustment) => total + adjustment.amountCents,
      0,
    );
    const originalTotalCents =
      booking.estimatedTotalCents ??
      booking.finalTotalCents - adjustmentsTotalCents;
    const hasInitialPaymentRecord = payments.some(
      (payment) => payment.kind === 'INITIAL',
    );
    const legacyPaidCents =
      booking.paymentLedgerInitializedAt || hasInitialPaymentRecord
        ? 0
        : booking.paymentStatus === 'PAID'
          ? originalTotalCents
          : booking.paymentStatus === 'DEPOSIT_PAID'
            ? (booking.depositAmountCents ?? 0)
            : 0;
    const paidCents =
      legacyPaidCents +
      payments
        .filter((payment) => payment.status === 'PAID')
        .reduce((total, payment) => total + payment.amountCents, 0);

    const baseItems = booking.estimateBreakdown.map((item) => ({
      description: item.label,
      quantity: 1,
      unitAmountCents: item.amount,
      amountCents: item.amount,
    }));
    const baseItemsTotal = baseItems.reduce(
      (total, item) => total + item.amountCents,
      0,
    );
    if (baseItems.length === 0) {
      baseItems.push({
        description: service?.name ?? 'Cleaning service',
        quantity: 1,
        unitAmountCents: originalTotalCents,
        amountCents: originalTotalCents,
      });
    } else if (baseItemsTotal !== originalTotalCents) {
      const difference = originalTotalCents - baseItemsTotal;
      baseItems.push({
        description: `${service?.name ?? 'Booking'} total adjustment`,
        quantity: 1,
        unitAmountCents: difference,
        amountCents: difference,
      });
    }

    const items = [
      ...baseItems,
      ...adjustments.map((adjustment) => ({
        description: adjustment.description,
        quantity: 1,
        unitAmountCents: adjustment.amountCents,
        amountCents: adjustment.amountCents,
      })),
    ];
    const customerName = [customer.firstName, customer.lastName]
      .filter(Boolean)
      .join(' ');
    const customerAddress = [
      booking.addressLine1,
      booking.addressLine2,
      `${booking.suburb} ${booking.state} ${booking.postcode}`,
    ]
      .filter(Boolean)
      .join(', ');

    return {
      bookingId: booking._id,
      customerId: customer._id,
      invoiceNumber: booking.reference,
      customerName,
      customerFirstName: customer.firstName,
      customerEmail: customer.email,
      customerAddress,
      serviceName: service?.name ?? 'Cleaning service',
      scheduledDate: booking.scheduledDate,
      items,
      totalCents: booking.finalTotalCents,
      paidCents,
      balanceDueCents: Math.max(0, booking.finalTotalCents - paidCents),
      refundDueCents: Math.max(0, paidCents - booking.finalTotalCents),
    };
  },
});
