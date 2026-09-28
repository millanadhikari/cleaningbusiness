import type { Id } from '@/convex/_generated/dataModel';
import { CleanerJobDetail } from '@/components/cleaner/cleaner-job-detail';

export default async function CleanerJobPage({ params }: PageProps<'/cleaner/jobs/[bookingId]'>) {
  const { bookingId } = await params;
  return <CleanerJobDetail bookingId={bookingId as Id<'bookings'>} />;
}
