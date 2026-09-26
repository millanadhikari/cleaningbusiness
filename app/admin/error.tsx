'use client';

import { SignOutButton } from '@clerk/nextjs';
import { AlertTriangle, ArrowLeft, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <section className="mx-auto max-w-xl rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-sm sm:p-12">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
        <AlertTriangle className="size-6" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold text-slate-950">
        Admin access unavailable
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Your account may not be registered as an active internal user. Ask your
        Super Admin to check your access, or try again.
      </p>
      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <Button type="button" onClick={reset}>
          <RotateCcw />
          Try again
        </Button>
        <SignOutButton redirectUrl="/sign-in">
          <Button type="button" variant="outline">
            <ArrowLeft />
            Use another account
          </Button>
        </SignOutButton>
      </div>
      <Link
        href="/"
        className="mt-7 inline-block text-sm font-medium text-emerald-700 hover:text-emerald-800"
      >
        Return to WeDo Cleaning
      </Link>
    </section>
  );
}
