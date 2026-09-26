import { Badge } from '@/components/ui/badge';

export function ServiceStatusBadge({ status }: { status: 'ACTIVE' | 'INACTIVE' }) {
  return (
    <Badge
      variant={status === 'ACTIVE' ? 'secondary' : 'outline'}
      className={status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-800' : 'text-slate-500'}
    >
      {status === 'ACTIVE' ? 'Active' : 'Inactive'}
    </Badge>
  );
}

export function PricingModelBadge({ model }: { model: string }) {
  return <Badge variant="outline" className="whitespace-nowrap">{model.replaceAll('_', ' ')}</Badge>;
}

export function PaymentRequirementBadge({ requirement }: { requirement: string }) {
  return <span className="text-sm text-slate-600">{requirement.replaceAll('_', ' ')}</span>;
}
