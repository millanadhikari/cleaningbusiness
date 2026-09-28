'use client';

import { UserButton } from '@clerk/nextjs';
import { useConvexAuth, useQuery } from 'convex/react';
import { CalendarDays, ClipboardCheck, Home, LoaderCircle, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { api } from '@/convex/_generated/api';
import { BrandLogo } from '@/components/brand-logo';
import { cn } from '@/lib/utils';

const nav = [
  { href: '/cleaner', label: 'Home', icon: Home },
  { href: '/cleaner/jobs', label: 'Jobs', icon: ClipboardCheck },
  { href: '/cleaner/availability', label: 'Availability', icon: CalendarDays },
  { href: '/cleaner/profile', label: 'Profile', icon: UserRound },
];

export function CleanerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const cleaner = useQuery(api.cleanerPortal.current, isAuthenticated ? {} : 'skip');
  const onboarding = pathname === '/cleaner/onboarding';

  useEffect(() => {
    if (!cleaner) return;
    const complete = cleaner.onboardingStatus === 'COMPLETED';
    if (!complete && !onboarding) router.replace('/cleaner/onboarding');
    if (complete && onboarding) router.replace('/cleaner');
  }, [cleaner, onboarding, router]);

  if (cleaner === undefined) {
    return <main className="grid min-h-dvh place-items-center bg-[#eef3f2]"><LoaderCircle className="size-8 animate-spin text-[#087f70]" /></main>;
  }

  return (
    <div className="cleaner-portal min-h-dvh bg-[#e9efed] text-[#173c38]">
      <div className="relative mx-auto min-h-dvh w-full max-w-[480px] bg-[#f7f9f8] shadow-[0_0_60px_rgba(23,60,56,0.12)]">
        {!onboarding ? <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-black/5 bg-[#f7f9f8]/95 px-5 backdrop-blur"><BrandLogo href="/cleaner" size="sm" priority /><UserButton /></header> : null}
        <main className={cn('px-5', onboarding ? 'pb-8 pt-6' : 'pb-28 pt-5')}>{children}</main>
        {!onboarding ? <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex h-[76px] max-w-[480px] items-start justify-around border-t border-black/5 bg-white/95 px-3 pt-3 backdrop-blur">
          {nav.map((item) => {
            const active = item.href === '/cleaner' ? pathname === item.href : pathname.startsWith(item.href);
            return <Link key={item.href} href={item.href} className={cn('flex min-w-16 flex-col items-center gap-1 text-[10px] font-semibold', active ? 'text-[#087f70]' : 'text-slate-400')}><span className={cn('grid size-8 place-items-center rounded-xl', active && 'bg-emerald-50')}><item.icon className="size-[19px]" /></span>{item.label}</Link>;
          })}
        </nav> : null}
      </div>
    </div>
  );
}
