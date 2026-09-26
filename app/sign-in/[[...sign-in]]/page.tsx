import { ArrowLeft, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

const benefits = [
  'Secure access for authorised staff',
  'Customer and quote tools in one place',
  'Permissions managed by your Super Admin',
];

export default function SignInPage() {
  const clerkConfigured = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );

  return (
    <main className="min-h-screen bg-[#f3f8f6] px-4 py-4 text-[#183e3b] sm:px-6 sm:py-6 lg:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-7xl overflow-hidden rounded-[28px] border border-[#dce8e3] bg-white shadow-[0_24px_70px_rgba(20,47,54,0.12)] sm:min-h-[calc(100vh-3rem)] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden bg-[#006f62] p-12 text-white lg:flex lg:flex-col xl:p-16">
          <div className="absolute -right-24 -top-24 size-80 rounded-full border border-white/10" />
          <div className="absolute -right-6 top-8 size-56 rounded-full border border-[#d5f392]/20" />
          <div className="absolute -bottom-28 -left-20 size-96 rounded-full bg-[#d5f392]/10" />

          <Link
            href="/"
            className="relative z-10 w-fit rounded-xl bg-white px-4 py-3 shadow-sm"
            aria-label="WeDo Cleaning Services home"
          >
            <Image src="/wedo-logo.svg" alt="WeDo Cleaning Services" width={188} height={58} priority />
          </Link>

          <div className="relative z-10 my-auto max-w-xl py-14">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#d5f392]">
              <Sparkles className="size-4" />
              Staff workspace
            </div>
            <h1 className="max-w-lg text-5xl font-extrabold leading-[1.08] tracking-[-0.04em] [font-family:Manrope,sans-serif] xl:text-6xl">
              A cleaner way to run the day.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-[#c3ddd4]">
              Sign in to manage the work behind every fresh, cared-for space.
            </p>

            <ul className="mt-10 space-y-4">
              {benefits.map((benefit) => (
                <li key={benefit} className="flex items-center gap-3 text-sm font-medium text-white/90">
                  <CheckCircle2 className="size-5 text-[#d5f392]" />
                  {benefit}
                </li>
              ))}
            </ul>
          </div>

          <p className="relative z-10 text-xs text-white/55">
            WeDo Cleaning Services · Sydney, Australia
          </p>
        </section>

        <section className="flex items-center justify-center px-5 py-8 sm:px-10 sm:py-12 lg:px-14 xl:px-20">
          <div className="w-full max-w-md">
            <div className="mb-9 flex items-center justify-between lg:hidden">
              <Link href="/" aria-label="WeDo Cleaning Services home">
                <Image src="/wedo-logo.svg" alt="WeDo Cleaning Services" width={170} height={52} priority />
              </Link>
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#506367] hover:text-[#007c70]"
              >
                <ArrowLeft className="size-4" />
                Website
              </Link>
            </div>

            <div className="mb-7">
              <div className="mb-5 inline-flex size-11 items-center justify-center rounded-xl bg-[#e9f5f1] text-[#007c70]">
                <ShieldCheck className="size-6" />
              </div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#007c70]">
                Cleaning Admin
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.035em] text-[#142f36] [font-family:Manrope,sans-serif] sm:text-4xl">
                Welcome back
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#637571]">
                Sign in with your authorised staff account to continue.
              </p>
            </div>

            {clerkConfigured ? (
              <ConfiguredSignIn />
            ) : (
              <div className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="preview-email" className="block text-sm font-bold text-[#294b4c]">
                    Email address
                  </label>
                  <input
                    id="preview-email"
                    type="email"
                    placeholder="you@wedocleaning.com.au"
                    disabled
                    className="h-11 w-full rounded-xl border border-[#dce8e3] bg-white px-3 text-sm text-[#183e3b] shadow-sm disabled:opacity-100"
                  />
                </div>
                <button
                  type="button"
                  disabled
                  className="h-11 w-full rounded-xl bg-[#007c70] text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Continue
                </button>
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                  Preview mode — add your Clerk keys to <code>.env.local</code> to
                  enable sign-in.
                </p>
              </div>
            )}

            <div className="mt-8 border-t border-[#e4ede7] pt-6 text-center text-xs leading-5 text-[#718580]">
              Access is limited to approved WeDo staff. Contact your Super Admin
              if you need an account.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

async function ConfiguredSignIn() {
  const { BrandedClerkSignIn } = await import(
    '@/components/auth/branded-clerk-sign-in'
  );

  return <BrandedClerkSignIn />;
}
