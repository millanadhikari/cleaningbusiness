import { AgencyJobDetail } from '@/components/agency/agency-job-detail';
import type { Id } from '@/convex/_generated/dataModel';
export default async function AgencyJobPage({ params }: PageProps<'/agency/jobs/[bookingId]'>) { const { bookingId } = await params; return <AgencyJobDetail bookingId={bookingId as Id<'bookings'>} />; }
