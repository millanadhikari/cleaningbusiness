import type { Id } from '@/convex/_generated/dataModel';
import { QuoteRequestDetail } from '@/components/admin/quote-request-detail';

export default async function QuoteDetailPage({ params }: PageProps<'/admin/quotes/[quoteId]'>) {
  const { quoteId } = await params;
  return <QuoteRequestDetail quoteRequestId={quoteId as Id<'quoteRequests'>} />;
}
