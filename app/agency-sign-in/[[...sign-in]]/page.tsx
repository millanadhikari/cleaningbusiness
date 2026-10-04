'use client';

import { SignIn } from '@clerk/nextjs';
import { Building2 } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';

export default function AgencySignInPage() {
  return <main className="grid min-h-dvh place-items-center bg-[#edf3f1] px-4 py-8"><div className="w-full max-w-md rounded-[28px] border border-[#dce8e3] bg-white p-6 shadow-[0_24px_70px_rgba(20,47,54,0.12)] sm:p-8"><BrandLogo href="/" priority /><div className="my-7"><span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-[#087f70]"><Building2 /></span><p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-[#087f70]">Real estate partner portal</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight">Welcome back</h1><p className="mt-2 text-sm text-slate-500">Sign in with the username and password provided by WeDo Cleaning.</p></div><SignIn path="/agency-sign-in" routing="path" fallbackRedirectUrl="/auth/continue" forceRedirectUrl="/auth/continue" withSignUp={false} transferable={false} appearance={{ variables: { colorPrimary: '#087f70', borderRadius: '0.75rem' }, elements: { rootBox: 'w-full', cardBox: 'w-full shadow-none', card: 'w-full border-0 p-0 shadow-none', header: 'hidden', footer: 'hidden' } }} /><p className="mt-6 border-t pt-5 text-center text-xs text-slate-500">No self-registration or email recovery. Contact WeDo Cleaning if you need access restored.</p></div></main>;
}
