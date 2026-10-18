import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type QuoteStatus =
  | 'NEW'
  | 'REVIEWING'
  | 'QUOTED'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'EXPIRED';

const statusStyles: Record<QuoteStatus, string> = {
  NEW: 'border-blue-200 bg-blue-50 text-blue-700',
  REVIEWING: 'border-amber-200 bg-amber-50 text-amber-800',
  QUOTED: 'border-violet-200 bg-violet-50 text-violet-700',
  ACCEPTED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  DECLINED: 'border-red-200 bg-red-50 text-red-700',
  EXPIRED: 'border-slate-200 bg-slate-100 text-slate-600',
};

export function formatQuoteStatus(status: QuoteStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return (
    <Badge variant="outline" className={cn('font-semibold', statusStyles[status])}>
      {formatQuoteStatus(status)}
    </Badge>
  );
}
