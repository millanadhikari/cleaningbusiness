'use client';

import { useQuery } from 'convex/react';
import {
  addDays,
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from 'date-fns';
import {
  ArrowRight,
  Banknote,
  CalendarRange,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  LoaderCircle,
  MousePointerClick,
  Radio,
  ReceiptText,
  TrendingUp,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { api } from '@/convex/_generated/api';
import styles from './analytics-dashboard.module.css';

type RangeKey = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'previous' | 'custom';

function rangeFor(key: RangeKey, customFrom: string, customTo: string) {
  const now = new Date();
  if (key === 'today') return { from: startOfDay(now).getTime(), to: endOfDay(now).getTime() + 1 };
  if (key === 'yesterday') {
    const day = subDays(now, 1);
    return { from: startOfDay(day).getTime(), to: endOfDay(day).getTime() + 1 };
  }
  if (key === '7d') return { from: startOfDay(subDays(now, 6)).getTime(), to: endOfDay(now).getTime() + 1 };
  if (key === '30d') return { from: startOfDay(subDays(now, 29)).getTime(), to: endOfDay(now).getTime() + 1 };
  if (key === 'month') return { from: startOfMonth(now).getTime(), to: endOfMonth(now).getTime() + 1 };
  if (key === 'previous') {
    const month = subMonths(now, 1);
    return { from: startOfMonth(month).getTime(), to: endOfMonth(month).getTime() + 1 };
  }
  const from = customFrom ? startOfDay(new Date(`${customFrom}T12:00:00`)).getTime() : startOfDay(subDays(now, 29)).getTime();
  const to = customTo ? endOfDay(new Date(`${customTo}T12:00:00`)).getTime() + 1 : endOfDay(now).getTime() + 1;
  return from < to ? { from, to } : { from: startOfDay(now).getTime(), to: endOfDay(now).getTime() + 1 };
}

function currency(cents: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className={styles.empty}>{children}</div>;
}

export function AnalyticsDashboard() {
  const [rangeKey, setRangeKey] = useState<RangeKey>('30d');
  const [customFrom, setCustomFrom] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'));
  const [customTo, setCustomTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const range = useMemo(
    () => rangeFor(rangeKey, customFrom, customTo),
    [rangeKey, customFrom, customTo],
  );
  const data = useQuery(api.analytics.overview, range);

  const rangeOptions: Array<{ key: RangeKey; label: string }> = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: '7d', label: 'Last 7 days' },
    { key: '30d', label: 'Last 30 days' },
    { key: 'month', label: 'This month' },
    { key: 'previous', label: 'Previous month' },
    { key: 'custom', label: 'Custom' },
  ];

  if (!data) {
    return (
      <div className={styles.loading}>
        <LoaderCircle className="size-5 animate-spin" /> Loading growth analytics…
      </div>
    );
  }

  const kpis = [
    { label: 'Website visitors', value: data.kpis.visitors.toLocaleString(), icon: Eye },
    { label: 'Live visitors', value: data.kpis.liveVisitors.toLocaleString(), icon: Radio, live: true },
    { label: 'Quotes submitted', value: data.kpis.quotes.toLocaleString(), icon: ReceiptText },
    { label: 'Bookings created', value: data.kpis.bookings.toLocaleString(), icon: CheckCircle2 },
    { label: 'Paid bookings', value: data.kpis.paidBookings.toLocaleString(), icon: CircleDollarSign },
    { label: 'Collected revenue', value: currency(data.kpis.collectedRevenueCents), icon: Banknote },
    { label: 'Average booking value', value: currency(data.kpis.averageBookingValueCents), icon: TrendingUp },
    { label: 'Visitor → quote', value: `${data.kpis.visitorToQuotePercent}%`, icon: MousePointerClick },
    { label: 'Quote → booking', value: `${data.kpis.quoteToBookingPercent}%`, icon: ArrowRight },
    { label: 'Visitor → paid', value: `${data.kpis.visitorToPaidPercent}%`, icon: CircleDollarSign },
  ];
  const maxFunnel = Math.max(1, ...data.funnel.map((item) => item.value));
  const maxTrend = Math.max(
    1,
    ...data.business.daily.map((item) => Math.max(item.bookings, item.revenueCents / 10_000)),
  );

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}><TrendingUp className="size-4" /> Growth intelligence</span>
          <h1>Analytics</h1>
          <p>Follow the path from first website visit to paid cleaning booking.</p>
        </div>
        <div className={styles.rangeSummary}>
          <CalendarRange className="size-4" />
          {format(range.from, 'd MMM yyyy')} – {format(addDays(range.to, -1), 'd MMM yyyy')}
        </div>
      </section>

      <section className={styles.filters} aria-label="Analytics date range">
        <div className={styles.pills}>
          {rangeOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={rangeKey === option.key ? styles.activePill : styles.pill}
              onClick={() => setRangeKey(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {rangeKey === 'custom' ? (
          <div className={styles.customDates}>
            <label>From<input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label>
            <label>To<input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label>
          </div>
        ) : null}
      </section>

      <section className={styles.kpiGrid}>
        {kpis.map(({ label, value, icon: Icon, live }) => (
          <article className={styles.kpi} key={label}>
            <span className={styles.kpiIcon}><Icon className="size-4" /></span>
            <div className={styles.kpiLabel}>{live ? <i className={styles.liveDot} /> : null}{label}</div>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <div className={styles.twoColumn}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span>Conversion</span><h2>Customer journey funnel</h2></div></div>
          <div className={styles.funnel}>
            {data.funnel.map((item, index) => (
              <div className={styles.funnelRow} key={item.label}>
                <div><span>{item.label}</span><strong>{item.value.toLocaleString()}</strong></div>
                <div className={styles.track}><i style={{ width: `${Math.max(2, (item.value / maxFunnel) * 100)}%` }} /></div>
                {index < data.funnel.length - 1 ? (
                  <small>{item.value ? `${Math.round((data.funnel[index + 1].value / item.value) * 100)}% continue` : '—'}</small>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span>Performance</span><h2>Bookings and revenue trend</h2></div></div>
          {data.business.daily.length ? (
            <div className={styles.trend}>
              {data.business.daily.map((item) => (
                <div className={styles.trendColumn} key={item.date} title={`${item.date}: ${item.bookings} bookings, ${currency(item.revenueCents)}`}>
                  <div className={styles.trendBars}>
                    <i className={styles.bookingBar} style={{ height: `${Math.max(3, (item.bookings / maxTrend) * 100)}%` }} />
                    <i className={styles.revenueBar} style={{ height: `${Math.max(3, (item.revenueCents / 10_000 / maxTrend) * 100)}%` }} />
                  </div>
                  <small>{format(new Date(`${item.date}T12:00:00`), 'd MMM')}</small>
                </div>
              ))}
            </div>
          ) : <EmptyState>No bookings or payments in this period.</EmptyState>}
          <div className={styles.legend}><span><i className={styles.bookingSwatch} />Bookings</span><span><i className={styles.revenueSwatch} />Revenue scale ($100)</span></div>
        </section>
      </div>

      <div className={styles.threeColumn}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span>Acquisition</span><h2>Traffic sources</h2></div></div>
          {data.traffic.sources.length ? data.traffic.sources.slice(0, 7).map((row) => (
            <div className={styles.rankRow} key={row.source}><span>{row.source}</span><strong>{row.visitors}</strong></div>
          )) : <EmptyState>No tracked visitors yet.</EmptyState>}
          {data.traffic.referrers.length ? (
            <><h3 className={styles.subheading}>Top referrers</h3>{data.traffic.referrers.map((row) => (
              <div className={styles.rankRow} key={row.label}><span>{row.label}</span><strong>{row.value}</strong></div>
            ))}</>
          ) : null}
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span>Audience</span><h2>Devices</h2></div></div>
          {data.traffic.devices.length ? data.traffic.devices.map((row) => (
            <div className={styles.rankRow} key={row.label}><span>{row.label}</span><strong>{row.value}</strong></div>
          )) : <EmptyState>No device data yet.</EmptyState>}
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span>Entry points</span><h2>Landing pages</h2></div></div>
          {data.traffic.landingPages.length ? data.traffic.landingPages.map((row) => (
            <div className={styles.rankRow} key={row.label}><span title={row.label}>{row.label}</span><strong>{row.value}</strong></div>
          )) : <EmptyState>No landing-page data yet.</EmptyState>}
        </section>
      </div>

      <div className={styles.twoColumn}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span>Business</span><h2>Top services</h2></div><b>{currency(data.business.outstandingCents)} outstanding</b></div>
          {data.business.topServices.length ? data.business.topServices.map((row) => (
            <div className={styles.serviceRow} key={row.service}><span>{row.service}<small>{row.bookings} booking{row.bookings === 1 ? '' : 's'}</small></span><strong>{currency(row.revenueCents)}</strong></div>
          )) : <EmptyState>No service performance yet.</EmptyState>}
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span>Revenue</span><h2>Commercial snapshot</h2></div></div>
          <div className={styles.commercial}><div><span>Collected</span><strong>{currency(data.kpis.collectedRevenueCents)}</strong></div><div><span>Outstanding</span><strong>{currency(data.business.outstandingCents)}</strong></div><div><span>Average booking</span><strong>{currency(data.kpis.averageBookingValueCents)}</strong></div></div>
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><span>Attribution</span><h2>Source conversion and revenue</h2></div></div>
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Source</th><th>Visitors</th><th>Quotes</th><th>Bookings</th><th>Paid</th><th>Visitor → quote</th><th>Quote → booking</th><th>Visitor → paid</th><th>Revenue</th></tr></thead>
            <tbody>
              {data.attribution.length ? data.attribution.map((row) => (
                <tr key={row.source}><td>{row.source}</td><td>{row.visitors}</td><td>{row.quotes}</td><td>{row.bookings}</td><td>{row.paid}</td><td>{row.visitorToQuotePercent}%</td><td>{row.quoteToBookingPercent}%</td><td>{row.visitorToPaidPercent}%</td><td>{currency(row.revenueCents)}</td></tr>
              )) : <tr><td colSpan={9}><EmptyState>No attributable traffic in this period.</EmptyState></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
