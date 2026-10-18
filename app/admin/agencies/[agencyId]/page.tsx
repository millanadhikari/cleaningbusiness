import { AgencyDetail } from '@/components/admin/agency-detail';
import type { Id } from '@/convex/_generated/dataModel';

export default async function AgencyDetailPage({ params }: PageProps<'/admin/agencies/[agencyId]'>) {
  const { agencyId } = await params;
  return <AgencyDetail agencyId={agencyId as Id<'agencies'>} />;
}
