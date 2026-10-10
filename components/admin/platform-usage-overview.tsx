'use client';

import { useAction, useConvexAuth, useQuery } from 'convex/react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BrainCircuit,
  CheckCircle2,
  Cloud,
  Database,
  ExternalLink,
  Gauge,
  LoaderCircle,
  Mail,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/convex/_generated/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { cn } from '@/lib/utils';

type EmailRange = 'daily' | 'monthly';

const usageChartConfig = {
  used: { label: 'Used', color: '#007c70' },
  remaining: { label: 'Remaining', color: '#dfeae6' },
} satisfies ChartConfig;

const trendChartConfig = {
  sent: { label: 'Sent', color: '#007c70' },
  failed: { label: 'Failed', color: '#d97757' },
} satisfies ChartConfig;

function percentage(used: number, limit: number) {
  return limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
}

function percentageLabel(value: number) {
  if (value > 0 && value < 0.1) return '<0.1%';
  if (value < 10) return `${value.toFixed(1)}%`;
  return `${Math.round(value)}%`;
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(value);
}

function UsageRing({
  used,
  limit,
  label,
}: {
  used: number;
  limit: number;
  label: string;
}) {
  const remaining = Math.max(0, limit - used);
  const usedPercentage = percentage(used, limit);
  const data = [
    { name: 'used', value: used, fill: 'var(--color-used)' },
    { name: 'remaining', value: remaining, fill: 'var(--color-remaining)' },
  ];

  return (
    <div className="relative mx-auto h-[218px] w-full max-w-[280px]">
      <ChartContainer
        config={usageChartConfig}
        className="h-full w-full !aspect-auto"
        aria-label={`${label}: ${used.toLocaleString()} used out of ${limit.toLocaleString()}`}
      >
        <PieChart accessibilityLayer>
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={66}
            outerRadius={90}
            startAngle={90}
            endAngle={-270}
            paddingAngle={used > 0 && remaining > 0 ? 2 : 0}
            stroke="none"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <strong className="text-3xl font-semibold tracking-[-0.04em] text-[#163b38]">
          {percentageLabel(usedPercentage)}
        </strong>
        <span className="mt-1 text-xs font-medium text-[#71817d]">{label}</span>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: 'connected' | 'configured' | 'manual' | 'attention';
}) {
  const labels = {
    connected: 'Connected',
    configured: 'Configured',
    manual: 'Dashboard only',
    attention: 'Needs attention',
  };

  return (
    <Badge
      variant="secondary"
      className={cn(
        'border px-2.5 py-1 text-[10px] font-semibold shadow-none',
        status === 'connected' || status === 'configured'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : status === 'attention'
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : 'border-slate-200 bg-slate-50 text-slate-600',
      )}
    >
      {labels[status]}
    </Badge>
  );
}

export function PlatformUsageOverview() {
  const { isAuthenticated } = useConvexAuth();
  const overview = useQuery(
    api.platformUsage.overview,
    isAuthenticated ? {} : 'skip',
  );
  const loadProviderSnapshot = useAction(api.platformUsage.providerSnapshot);
  const [providerSnapshot, setProviderSnapshot] = useState<Awaited<
    ReturnType<typeof loadProviderSnapshot>
  > | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [emailRange, setEmailRange] = useState<EmailRange>('monthly');

  const refreshProviders = useCallback(async () => {
    setRefreshing(true);
    setProviderError(null);
    try {
      setProviderSnapshot(await loadProviderSnapshot({}));
    } catch (error) {
      setProviderError(
        error instanceof Error ? error.message : 'Provider usage could not be refreshed.',
      );
    } finally {
      setRefreshing(false);
    }
  }, [loadProviderSnapshot]);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    void loadProviderSnapshot({})
      .then((snapshot) => {
        if (!cancelled) setProviderSnapshot(snapshot);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setProviderError(
            error instanceof Error
              ? error.message
              : 'Provider usage could not be refreshed.',
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, loadProviderSnapshot]);

  const trendData = useMemo(
    () =>
      overview?.emailTrend.map((item) => ({
        ...item,
        label: new Intl.DateTimeFormat('en-AU', {
          weekday: 'short',
          timeZone: 'UTC',
        }).format(new Date(`${item.date}T12:00:00Z`)),
      })) ?? [],
    [overview],
  );

  if (!overview) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-[#667b76]">
        <LoaderCircle className="size-4 animate-spin" />
        Loading platform usage…
      </div>
    );
  }

  const selectedEmail = emailRange === 'daily' ? overview.daily : overview.monthly;
  const cloudflare = overview.cloudflare;
  const clerk = providerSnapshot?.clerk;
  const clerkUsed = clerk?.activeThisMonth ?? 0;
  const clerkLimit = clerk?.limit ?? 50_000;
  const lastUpdated = Math.max(overview.updatedAt, providerSnapshot?.updatedAt ?? 0);
  const services = [
    {
      name: 'Convex',
      detail: 'Database and backend are responding.',
      icon: Database,
      status: 'connected' as const,
      href: 'https://dashboard.convex.dev/',
    },
    {
      name: 'Clerk',
      detail:
        clerk?.status === 'AVAILABLE'
          ? `${clerk.totalUsers?.toLocaleString() ?? 0} total users`
          : clerk?.message ?? 'Checking authentication usage…',
      icon: ShieldCheck,
      status:
        clerk?.status === 'AVAILABLE'
          ? ('connected' as const)
          : clerk?.status
            ? ('attention' as const)
            : ('manual' as const),
      href: 'https://dashboard.clerk.com/',
    },
    {
      name: 'Resend',
      detail: providerSnapshot?.resendConfigured
        ? `${overview.monthly.sent.toLocaleString()} CRM emails sent this month`
        : 'RESEND_API_KEY is not configured in Convex.',
      icon: Mail,
      status: providerSnapshot?.resendConfigured
        ? ('configured' as const)
        : ('attention' as const),
      href: 'https://resend.com/emails',
    },
    {
      name: 'Cloudflare AI',
      detail: `${cloudflare.estimatedNeurons.toFixed(1)} estimated neurons used today by this CRM`,
      icon: BrainCircuit,
      status: providerSnapshot?.cloudflareConfigured
        ? ('configured' as const)
        : providerSnapshot
          ? ('attention' as const)
          : ('manual' as const),
      href: 'https://dash.cloudflare.com/?to=/:account/ai/workers-ai',
    },
    {
      name: 'Vercel',
      detail: 'Open Vercel for authoritative bandwidth and compute usage.',
      icon: Cloud,
      status: 'manual' as const,
      href: 'https://vercel.com/dashboard/usage',
    },
    {
      name: 'Stripe',
      detail: providerSnapshot?.stripeConfigured
        ? 'Payment integration is configured.'
        : 'STRIPE_API_KEY is not configured in Convex.',
      icon: WalletCards,
      status: providerSnapshot?.stripeConfigured
        ? ('configured' as const)
        : ('attention' as const),
      href: 'https://dashboard.stripe.com/',
    },
  ];

  return (
    <div className="grid gap-5 rounded-[28px] bg-[#f2f7f4] p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#087c6d]">
            <Gauge className="size-4" />
            Platform usage
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#173c39] sm:text-3xl">
            Free-tier health at a glance.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#677a75]">
            Live CRM email and AI usage, an estimated Clerk count, and direct access to each provider’s authoritative dashboard.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border border-[#cfe2dc] bg-white px-3 py-1.5 text-[11px] text-[#176d63] shadow-none">
            <ShieldCheck className="mr-1 size-3.5" /> Super Admin only
          </Badge>
          <Button
            type="button"
            variant="outline"
            onClick={() => void refreshProviders()}
            disabled={refreshing}
            className="rounded-xl border-[#d4e2dd] bg-white shadow-none"
          >
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {providerError ? (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert className="size-4 shrink-0" /> {providerError}
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2" aria-label="Usage diagrams">
        <Card className="gap-2 rounded-[22px] border-[#dce7e2] bg-white py-5 shadow-[0_8px_30px_rgba(20,47,54,0.05)]">
          <CardHeader className="gap-3 px-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base text-[#263f3c]">Resend email allowance</CardTitle>
                <CardDescription className="mt-1 text-xs leading-5">CRM-recorded delivery usage</CardDescription>
              </div>
              <Mail className="size-5 text-[#007c70]" />
            </div>
            <div className="grid grid-cols-2 rounded-xl bg-[#edf5f2] p-1" role="group" aria-label="Email usage period">
              {(['daily', 'monthly'] as const).map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setEmailRange(range)}
                  aria-pressed={emailRange === range}
                  className={cn(
                    'rounded-lg px-3 py-2 text-xs font-semibold capitalize transition',
                    emailRange === range
                      ? 'bg-white text-[#006f64] shadow-sm'
                      : 'text-[#6a7c77] hover:text-[#006f64]',
                  )}
                >
                  {range}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="px-5">
            <UsageRing
              used={selectedEmail.sent}
              limit={selectedEmail.limit}
              label={emailRange === 'daily' ? 'used today' : 'used this month'}
            />
            <div className="grid grid-cols-2 gap-3 border-t border-[#e5ece9] pt-4 text-sm">
              <div><span className="block text-xs text-[#71817d]">Sent</span><strong className="mt-1 block text-lg text-[#21413d]">{selectedEmail.sent.toLocaleString()}</strong></div>
              <div><span className="block text-xs text-[#71817d]">Remaining</span><strong className="mt-1 block text-lg text-[#21413d]">{Math.max(0, selectedEmail.limit - selectedEmail.sent).toLocaleString()}</strong></div>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-2 rounded-[22px] border-[#dce7e2] bg-white py-5 shadow-[0_8px_30px_rgba(20,47,54,0.05)]">
          <CardHeader className="px-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base text-[#263f3c]">Cloudflare Workers AI</CardTitle>
                <CardDescription className="mt-1 text-xs leading-5">CRM-tracked daily free-tier estimate</CardDescription>
              </div>
              <BrainCircuit className="size-5 text-[#007c70]" />
            </div>
          </CardHeader>
          <CardContent className="px-5">
            <UsageRing
              used={cloudflare.estimatedNeurons}
              limit={cloudflare.limitNeurons}
              label="estimated neurons used"
            />
            <div className="grid grid-cols-2 gap-3 border-t border-[#e5ece9] pt-4 text-sm">
              <div><span className="block text-xs text-[#71817d]">Used today</span><strong className="mt-1 block text-lg text-[#21413d]">{cloudflare.estimatedNeurons.toFixed(1)}</strong><small className="text-[10px] text-[#71817d]">neurons</small></div>
              <div><span className="block text-xs text-[#71817d]">Estimated remaining</span><strong className="mt-1 block text-lg text-[#21413d]">{Math.max(0, cloudflare.limitNeurons - cloudflare.estimatedNeurons).toFixed(1)}</strong><small className="text-[10px] text-[#71817d]">of {cloudflare.limitNeurons.toLocaleString()}</small></div>
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-2 rounded-xl bg-[#f3f7f5] px-3 py-2 text-[11px] text-[#657873]">
              <span>{cloudflare.totalTokens.toLocaleString()} tokens</span>
              <span>{cloudflare.requestCount.toLocaleString()} model calls</span>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-2 rounded-[22px] border-[#dce7e2] bg-white py-5 shadow-[0_8px_30px_rgba(20,47,54,0.05)]">
          <CardHeader className="px-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base text-[#263f3c]">Clerk user allowance</CardTitle>
                <CardDescription className="mt-1 text-xs leading-5">Monthly active users as an MRU estimate</CardDescription>
              </div>
              <UsersRound className="size-5 text-[#007c70]" />
            </div>
          </CardHeader>
          <CardContent className="px-5">
            {clerk?.status === 'AVAILABLE' ? (
              <>
                <UsageRing used={clerkUsed} limit={clerkLimit} label="estimated usage" />
                <div className="grid grid-cols-2 gap-3 border-t border-[#e5ece9] pt-4 text-sm">
                  <div><span className="block text-xs text-[#71817d]">Active this month</span><strong className="mt-1 block text-lg text-[#21413d]">{clerkUsed.toLocaleString()}</strong></div>
                  <div><span className="block text-xs text-[#71817d]">Free allowance</span><strong className="mt-1 block text-lg text-[#21413d]">{clerkLimit.toLocaleString()}</strong></div>
                </div>
              </>
            ) : (
              <div className="flex min-h-[282px] flex-col items-center justify-center text-center">
                {refreshing || (!providerSnapshot && !providerError) ? <LoaderCircle className="size-7 animate-spin text-[#007c70]" /> : <TriangleAlert className="size-7 text-amber-600" />}
                <p className="mt-4 max-w-xs text-sm leading-6 text-[#687a76]">{clerk?.message ?? 'Refreshing Clerk usage…'}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="gap-3 rounded-[22px] border-[#dce7e2] bg-white py-5 shadow-[0_8px_30px_rgba(20,47,54,0.05)]">
          <CardHeader className="px-5">
            <CardTitle className="text-base text-[#263f3c]">Email delivery trend</CardTitle>
            <CardDescription className="text-xs leading-5">Sent and failed CRM emails over the last seven UTC days</CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-5">
            <ChartContainer config={trendChartConfig} className="h-[270px] w-full !aspect-auto" aria-label="Seven-day email delivery chart">
              <BarChart data={trendData} accessibilityLayer margin={{ left: -12, right: 8, top: 10 }}>
                <CartesianGrid vertical={false} stroke="#e5ece9" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={9} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={34} />
                <ChartTooltip cursor={{ fill: '#eef5f2' }} content={<ChartTooltipContent />} />
                <Bar dataKey="sent" stackId="email" fill="var(--color-sent)" radius={[0, 0, 4, 4]} />
                <Bar dataKey="failed" stackId="email" fill="var(--color-failed)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5ece9] px-2 pt-4 text-xs text-[#71817d]">
              <span>{overview.monthly.failed} failed · {overview.monthly.pending} pending this month</span>
              <span className="flex items-center gap-1.5 text-[#37755f]"><CheckCircle2 className="size-3.5" /> Delivery log live</span>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="gap-0 rounded-[22px] border-[#dce7e2] bg-white py-0 shadow-[0_8px_30px_rgba(20,47,54,0.05)]">
        <CardHeader className="border-b border-[#e5ece9] px-5 py-5 sm:px-6">
          <CardTitle className="text-base text-[#263f3c]">Provider connections</CardTitle>
          <CardDescription className="text-xs leading-5">Configuration health and shortcuts to authoritative provider usage</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-0 px-0 sm:grid-cols-2 xl:grid-cols-6">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <a
                key={service.name}
                href={service.href}
                target="_blank"
                rel="noreferrer"
                className="group flex min-h-40 flex-col border-b border-[#e5ece9] p-5 transition hover:bg-[#f4f9f7] sm:border-r xl:border-b-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-[#e8f4f0] text-[#007c70]"><Icon className="size-[17px]" /></span>
                  <StatusBadge status={service.status} />
                </div>
                <strong className="mt-4 text-sm font-semibold text-[#29423f]">{service.name}</strong>
                <span className="mt-2 flex-1 text-xs leading-5 text-[#71817d]">{service.detail}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#087c6d]">Open dashboard <ExternalLink className="size-3" /></span>
              </a>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-1 px-1 text-[11px] leading-5 text-[#75847f] sm:flex-row sm:items-center sm:justify-between">
        <span>Last refreshed {formatDate(lastUpdated)} · Daily AI allowance resets at 00:00 UTC.</span>
        <span>Cloudflare AI is CRM-tracked and estimated; its dashboard remains authoritative for account-wide usage.</span>
      </div>
    </div>
  );
}
