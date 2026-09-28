import type { Id } from '@/convex/_generated/dataModel';
import { CleanerDetail } from '@/components/admin/cleaner-detail';

export default async function CleanerDetailPage({ params }: PageProps<'/admin/cleaners/[cleanerId]'>) {
  const { cleanerId } = await params;
  return <CleanerDetail cleanerId={cleanerId as Id<'cleaners'>} />;
}
