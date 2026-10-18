import { LockKeyhole, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
import { CleanerClerkSignUp } from '@/components/auth/cleaner-clerk-sign-up';
import { Button } from '@/components/ui/button';

export default async function CleanerInvitationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const invitationTicket = params.__clerk_ticket;
  const invitationStatus = params.__clerk_status;
  const mode = invitationStatus === 'sign_in' ? 'sign_in' : 'sign_up';

  if (!invitationTicket || Array.isArray(invitationTicket)) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#eef3f2] px-4 py-7 text-[#173c38]">
        <section className="w-full max-w-md rounded-[32px] bg-white p-7 text-center shadow-[0_24px_80px_rgba(23,60,56,0.12)]">
          <BrandLogo className="mx-auto" priority />
          <span className="mx-auto mt-10 grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-500">
            <LockKeyhole />
          </span>
          <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
            Invitation required
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Cleaner accounts cannot be created directly. Open the secure link
            in the invitation email sent by the WeDo Cleaning admin team.
          </p>
          <Button asChild variant="outline" className="mt-7 h-12 w-full rounded-2xl">
            <Link href="/sign-in">Already have an account? Sign in</Link>
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[#eef3f2] px-4 py-7 text-[#173c38]">
      <section className="w-full max-w-md rounded-[32px] bg-white p-6 shadow-[0_24px_80px_rgba(23,60,56,0.12)]">
        <BrandLogo priority />
        <div className="mb-7 mt-9"><span className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-[#087f70]"><ShieldCheck /></span><p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-[#087f70]">Secure cleaner invitation</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight">Accept your invitation</h1><p className="mt-3 text-sm leading-6 text-slate-600">{mode === 'sign_in' ? 'This email already has an account. Sign in to accept the cleaner invitation and continue to onboarding.' : 'Confirm your invited email and create login credentials. You will then continue directly to cleaner onboarding.'}</p></div>
        <CleanerClerkSignUp mode={mode} />
      </section>
    </main>
  );
}
