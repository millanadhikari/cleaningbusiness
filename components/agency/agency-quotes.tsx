'use client';

import { useQuery } from 'convex/react';
import { ClipboardList, LoaderCircle, Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { api } from '@/convex/_generated/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';

function money(cents: number | undefined) { return cents === undefined ? 'Pending review' : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100); }

export function AgencyQuotes() {
  const quotes = useQuery(api.agencyPortal.listQuotes);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const filtered = useMemo(() => (quotes ?? []).filter((quote) => (status === 'ALL' || quote.status === status) && (!search.trim() || [quote.reference, quote.serviceType, quote.suburb, quote.addressLine1, quote.customer?.firstName, quote.customer?.lastName].filter(Boolean).some((value) => String(value).toLowerCase().includes(search.trim().toLowerCase())))), [quotes, search, status]);
  if (!quotes) return <div className="grid min-h-72 place-items-center"><LoaderCircle className="animate-spin text-[#087f70]" /></div>;
  return <div className="space-y-5"><header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-[#087f70]">Quotes</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">Quote requests</h1><p className="mt-2 text-sm text-slate-500">View requests submitted by every team in your agency.</p></div><Button asChild><Link href="/agency/quotes/new"><Plus /> New request</Link></Button></header><div className="grid gap-3 rounded-2xl border bg-white p-3 sm:grid-cols-[1fr_190px]"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search quotes or properties" /><NativeSelect value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option><option value="NEW">New</option><option value="REVIEWING">Reviewing</option><option value="QUOTED">Quoted</option><option value="ACCEPTED">Accepted</option><option value="DECLINED">Declined</option><option value="EXPIRED">Expired</option></NativeSelect></div>{filtered.length ? <div className="grid gap-3">{filtered.map((quote) => <Link key={quote._id} href={`/agency/quotes/${quote._id}`} className="rounded-[20px] border border-[#dce8e3] bg-white p-4 transition hover:border-emerald-300 hover:shadow-sm"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="font-bold">{quote.reference || 'Quote request'}</p><p className="mt-1 truncate text-sm text-slate-600">{quote.serviceType} · {quote.addressLine1}, {quote.suburb}</p><p className="mt-2 text-xs text-slate-400">Requested {new Date(quote.createdAt).toLocaleDateString('en-AU')}</p></div><div className="text-right"><Badge variant="outline">{quote.status}</Badge><p className="mt-2 text-sm font-bold">{money(quote.estimatedTotalCents)}</p></div></div></Link>)}</div> : <div className="rounded-[20px] border border-dashed bg-white p-10 text-center"><ClipboardList className="mx-auto text-slate-300" /><p className="mt-3 font-semibold">No matching quotes</p></div>}</div>;
}
