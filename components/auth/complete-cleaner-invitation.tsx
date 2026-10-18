'use client';

import { useAction, useConvexAuth } from 'convex/react';
import { CircleAlert, LoaderCircle, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/convex/_generated/api';
import { BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui/button';

export function CompleteCleanerInvitation() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const complete = useAction(api.cleaners.completeInvitation);
  const started = useRef(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (isLoading || !isAuthenticated || started.current) return;
    started.current = true;
    void complete({}).then(() => window.location.replace('/cleaner/onboarding')).catch((value: unknown) => {
      setError(value instanceof Error ? value.message : 'Unable to finish setting up your cleaner account.');
    });
  }, [complete, isAuthenticated, isLoading]);

  return (
    <main className="grid min-h-dvh place-items-center bg-[#eef3f2] px-5 py-8">
      <section className="w-full max-w-md rounded-[32px] bg-white p-7 text-center shadow-[0_24px_80px_rgba(23,60,56,0.12)]">
        <BrandLogo className="mx-auto" priority />
        {error ? <><CircleAlert className="mx-auto mt-10 size-11 text-red-600" /><h1 className="mt-4 text-2xl font-bold text-[#173c38]">Setup needs attention</h1><p className="mt-3 text-sm leading-6 text-slate-600">{error}</p><Button asChild className="mt-6 w-full"><Link href="/sign-in">Return to sign in</Link></Button></> : <><LoaderCircle className="mx-auto mt-10 size-11 animate-spin text-[#087f70]" /><h1 className="mt-4 text-2xl font-bold text-[#173c38]">Preparing your workspace</h1><p className="mt-3 flex items-center justify-center gap-2 text-sm text-slate-600"><Sparkles className="size-4" /> Your onboarding will open shortly.</p></>}
      </section>
    </main>
  );
}
