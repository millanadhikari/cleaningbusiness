import { ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import { BrandedClerkSignUp } from '@/components/auth/branded-clerk-sign-up';

export default function AcceptInvitationPage() {
  const clerkConfigured = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f8f6] px-4 py-8 text-[#183e3b]">
      <section className="w-full max-w-lg rounded-[28px] border border-[#dce8e3] bg-white p-6 shadow-[0_24px_70px_rgba(20,47,54,0.12)] sm:p-10">
        <Image
          src="/wedo-logo.svg"
          alt="WeDo Cleaning Services"
          width={188}
          height={58}
          priority
        />

        <div className="mb-7 mt-10">
          <div className="mb-5 inline-flex size-11 items-center justify-center rounded-xl bg-[#e9f5f1] text-[#007c70]">
            <ShieldCheck className="size-6" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#007c70]">
            Admin invitation
          </p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.035em] text-[#142f36] [font-family:Manrope,sans-serif]">
            Set up your staff account
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#637571]">
            Complete the secure invitation to access the WeDo Cleaning admin
            workspace.
          </p>
        </div>

        {clerkConfigured ? (
          <BrandedClerkSignUp />
        ) : (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            Clerk is not configured for this deployment.
          </p>
        )}
      </section>
    </main>
  );
}
