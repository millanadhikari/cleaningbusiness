'use client';

import {
  Eye,
  ListOrdered,
  LoaderCircle,
  MousePointerClick,
  Percent,
  Search,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type {
  SearchConsoleDashboardResponse,
  SearchConsoleQueryRow,
} from '@/lib/search-console-types';
import styles from './analytics-dashboard.module.css';

type SearchConsoleSectionProps = {
  startDate: string;
  endDate: string;
};

type QuerySort = 'clicks' | 'impressions' | 'ctr' | 'position';

function number(value: number) {
  return Math.round(value).toLocaleString('en-AU');
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function position(value: number) {
  return value > 0 ? value.toFixed(1) : '—';
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className={styles.empty}>{children}</div>;
}

function sortQueries(rows: SearchConsoleQueryRow[], sort: QuerySort) {
  return [...rows].sort((a, b) => {
    if (sort === 'position') return a.position - b.position;
    return b[sort] - a[sort];
  });
}

export function SearchConsoleSection({ startDate, endDate }: SearchConsoleSectionProps) {
  const requestKey = `${startDate}:${endDate}`;
  const [result, setResult] = useState<{
    key: string;
    data: SearchConsoleDashboardResponse;
  } | null>(null);
  const [queryFilter, setQueryFilter] = useState('');
  const [querySort, setQuerySort] = useState<QuerySort>('clicks');
  const response = result?.key === requestKey ? result.data : null;
  const loading = response === null;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ startDate, endDate });

    void fetch(`/api/admin/analytics/search-console?${params}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (request) => {
        if (!request.ok) throw new Error(`Search Console request failed (${request.status})`);
        return request.json() as Promise<SearchConsoleDashboardResponse>;
      })
      .then((data) => setResult({ key: `${startDate}:${endDate}`, data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setResult({
          key: `${startDate}:${endDate}`,
          data: {
            status: 'unavailable',
            message: 'Search Console unavailable — SEO data could not be loaded.',
          },
        });
      });

    return () => controller.abort();
  }, [startDate, endDate]);

  const filteredQueries = useMemo(() => {
    if (response?.status !== 'available') return [];
    const needle = queryFilter.trim().toLowerCase();
    const rows = needle
      ? response.data.queries.filter((row) => row.query.toLowerCase().includes(needle))
      : response.data.queries;
    return sortQueries(rows, querySort).slice(0, 100);
  }, [queryFilter, querySort, response]);

  const trend = response?.status === 'available' ? response.data.trend : [];
  const maxTrendClicks = Math.max(1, ...trend.map((row) => row.clicks));
  const maxTrendImpressions = Math.max(1, ...trend.map((row) => row.impressions));

  return (
    <section className={styles.seoSection} aria-labelledby="seo-heading">
      <div className={styles.sectionHeading}>
        <div>
          <span>Google Search Console</span>
          <h2 id="seo-heading">SEO performance</h2>
          <p>Google Search visibility and clicks. Search Console may return top rows rather than every query.</p>
        </div>
        {loading ? <span className={styles.ga4Loading}><LoaderCircle className="size-4 animate-spin" /> Refreshing SEO</span> : null}
      </div>

      {loading ? (
        <div className={styles.ga4Placeholder}><LoaderCircle className="size-5 animate-spin" /> Loading Search Console…</div>
      ) : response?.status === 'unavailable' ? (
        <div className={styles.ga4Unavailable}>{response.message}</div>
      ) : !response.data.hasData ? (
        <div className={styles.ga4Placeholder}>No SEO data available for this period.</div>
      ) : (
        <>
          <div className={styles.seoKpiGrid}>
            {[
              { label: 'Organic Search Clicks', value: number(response.data.overview.clicks), icon: MousePointerClick },
              { label: 'Impressions', value: number(response.data.overview.impressions), icon: Eye },
              { label: 'CTR', value: percent(response.data.overview.ctr), icon: Percent },
              { label: 'Average Position', value: position(response.data.overview.position), icon: ListOrdered },
            ].map(({ label, value, icon: Icon }) => (
              <article className={styles.seoKpi} key={label}>
                <span className={styles.seoKpiIcon}><Icon className="size-4" /></span>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div><span>Search demand</span><h2>Search queries</h2></div>
              <small className={styles.sourceNote}>Top rows reported by Search Console</small>
            </div>
            <div className={styles.queryControls}>
              <label className={styles.querySearch}><Search className="size-4" /><input value={queryFilter} onChange={(event) => setQueryFilter(event.target.value)} placeholder="Filter query text" /></label>
              <label>Sort by<select value={querySort} onChange={(event) => setQuerySort(event.target.value as QuerySort)}><option value="clicks">Clicks</option><option value="impressions">Impressions</option><option value="ctr">CTR</option><option value="position">Position</option></select></label>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Search query</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Position</th></tr></thead>
                <tbody>
                  {filteredQueries.length ? filteredQueries.map((row) => (
                    <tr key={row.query}><td>{row.query}</td><td>{number(row.clicks)}</td><td>{number(row.impressions)}</td><td>{percent(row.ctr)}</td><td>{position(row.position)}</td></tr>
                  )) : <tr><td colSpan={5}><EmptyState>No matching search queries.</EmptyState></td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <div className={styles.twoColumn}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}><div><span>Organic entry points</span><h2>Top SEO landing pages</h2></div></div>
              <div className={styles.tableWrap}>
                <table>
                  <thead><tr><th>Page</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Position</th></tr></thead>
                  <tbody>
                    {response.data.pages.length ? response.data.pages.map((row) => (
                      <tr key={row.page}><td><a className={styles.pageLink} href={row.page} target="_blank" rel="noreferrer" title={row.page}>{row.page}</a></td><td>{number(row.clicks)}</td><td>{number(row.impressions)}</td><td>{percent(row.ctr)}</td><td>{position(row.position)}</td></tr>
                    )) : <tr><td colSpan={5}><EmptyState>No landing-page data for this period.</EmptyState></td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}><div><span>Search visibility</span><h2>Clicks and impressions trend</h2></div></div>
              {trend.length ? (
                <div className={styles.seoTrend}>
                  {trend.map((row) => (
                    <div className={styles.seoTrendColumn} key={row.date} title={`${row.date}: ${number(row.clicks)} clicks, ${number(row.impressions)} impressions, ${percent(row.ctr)} CTR, position ${position(row.position)}`}>
                      <div className={styles.seoTrendBars}>
                        <i className={styles.clickBar} style={{ height: `${Math.max(3, (row.clicks / maxTrendClicks) * 100)}%` }} />
                        <i className={styles.impressionBar} style={{ height: `${Math.max(3, (row.impressions / maxTrendImpressions) * 100)}%` }} />
                      </div>
                      <small>{row.date.slice(5)}</small>
                    </div>
                  ))}
                </div>
              ) : <EmptyState>No trend data for this period.</EmptyState>}
              <div className={styles.legend}><span><i className={styles.clickSwatch} />Clicks</span><span><i className={styles.impressionSwatch} />Impressions</span></div>
            </section>
          </div>

          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><span>Derived from Search Console metrics</span><h2>SEO opportunities</h2></div></div>
            <div className={styles.opportunityRules}>{response.data.opportunityRules.map((rule) => <span key={rule}>{rule}</span>)}</div>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Query and page</th><th>Opportunity</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Position</th></tr></thead>
                <tbody>
                  {response.data.opportunities.length ? response.data.opportunities.map((row, index) => (
                    <tr key={`${row.query}:${row.page}:${index}`}>
                      <td><strong className={styles.queryTitle}>{row.query}</strong><a className={styles.pageLink} href={row.page} target="_blank" rel="noreferrer">{row.page}</a></td>
                      <td><div className={styles.opportunityLabels}>{row.labels.map((label) => <span key={label}>{label}</span>)}</div></td>
                      <td>{number(row.clicks)}</td><td>{number(row.impressions)}</td><td>{percent(row.ctr)}</td><td>{position(row.position)}</td>
                    </tr>
                  )) : <tr><td colSpan={6}><EmptyState>No rows match the transparent opportunity rules for this period.</EmptyState></td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <div className={styles.threeColumn}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}><div><span>SEO audience</span><h2>Device performance</h2></div></div>
              {response.data.devices.length ? response.data.devices.map((row) => (
                <div className={styles.seoRankRow} key={row.device}><span>{row.device}</span><div><strong>{number(row.clicks)} clicks</strong><small>{number(row.impressions)} impressions · {percent(row.ctr)} · pos. {position(row.position)}</small></div></div>
              )) : <EmptyState>No device SEO data.</EmptyState>}
            </section>
            <section className={styles.panel}>
              <div className={styles.panelHeader}><div><span>SEO geography</span><h2>Top countries</h2></div></div>
              {response.data.countries.length ? response.data.countries.map((row) => (
                <div className={styles.seoRankRow} key={row.country}><span>{row.country.toUpperCase()}</span><div><strong>{number(row.clicks)} clicks</strong><small>{number(row.impressions)} impressions · {percent(row.ctr)}</small></div></div>
              )) : <EmptyState>No country SEO data.</EmptyState>}
            </section>
            <section className={styles.panel}>
              <div className={styles.panelHeader}><div><span>CRM-derived classification</span><h2>Branded vs non-branded</h2></div></div>
              <p className={styles.classificationNote}>Derived from configured brand phrases in the top query rows; this is not a native Search Console metric.</p>
              {response.data.branded.map((row) => (
                <div className={styles.seoRankRow} key={row.category}><span>{row.category}</span><div><strong>{number(row.clicks)} clicks</strong><small>{number(row.impressions)} impressions · {percent(row.ctr)}</small></div></div>
              ))}
            </section>
          </div>
        </>
      )}
    </section>
  );
}
