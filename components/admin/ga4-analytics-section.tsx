'use client';

import {
  Activity,
  Clock3,
  Eye,
  LoaderCircle,
  MousePointer2,
  Radio,
  UserPlus,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Ga4DashboardResponse } from '@/lib/ga4-types';
import styles from './analytics-dashboard.module.css';

type Ga4AnalyticsSectionProps = {
  startDate: string;
  endDate: string;
};

function number(value: number) {
  return value.toLocaleString('en-AU');
}

function duration(seconds: number) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className={styles.empty}>{children}</div>;
}

export function Ga4AnalyticsSection({ startDate, endDate }: Ga4AnalyticsSectionProps) {
  const requestKey = `${startDate}:${endDate}`;
  const [result, setResult] = useState<{ key: string; data: Ga4DashboardResponse } | null>(null);
  const response = result?.key === requestKey ? result.data : null;
  const loading = response === null;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ startDate, endDate });

    void fetch(`/api/admin/analytics/ga4?${params}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (result) => {
        if (!result.ok) throw new Error(`GA4 request failed (${result.status})`);
        return result.json() as Promise<Ga4DashboardResponse>;
      })
      .then((data) => setResult({ key: `${startDate}:${endDate}`, data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setResult({
          key: `${startDate}:${endDate}`,
          data: {
            historical: { status: 'unavailable', message: 'GA4 unavailable — analytics data could not be loaded.' },
            realtime: { status: 'unavailable', message: 'GA4 unavailable — realtime data could not be loaded.' },
          },
        });
      });

    return () => controller.abort();
  }, [startDate, endDate]);

  return (
    <section className={styles.ga4Section} aria-labelledby="ga4-heading">
      <div className={styles.sectionHeading}>
        <div>
          <span>Google Analytics 4</span>
          <h2 id="ga4-heading">Website audience analytics</h2>
          <p>Read-only GA4 reporting. Business conversions and revenue above remain sourced from Convex.</p>
        </div>
        {loading ? <span className={styles.ga4Loading}><LoaderCircle className="size-4 animate-spin" /> Refreshing GA4</span> : null}
      </div>

      {loading && !response ? (
        <div className={styles.ga4Placeholder}><LoaderCircle className="size-5 animate-spin" /> Loading GA4 analytics…</div>
      ) : response?.historical.status === 'available' ? (
        <>
          <div className={styles.ga4KpiGrid}>
            {[
              { label: 'Users', value: number(response.historical.data.summary.activeUsers), detail: `${number(response.historical.data.summary.totalUsers)} total users`, icon: Users },
              { label: 'Sessions', value: number(response.historical.data.summary.sessions), detail: `${number(response.historical.data.summary.engagedSessions)} engaged`, icon: MousePointer2 },
              { label: 'New users', value: number(response.historical.data.summary.newUsers), icon: UserPlus },
              { label: 'Engagement rate', value: `${(response.historical.data.summary.engagementRate * 100).toFixed(1)}%`, icon: Activity },
              { label: 'Avg session duration', value: duration(response.historical.data.summary.averageSessionDuration), icon: Clock3 },
              { label: 'Page views', value: number(response.historical.data.summary.screenPageViews), icon: Eye },
            ].map(({ label, value, detail, icon: Icon }) => (
              <article className={styles.ga4Kpi} key={label}>
                <span className={styles.ga4KpiIcon}><Icon className="size-4" /></span>
                <span>{label}</span>
                <strong>{value}</strong>
                {detail ? <small>{detail}</small> : null}
              </article>
            ))}
          </div>

          <div className={styles.twoColumn}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}><div><span>GA4 acquisition</span><h2>Traffic channels</h2></div></div>
              {response.historical.data.channels.length ? response.historical.data.channels.map((row) => (
                <div className={styles.rankRow} key={row.label}><span>{row.label}</span><strong>{number(row.sessions)} sessions</strong></div>
              )) : <EmptyState>No channel data for this period.</EmptyState>}
            </section>
            <section className={styles.panel}>
              <div className={styles.panelHeader}><div><span>GA4 acquisition</span><h2>Source / medium</h2></div></div>
              {response.historical.data.sourceMedium.length ? response.historical.data.sourceMedium.map((row) => (
                <div className={styles.rankRow} key={row.label}><span title={row.label}>{row.label}</span><strong>{number(row.sessions)} sessions</strong></div>
              )) : <EmptyState>No source or medium data for this period.</EmptyState>}
            </section>
          </div>

          <div className={styles.twoColumn}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}><div><span>GA4 entry points</span><h2>Top landing pages</h2></div></div>
              <div className={styles.tableWrap}>
                <table>
                  <thead><tr><th>Landing page</th><th>Users</th><th>Sessions</th></tr></thead>
                  <tbody>
                    {response.historical.data.landingPages.length ? response.historical.data.landingPages.map((row) => (
                      <tr key={row.path}><td title={row.path}>{row.path}</td><td>{number(row.activeUsers)}</td><td>{number(row.sessions ?? 0)}</td></tr>
                    )) : <tr><td colSpan={3}><EmptyState>No landing-page data for this period.</EmptyState></td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
            <section className={styles.panel}>
              <div className={styles.panelHeader}><div><span>GA4 content</span><h2>Top pages</h2></div></div>
              <div className={styles.tableWrap}>
                <table>
                  <thead><tr><th>Page</th><th>Views</th><th>Users</th></tr></thead>
                  <tbody>
                    {response.historical.data.pages.length ? response.historical.data.pages.map((row) => (
                      <tr key={`${row.path}:${row.title}`}>
                        <td title={`${row.title ?? ''} ${row.path}`}><span className={styles.pageTitle}>{row.title}</span><small>{row.path}</small></td>
                        <td>{number(row.views ?? 0)}</td><td>{number(row.activeUsers)}</td>
                      </tr>
                    )) : <tr><td colSpan={3}><EmptyState>No page data for this period.</EmptyState></td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div className={styles.twoColumn}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}><div><span>GA4 audience</span><h2>Device split</h2></div></div>
              {response.historical.data.devices.length ? response.historical.data.devices.map((row) => (
                <div className={styles.rankRow} key={row.label}><span>{row.label}</span><strong>{number(row.activeUsers)} users</strong></div>
              )) : <EmptyState>No device data for this period.</EmptyState>}
            </section>
            <section className={styles.panel}>
              <div className={styles.panelHeader}><div><span>GA4 geography</span><h2>Top locations</h2></div></div>
              {response.historical.data.geography.length ? response.historical.data.geography.map((row) => (
                <div className={styles.rankRow} key={`${row.country}:${row.region}`}><span>{row.label}</span><strong>{number(row.activeUsers)} users</strong></div>
              )) : <EmptyState>No geography data for this period.</EmptyState>}
            </section>
          </div>
        </>
      ) : (
        <div className={styles.ga4Unavailable}>{response?.historical.message ?? 'GA4 unavailable'}</div>
      )}

      <section className={styles.realtimePanel}>
        <div className={styles.panelHeader}>
          <div><span>Google Analytics realtime</span><h2>GA4 Realtime Users</h2></div>
          <div className={styles.realtimeBadge}><i className={styles.liveDot} /><Radio className="size-4" /> Last 30 minutes</div>
        </div>
        {response?.realtime.status === 'available' ? (
          <div className={styles.realtimeGrid}>
            <div className={styles.realtimeTotal}><span>Active users</span><strong>{number(response.realtime.data.activeUsers)}</strong><small>Measured by GA4; separate from First-party Live Visitors.</small></div>
            <div><h3>Active users by page</h3>{response.realtime.data.pages.length ? response.realtime.data.pages.map((row) => (
              <div className={styles.rankRow} key={row.label}><span title={row.label}>{row.label}</span><strong>{number(row.activeUsers)}</strong></div>
            )) : <EmptyState>No active pages right now.</EmptyState>}</div>
            <div><h3>Active users by device</h3>{response.realtime.data.devices.length ? response.realtime.data.devices.map((row) => (
              <div className={styles.rankRow} key={row.label}><span>{row.label}</span><strong>{number(row.activeUsers)}</strong></div>
            )) : <EmptyState>No active devices right now.</EmptyState>}</div>
          </div>
        ) : loading ? (
          <div className={styles.inlineLoading}><LoaderCircle className="size-4 animate-spin" /> Loading realtime data…</div>
        ) : (
          <div className={styles.ga4Unavailable}>{response?.realtime.message ?? 'GA4 realtime unavailable'}</div>
        )}
      </section>
    </section>
  );
}
