'use client';

import { useQuery } from 'convex/react';
import { ArrowRight, BriefcaseBusiness, CalendarCheck, ClipboardList, LoaderCircle, Plus } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/convex/_generated/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function AgencyDashboard() {
  const data = useQuery(api.agencyPortal.dashboard);
  if (!data) return <div className="grid min-h-72 place-items-center"><LoaderCircle className="animate-spin text-[#087f70]" /></div>;
  return <div className="space-y-6">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-[#087f70]">{data.agency.branchName || data.agency.name}</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">Welcome, {data.account.teamName}</h1><p className="mt-2 text-sm text-slate-500">Track requests and cleaning jobs across your properties.</p></div><Button asChild><Link href="/agency/quotes/new"><Plus /> Request a quote</Link></Button></header>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat icon={ClipboardList} label="Quotes pending" value={data.quoteCounts.pending} /><Stat icon={ClipboardList} label="Quotes ready" value={data.quoteCounts.ready} /><Stat icon={CalendarCheck} label="Accepted quotes" value={data.quoteCounts.accepted} /><Stat icon={BriefcaseBusiness} label="Upcoming jobs" value={data.upcomingCount} /></section>
    {data.nextJob ? <section className="rounded-[24px] bg-[#173c38] p-5 shadow-[0_16px_36px_rgba(23,60,56,0.2)]"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#d9f5ec' }}>Next scheduled job</p><h2 className="mt-2 text-xl font-bold" style={{ color: '#ffffff' }}>{data.nextJob.addressLine1}</h2><p className="mt-1 text-sm" style={{ color: '#eef7f4' }}>{data.nextJob.suburb} · {data.nextJob.scheduledDate} at {data.nextJob.scheduledTime}</p></div><CalendarCheck className="size-7" style={{ color: '#d9f5ec' }} /></div><Button asChild variant="secondary" className="mt-5"><Link href={`/agency/jobs/${data.nextJob._id}`}>View job <ArrowRight /></Link></Button></section> : null}
    <section className="rounded-[24px] border border-[#dce8e3] bg-white p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-bold">Recent quotes</h2><p className="text-sm text-slate-500">Latest requests from your agency.</p></div><Link href="/agency/quotes" className="text-sm font-bold text-[#087f70]">View all</Link></div>{data.recentQuotes.length ? <div className="divide-y">{data.recentQuotes.map((quote) => <Link key={quote._id} href={`/agency/quotes/${quote._id}`} className="flex items-center justify-between gap-4 py-3 hover:bg-slate-50"><div className="min-w-0"><p className="truncate font-semibold">{quote.reference || 'Quote request'}</p><p className="truncate text-sm text-slate-500">{quote.serviceType} · {quote.suburb}</p></div><Badge variant="outline">{quote.status}</Badge></Link>)}</div> : <p className="rounded-xl border border-dashed p-7 text-center text-sm text-slate-500">No quote requests yet.</p>}</section>
  </div>;
}

function Stat({ icon: Icon, label, value }: { icon: typeof ClipboardList; label: string; value: number }) {
  return <div className="rounded-[20px] border border-[#dce8e3] bg-white p-4"><Icon className="size-5 text-[#087f70]" /><strong className="mt-3 block text-2xl">{value}</strong><span className="text-xs text-slate-500">{label}</span></div>;
}
