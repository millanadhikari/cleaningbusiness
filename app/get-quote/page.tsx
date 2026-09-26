import { ArrowLeft, ArrowRight, Calculator, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export default function GetQuotePage() {
  return (
    <main className="min-h-screen bg-[#f3f8f6] text-slate-950">
      <header className="border-b border-emerald-900/10 bg-white">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="WeDo Cleaning Services home">
            <Image src="/wedo-logo.svg" alt="WeDo Cleaning Services" width={235} height={72} className="h-12 w-auto" priority />
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-emerald-800">
            <ArrowLeft className="size-4" />
            Back to website
          </Link>
        </div>
      </header>

      <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center px-5 py-14 sm:px-8">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-emerald-900/10 bg-white shadow-[0_28px_80px_rgba(15,50,45,0.12)] lg:grid-cols-[1fr_0.8fr]">
          <div className="p-8 sm:p-12 lg:p-16">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
              <Calculator className="size-7" />
            </span>
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
              A better quote experience is on the way
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
              Quote estimator coming soon.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
              We’re building a guided estimator that asks the right questions for your service and provides clear next steps.
            </p>
            <Link href="/" className="mt-8 inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800">
              Explore our services <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="bg-emerald-950 p-8 text-white sm:p-12 lg:flex lg:flex-col lg:justify-center">
            <h2 className="text-xl font-semibold">What to expect</h2>
            <div className="mt-7 space-y-5">
              {['Choose the cleaning service you need', 'Answer a few service-specific questions', 'See an estimate or request a tailored quote'].map((item) => (
                <div key={item} className="flex gap-3 text-sm leading-6 text-emerald-50">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-300" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
