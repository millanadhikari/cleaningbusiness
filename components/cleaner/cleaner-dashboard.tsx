'use client';

import { useConvexAuth, useQuery } from 'convex/react';
import { ArrowRight, CalendarCheck, CheckCircle2, ClipboardList, LoaderCircle, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/convex/_generated/api';
import { CleanerJobCard } from './job-card';

export function CleanerDashboard() {
  const { isAuthenticated } = useConvexAuth();
  const data = useQuery(api.cleanerPortal.dashboard, isAuthenticated ? {} : 'skip');
  if (!data) return <div className="grid min-h-72 place-items-center"><LoaderCircle className="animate-spin text-[#087f70]" /></div>;
  return <div className="space-y-6">
    <header><p className="text-sm text-slate-500">Good morning,</p><h1 className="mt-1 text-3xl font-extrabold tracking-[-0.04em]">{data.cleaner.firstName}</h1></header>
    <section className="overflow-hidden rounded-[28px] bg-[#173c38] p-5 shadow-[0_16px_36px_rgba(23,60,56,0.2)]"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold" style={{ color: '#ffffff' }}>Your work week</p><p className="mt-2 text-3xl font-bold" style={{ color: '#ffffff' }}>{data.upcomingCount}</p><p className="text-sm" style={{ color: '#ffffff' }}>upcoming jobs</p></div><span className="grid size-11 place-items-center rounded-2xl bg-white/10" style={{ color: '#ffffff' }}><CalendarCheck /></span></div><Link href="/cleaner/jobs" className="mt-5 flex h-11 items-center justify-center gap-2 rounded-2xl bg-white text-sm font-bold text-[#173c38]">View schedule <ArrowRight className="size-4" /></Link></section>
    <div className="grid grid-cols-2 gap-3"><div className="rounded-[22px] bg-white p-4 shadow-sm"><ClipboardList className="size-5 text-amber-500" /><strong className="mt-3 block text-2xl">{data.offers.length}</strong><span className="text-xs text-slate-500">New offers</span></div><div className="rounded-[22px] bg-white p-4 shadow-sm"><CheckCircle2 className="size-5 text-[#087f70]" /><strong className="mt-3 block text-2xl">{data.completedCount}</strong><span className="text-xs text-slate-500">Completed</span></div></div>
    <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Next job</h2><Link href="/cleaner/jobs" className="text-xs font-semibold text-[#087f70]">See all</Link></div>{data.nextJob ? <CleanerJobCard job={data.nextJob} /> : <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-8 text-center"><Sparkles className="mx-auto size-7 text-slate-300" /><p className="mt-3 font-semibold">Your schedule is clear</p><p className="mt-1 text-sm text-slate-500">New assigned jobs will appear here.</p></div>}</section>
  </div>;
}
