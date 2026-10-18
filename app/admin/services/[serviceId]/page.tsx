import type { Id } from '@/convex/_generated/dataModel';
import { ServiceDetailManager } from '@/components/admin/service-detail-manager';

export default async function ServiceDetailPage({ params }: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await params;
  return <ServiceDetailManager serviceId={serviceId as Id<'services'>} />;
}
