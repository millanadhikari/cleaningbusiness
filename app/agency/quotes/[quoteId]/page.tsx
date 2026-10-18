import { AgencyQuoteDetail } from '@/components/agency/agency-quote-detail';
import type { Id } from '@/convex/_generated/dataModel';
export default async function AgencyQuotePage({ params }: PageProps<'/agency/quotes/[quoteId]'>) { const { quoteId } = await params; return <AgencyQuoteDetail quoteRequestId={quoteId as Id<'quoteRequests'>} />; }
