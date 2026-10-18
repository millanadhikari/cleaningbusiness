import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export default function BookingPaymentSuccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5ef] px-6 py-16">
      <section className="w-full max-w-xl rounded-3xl border border-black/10 bg-white p-8 text-center shadow-sm sm:p-12">
        <CheckCircle2 className="mx-auto mb-5 h-14 w-14 text-emerald-700" />
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-800">
          Payment received
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
          Thank you—your booking is being confirmed.
        </h1>
        <p className="mx-auto mt-4 max-w-md leading-7 text-slate-600">
          Stripe has returned you safely to We Do Cleaning. We’ll email your
          booking confirmation as soon as the payment notification is verified.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex rounded-full bg-slate-950 px-6 py-3 font-semibold text-white transition hover:bg-slate-800"
        >
          Return to home
        </Link>
      </section>
    </main>
  );
}
