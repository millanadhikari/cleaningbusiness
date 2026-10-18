'use client';

import { useConvexAuth, useQuery } from 'convex/react';
import { ArrowLeft, ArrowRight, LoaderCircle, Mail, Phone } from 'lucide-react';
import Link from 'next/link';
import type { Id } from '@/convex/_generated/dataModel';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { QuoteStatusBadge } from './quote-status-badge';

function formatDate(value: number) {
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(value);
}

export function CustomerDetail({ customerId }: { customerId: Id<'customers'> }) {
  const { isAuthenticated } = useConvexAuth();
  const customer = useQuery(api.customers.get, isAuthenticated ? { customerId } : 'skip');

  if (customer === undefined) {
    return <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin" />Loading customer…</div>;
  }
  if (customer === null) {
    return (
      <Card className="max-w-xl">
        <CardHeader><CardTitle>Customer not found</CardTitle><CardDescription>This customer may have been removed or the link is invalid.</CardDescription></CardHeader>
        <CardContent><Button asChild variant="outline"><Link href="/admin/customers"><ArrowLeft />Back to customers</Link></Button></CardContent>
      </Card>
    );
  }

  const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ');

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2"><Link href="/admin/customers"><ArrowLeft />Back to customers</Link></Button>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{name}</h2>
        <p className="mt-2 text-sm text-slate-500">Customer since {formatDate(customer.createdAt)}</p>
      </div>

      <Card className="gap-5 border-slate-200 shadow-sm">
        <CardHeader><CardTitle className="text-base">Contact details</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {customer.email ? (
            <a href={`mailto:${customer.email}`} className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-700 hover:text-emerald-800"><Mail className="size-4 text-emerald-700" />{customer.email}</a>
          ) : (
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500"><Mail className="size-4 text-slate-400" />No email provided</div>
          )}
          <a href={`tel:${customer.phone}`} className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-700 hover:text-emerald-800"><Phone className="size-4 text-emerald-700" />{customer.phone}</a>
        </CardContent>
      </Card>

      <Card className="gap-0 border-slate-200 py-0 shadow-sm">
        <CardHeader className="border-b border-slate-100 px-6 py-5">
          <CardTitle className="text-base">Quote request history</CardTitle>
          <CardDescription>{customer.quoteRequests.length} request{customer.quoteRequests.length === 1 ? '' : 's'}</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {customer.quoteRequests.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">No quote requests yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {customer.quoteRequests.map((quote) => (
                <Link key={quote._id} href={`/admin/quotes/${quote._id}`} className="flex flex-col gap-3 px-6 py-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{quote.serviceType}</p>
                    <p className="mt-1 text-xs text-slate-500">{quote.suburb} · {formatDate(quote.createdAt)}</p>
                  </div>
                  <QuoteStatusBadge status={quote.status} />
                  <ArrowRight className="size-4 text-slate-400" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
