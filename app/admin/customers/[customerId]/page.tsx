import type { Id } from '@/convex/_generated/dataModel';
import { CustomerDetail } from '@/components/admin/customer-detail';

export default async function CustomerDetailPage({ params }: PageProps<'/admin/customers/[customerId]'>) {
  const { customerId } = await params;
  return <CustomerDetail customerId={customerId as Id<'customers'>} />;
}
