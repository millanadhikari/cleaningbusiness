import { AdminQuoteForm } from "@/components/admin/admin-quote-form";
import type { Id } from "@/convex/_generated/dataModel";

export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ quoteId: string }>;
}) {
  const { quoteId } = await params;
  return <AdminQuoteForm quoteRequestId={quoteId as Id<"quoteRequests">} />;
}
