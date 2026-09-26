import type { Id } from '@/convex/_generated/dataModel';
import { BookingDetail } from '@/components/admin/booking-detail';

export default async function BookingDetailPage({ params }: PageProps<'/admin/bookings/[bookingId]'>) {
  const { bookingId } = await params;
  return <BookingDetail bookingId={bookingId as Id<'bookings'>} />;
}
