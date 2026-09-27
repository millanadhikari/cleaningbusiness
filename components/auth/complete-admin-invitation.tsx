'use client';

import { useAction, useConvexAuth } from 'convex/react';
import { CircleAlert, LoaderCircle, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/brand-logo';

export function CompleteAdminInvitation() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const completeInvitation = useAction(
    api.adminInvitations.completeAdminInvitation,
  );
  const hasStarted = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !isAuthenticated || hasStarted.current) {
      return;
    }

    hasStarted.current = true;

    void completeInvitation({})
      .then(() => {
        window.location.replace('/admin');
      })
      .catch((completionError: unknown) => {
        setError(
          completionError instanceof Error
            ? completionError.message
            : 'Unable to finish setting up the admin account.',
        );
      });
  }, [completeInvitation, isAuthenticated, isLoading]);

  function retry() {
    hasStarted.current = false;
    setError(null);
    window.location.reload();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f8f6] px-4 py-8 text-[#183e3b]">
      <section className="w-full max-w-md rounded-[28px] border border-[#dce8e3] bg-white p-8 text-center shadow-[0_24px_70px_rgba(20,47,54,0.12)] sm:p-10">
        <BrandLogo className="mx-auto" priority />

        {error ? (
          <>
            <CircleAlert className="mx-auto mt-10 size-11 text-red-600" />
            <h1 className="mt-5 text-2xl font-extrabold text-[#142f36]">
              Account setup needs attention
            </h1>
            <p role="alert" className="mt-3 text-sm leading-6 text-[#637571]">
              {error}
            </p>
            <div className="mt-7 flex flex-col gap-3">
              <Button type="button" onClick={retry}>
                Try again
              </Button>
              <Button asChild variant="outline">
                <Link href="/sign-in">Return to sign in</Link>
              </Button>
            </div>
          </>
        ) : !isLoading && !isAuthenticated ? (
          <>
            <ShieldCheck className="mx-auto mt-10 size-11 text-[#007c70]" />
            <h1 className="mt-5 text-2xl font-extrabold text-[#142f36]">
              Sign in to finish setup
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#637571]">
              Use the email address that received the admin invitation.
            </p>
            <Button asChild className="mt-7 w-full">
              <Link href="/sign-in">Continue to sign in</Link>
            </Button>
          </>
        ) : (
          <>
            <LoaderCircle className="mx-auto mt-10 size-11 animate-spin text-[#007c70]" />
            <h1 className="mt-5 text-2xl font-extrabold text-[#142f36]">
              Setting up your admin account
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#637571]">
              You will enter the CRM as soon as your access is ready.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
