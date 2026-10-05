import 'server-only';

import { google } from 'googleapis';
import type { searchconsole_v1 } from 'googleapis';
import type {
  SearchConsoleDashboardResponse,
  SearchConsoleData,
  SearchConsoleMetricRow,
  SearchConsoleOpportunity,
} from '@/lib/search-console-types';

const SEARCH_CONSOLE_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const CACHE_TTL_MS = 10 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const QUERY_ROW_LIMIT = 1_000;

// Update this one list if the business uses additional branded query variants.
export const BRANDED_QUERY_TERMS = [
  'wedo cleaning',
  'we do cleaning',
  'wedocleaning',
] as const;

const OPPORTUNITY_RULES = {
  ctr: 'CTR opportunity: at least 100 impressions and CTR below 3%.',
  nearPageOne: 'Near page-one opportunity: average position from 4 through 10.',
  pageTwo: 'Page-two opportunity: average position above 10 through 20.',
  highImpression: 'High-impression opportunity: at least 500 impressions and average position above 15.',
} as const;

type CacheEntry = {
  expiresAt: number;
  value: Promise<SearchConsoleData>;
};

const reportCache = new Map<string, CacheEntry>();

function credentials() {
  const siteUrl = process.env.SEARCH_CONSOLE_SITE_URL?.trim();
  const searchConsoleEmail = process.env.SEARCH_CONSOLE_CLIENT_EMAIL?.trim();
  const searchConsoleKey = process.env.SEARCH_CONSOLE_PRIVATE_KEY?.trim();
  const clientEmail = searchConsoleEmail || process.env.GA4_CLIENT_EMAIL?.trim();
  const privateKey = (searchConsoleKey || process.env.GA4_PRIVATE_KEY)
    ?.replace(/\\n/g, '\n')
    .trim();

  if (!siteUrl) throw new Error('SEARCH_CONSOLE_SITE_MISSING');
  if (!clientEmail || !privateKey) throw new Error('SEARCH_CONSOLE_CREDENTIALS_MISSING');
  if (
    !privateKey.startsWith('-----BEGIN PRIVATE KEY-----') ||
    !privateKey.endsWith('-----END PRIVATE KEY-----')
  ) {
    throw new Error('SEARCH_CONSOLE_CREDENTIALS_INVALID');
  }

  const isDomainProperty = /^sc-domain:[^\s]+$/i.test(siteUrl);
  let isUrlProperty = false;
  try {
    const url = new URL(siteUrl);
    isUrlProperty = url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    isUrlProperty = false;
  }
  if (!isDomainProperty && !isUrlProperty) throw new Error('SEARCH_CONSOLE_SITE_INVALID');

  return { siteUrl, clientEmail, privateKey };
}

async function client() {
  const config = credentials();
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: config.clientEmail,
      private_key: config.privateKey,
    },
    scopes: [SEARCH_CONSOLE_SCOPE],
  });
  return {
    api: google.searchconsole({ version: 'v1', auth }),
    siteUrl: config.siteUrl,
  };
}

function metrics(row?: searchconsole_v1.Schema$ApiDataRow): SearchConsoleMetricRow {
  return {
    clicks: row?.clicks ?? 0,
    impressions: row?.impressions ?? 0,
    ctr: row?.ctr ?? 0,
    position: row?.position ?? 0,
  };
}

async function report(
  api: searchconsole_v1.Searchconsole,
  siteUrl: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  rowLimit: number,
) {
  const response = await api.searchanalytics.query(
    {
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions,
        rowLimit,
        startRow: 0,
        dataState: 'all',
        type: 'web',
      },
    },
    { timeout: REQUEST_TIMEOUT_MS },
  );
  return response.data.rows ?? [];
}

function opportunityLabels(row: SearchConsoleMetricRow) {
  const labels: string[] = [];
  if (row.impressions >= 100 && row.ctr < 0.03) labels.push('CTR opportunity');
  if (row.position >= 4 && row.position <= 10) labels.push('Near page-one opportunity');
  if (row.position > 10 && row.position <= 20) labels.push('Page-two opportunity');
  if (row.impressions >= 500 && row.position > 15) labels.push('High-impression opportunity');
  return labels;
}

function classifyBranded(rows: Array<SearchConsoleMetricRow & { query: string }>) {
  const groups = new Map<'Branded' | 'Non-branded', {
    clicks: number;
    impressions: number;
    weightedPosition: number;
  }>([
    ['Branded', { clicks: 0, impressions: 0, weightedPosition: 0 }],
    ['Non-branded', { clicks: 0, impressions: 0, weightedPosition: 0 }],
  ]);

  for (const row of rows) {
    const normalized = row.query.toLowerCase();
    const category = BRANDED_QUERY_TERMS.some((term) => normalized.includes(term))
      ? 'Branded'
      : 'Non-branded';
    const group = groups.get(category)!;
    group.clicks += row.clicks;
    group.impressions += row.impressions;
    group.weightedPosition += row.position * row.impressions;
  }

  return [...groups.entries()].map(([category, group]) => ({
    category,
    clicks: group.clicks,
    impressions: group.impressions,
    ctr: group.impressions ? group.clicks / group.impressions : 0,
    position: group.impressions ? group.weightedPosition / group.impressions : 0,
  }));
}

async function loadSearchConsole(startDate: string, endDate: string) {
  const { api, siteUrl } = await client();
  const [overviewRows, queryRows, pageRows, opportunityRows, trendRows, deviceRows, countryRows] =
    await Promise.all([
      report(api, siteUrl, startDate, endDate, [], 1),
      report(api, siteUrl, startDate, endDate, ['query'], QUERY_ROW_LIMIT),
      report(api, siteUrl, startDate, endDate, ['page'], 100),
      report(api, siteUrl, startDate, endDate, ['query', 'page'], QUERY_ROW_LIMIT),
      report(api, siteUrl, startDate, endDate, ['date'], 500),
      report(api, siteUrl, startDate, endDate, ['device'], 10),
      report(api, siteUrl, startDate, endDate, ['country'], 25),
    ]);

  const queries = queryRows.map((row) => ({
    query: row.keys?.[0] || '(not provided)',
    ...metrics(row),
  }));
  const opportunities: SearchConsoleOpportunity[] = opportunityRows
    .map((row) => {
      const rowMetrics = metrics(row);
      return {
        query: row.keys?.[0] || '(not provided)',
        page: row.keys?.[1] || '',
        ...rowMetrics,
        labels: opportunityLabels(rowMetrics),
      };
    })
    .filter((row) => row.labels.length > 0)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 100);

  return {
    hasData: overviewRows.length > 0,
    overview: metrics(overviewRows[0]),
    queries,
    pages: pageRows.map((row) => ({ page: row.keys?.[0] || '', ...metrics(row) })),
    opportunities,
    opportunityRules: Object.values(OPPORTUNITY_RULES),
    trend: trendRows.map((row) => ({ date: row.keys?.[0] || '', ...metrics(row) })),
    devices: deviceRows.map((row) => ({ device: row.keys?.[0] || 'UNKNOWN', ...metrics(row) })),
    countries: countryRows.map((row) => ({ country: row.keys?.[0] || 'UNKNOWN', ...metrics(row) })),
    branded: classifyBranded(queries),
  } satisfies SearchConsoleData;
}

function statusCode(error: unknown) {
  if (typeof error !== 'object' || error === null) return undefined;
  const direct = 'code' in error ? Number((error as { code?: unknown }).code) : undefined;
  if (Number.isFinite(direct)) return direct;
  const response = 'response' in error ? (error as { response?: { status?: unknown } }).response : undefined;
  const nested = Number(response?.status);
  return Number.isFinite(nested) ? nested : undefined;
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const code = statusCode(error);

  if (message === 'SEARCH_CONSOLE_SITE_MISSING') return 'Search Console not configured.';
  if (message === 'SEARCH_CONSOLE_SITE_INVALID') return 'Search Console property is invalid.';
  if (message === 'SEARCH_CONSOLE_CREDENTIALS_MISSING') {
    return 'Search Console credentials are not configured.';
  }
  if (message === 'SEARCH_CONSOLE_CREDENTIALS_INVALID' || message.includes('DECODER routines')) {
    return 'Search Console service-account credentials are invalid.';
  }
  if (code === 400 || code === 404) return 'Search Console property not found.';
  if (code === 401) return 'Search Console service-account credentials were rejected.';
  if (code === 403 && /disabled|has not been used|accessNotConfigured/i.test(message)) {
    return 'Search Console API is not enabled for this Google Cloud project.';
  }
  if (code === 403) return 'Search Console access denied.';
  if (code === 429) return 'Search Console quota limit reached. Try again later.';
  return 'Search Console unavailable — SEO data could not be loaded.';
}

export async function getSearchConsoleDashboard(
  startDate: string,
  endDate: string,
): Promise<SearchConsoleDashboardResponse> {
  let siteUrl: string;
  try {
    siteUrl = credentials().siteUrl;
  } catch (error) {
    return { status: 'unavailable', message: errorMessage(error) };
  }

  const key = `${siteUrl}:${startDate}:${endDate}`;
  const now = Date.now();
  const existing = reportCache.get(key);
  if (existing && existing.expiresAt > now) {
    try {
      return { status: 'available', data: await existing.value };
    } catch (error) {
      return { status: 'unavailable', message: errorMessage(error) };
    }
  }

  const value = loadSearchConsole(startDate, endDate).catch((error: unknown) => {
    reportCache.delete(key);
    throw error;
  });
  reportCache.set(key, { expiresAt: now + CACHE_TTL_MS, value });

  try {
    return { status: 'available', data: await value };
  } catch (error) {
    console.error('Search Console request failed:', error instanceof Error ? error.message : error);
    return { status: 'unavailable', message: errorMessage(error) };
  }
}
