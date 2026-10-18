import "server-only";

import { google } from "googleapis";
import type { analyticsdata_v1beta } from "googleapis";
import type {
  Ga4BreakdownRow,
  Ga4DashboardResponse,
  Ga4HistoricalData,
  Ga4PageRow,
  Ga4RealtimeData,
  Ga4Summary,
} from "@/lib/ga4-types";

const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const HISTORICAL_TTL_MS = 5 * 60_000;
const REALTIME_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8_000;

type CacheEntry<T> = { expiresAt: number; value: Promise<T> };

const historicalCache = new Map<string, CacheEntry<Ga4HistoricalData>>();
const realtimeCache = new Map<string, CacheEntry<Ga4RealtimeData>>();

function cached<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
) {
  const now = Date.now();
  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) return existing.value;

  const value = load().catch((error: unknown) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, { expiresAt: now + ttlMs, value });
  return value;
}

function credentials() {
  const propertyId = process.env.GA4_PROPERTY_ID?.trim();
  const clientEmail = process.env.GA4_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();

  if (!propertyId || !clientEmail || !privateKey) {
    throw new Error("GA4_CONFIGURATION_MISSING");
  }
  if (!/^\d+$/.test(propertyId)) {
    throw new Error("GA4_PROPERTY_INVALID");
  }
  if (
    !privateKey.startsWith("-----BEGIN PRIVATE KEY-----") ||
    !privateKey.endsWith("-----END PRIVATE KEY-----")
  ) {
    throw new Error("GA4_CREDENTIALS_INVALID");
  }
  return { propertyId, clientEmail, privateKey };
}

async function client() {
  const { propertyId, clientEmail, privateKey } = credentials();
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: [ANALYTICS_SCOPE],
  });
  return {
    api: google.analyticsdata({ version: "v1beta", auth }),
    property: `properties/${propertyId}`,
    propertyId,
  };
}

function numeric(value: string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dimension(row: analyticsdata_v1beta.Schema$Row, index: number) {
  return row.dimensionValues?.[index]?.value?.trim() || "(not set)";
}

function metric(row: analyticsdata_v1beta.Schema$Row | undefined, index: number) {
  return numeric(row?.metricValues?.[index]?.value);
}

function breakdownRows(
  report: analyticsdata_v1beta.Schema$RunReportResponse,
  label: (row: analyticsdata_v1beta.Schema$Row) => string,
): Ga4BreakdownRow[] {
  return (report.rows ?? []).map((row) => ({
    label: label(row),
    activeUsers: metric(row, 0),
    sessions: metric(row, 1),
  }));
}

function errorMessage(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? Number((error as { code?: unknown }).code)
      : undefined;
  const message = error instanceof Error ? error.message : "";

  if (message === "GA4_CONFIGURATION_MISSING") {
    return "GA4 unavailable — configuration is incomplete.";
  }
  if (message === "GA4_PROPERTY_INVALID" || code === 400) {
    return "GA4 unavailable — check the property ID.";
  }
  if (message === "GA4_CREDENTIALS_INVALID" || message.includes("DECODER routines")) {
    return "GA4 unavailable — the service account private key is invalid.";
  }
  if (code === 401) return "GA4 unavailable — credentials were rejected.";
  if (code === 403) return "GA4 unavailable — the service account needs property access.";
  if (code === 429) return "GA4 unavailable — the API rate limit was reached.";
  return "GA4 unavailable — analytics data could not be loaded.";
}

function logFailure(section: "historical" | "realtime", error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`GA4 ${section} request failed:`, detail);
}

async function loadHistorical(startDate: string, endDate: string) {
  const { api, property } = await client();
  const dateRanges = [{ startDate, endDate }];
  const metricOrder = (metricName: string) => [
    { metric: { metricName }, desc: true },
  ];

  const [batch, geographyResponse] = await Promise.all([
    api.properties.batchRunReports({
      property,
      requestBody: {
        requests: [
          {
            dateRanges,
            metrics: [
              { name: "activeUsers" },
              { name: "totalUsers" },
              { name: "sessions" },
              { name: "engagedSessions" },
              { name: "engagementRate" },
              { name: "averageSessionDuration" },
              { name: "screenPageViews" },
              { name: "newUsers" },
            ],
          },
          {
            dateRanges,
            dimensions: [
              { name: "sessionDefaultChannelGroup" },
              { name: "sessionSource" },
              { name: "sessionMedium" },
            ],
            metrics: [{ name: "activeUsers" }, { name: "sessions" }],
            limit: "100",
            orderBys: metricOrder("sessions"),
          },
          {
            dateRanges,
            dimensions: [{ name: "landingPagePlusQueryString" }],
            metrics: [{ name: "activeUsers" }, { name: "sessions" }],
            limit: "10",
            orderBys: metricOrder("sessions"),
          },
          {
            dateRanges,
            dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
            metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
            limit: "10",
            orderBys: metricOrder("screenPageViews"),
          },
          {
            dateRanges,
            dimensions: [{ name: "deviceCategory" }],
            metrics: [{ name: "activeUsers" }, { name: "sessions" }],
            limit: "10",
            orderBys: metricOrder("activeUsers"),
          },
        ],
      },
    }, { timeout: REQUEST_TIMEOUT_MS }),
    api.properties.runReport({
      property,
      requestBody: {
        dateRanges,
        dimensions: [{ name: "country" }, { name: "region" }],
        metrics: [{ name: "activeUsers" }, { name: "sessions" }],
        limit: "10",
        orderBys: metricOrder("activeUsers"),
      },
    }, { timeout: REQUEST_TIMEOUT_MS }),
  ]);

  const reports = batch.data.reports ?? [];
  const summaryRow = reports[0]?.rows?.[0];
  const summary: Ga4Summary = {
    activeUsers: metric(summaryRow, 0),
    totalUsers: metric(summaryRow, 1),
    sessions: metric(summaryRow, 2),
    engagedSessions: metric(summaryRow, 3),
    engagementRate: metric(summaryRow, 4),
    averageSessionDuration: metric(summaryRow, 5),
    screenPageViews: metric(summaryRow, 6),
    newUsers: metric(summaryRow, 7),
  };

  const acquisition = reports[1]?.rows ?? [];
  const channelTotals = new Map<string, Ga4BreakdownRow>();
  const sourceMediumTotals = new Map<string, Ga4BreakdownRow>();
  for (const row of acquisition) {
    const channel = dimension(row, 0);
    const sourceMedium = `${dimension(row, 1)} / ${dimension(row, 2)}`;
    for (const [map, label] of [
      [channelTotals, channel],
      [sourceMediumTotals, sourceMedium],
    ] as const) {
      const current = map.get(label) ?? { label, activeUsers: 0, sessions: 0 };
      current.activeUsers += metric(row, 0);
      current.sessions += metric(row, 1);
      map.set(label, current);
    }
  }

  const landingPages: Ga4PageRow[] = (reports[2]?.rows ?? []).map((row) => ({
    path: dimension(row, 0),
    activeUsers: metric(row, 0),
    sessions: metric(row, 1),
  }));
  const pages: Ga4PageRow[] = (reports[3]?.rows ?? []).map((row) => ({
    path: dimension(row, 0),
    title: dimension(row, 1),
    views: metric(row, 0),
    activeUsers: metric(row, 1),
  }));

  return {
    summary,
    channels: [...channelTotals.values()].sort((a, b) => b.sessions - a.sessions),
    sourceMedium: [...sourceMediumTotals.values()]
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 10),
    landingPages,
    pages,
    devices: reports[4] ? breakdownRows(reports[4], (row) => dimension(row, 0)) : [],
    geography: (geographyResponse.data.rows ?? []).map((row) => ({
      label: `${dimension(row, 0)} · ${dimension(row, 1)}`,
      country: dimension(row, 0),
      region: dimension(row, 1),
      activeUsers: metric(row, 0),
      sessions: metric(row, 1),
    })),
  } satisfies Ga4HistoricalData;
}

async function loadRealtime() {
  const { api, property } = await client();
  const baseRequest = {
    metrics: [{ name: "activeUsers" }],
    minuteRanges: [{ startMinutesAgo: 29, endMinutesAgo: 0 }],
  };
  const [total, pages, devices] = await Promise.all([
    api.properties.runRealtimeReport(
      { property, requestBody: baseRequest },
      { timeout: REQUEST_TIMEOUT_MS },
    ),
    api.properties.runRealtimeReport(
      {
        property,
        requestBody: {
          ...baseRequest,
          dimensions: [{ name: "unifiedScreenName" }],
          limit: "10",
          orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        },
      },
      { timeout: REQUEST_TIMEOUT_MS },
    ),
    api.properties.runRealtimeReport(
      {
        property,
        requestBody: {
          ...baseRequest,
          dimensions: [{ name: "deviceCategory" }],
          limit: "10",
          orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        },
      },
      { timeout: REQUEST_TIMEOUT_MS },
    ),
  ]);

  return {
    activeUsers: metric(total.data.rows?.[0], 0),
    pages: (pages.data.rows ?? []).map((row) => ({
      label: dimension(row, 0),
      activeUsers: metric(row, 0),
    })),
    devices: (devices.data.rows ?? []).map((row) => ({
      label: dimension(row, 0),
      activeUsers: metric(row, 0),
    })),
  } satisfies Ga4RealtimeData;
}

export async function getGa4Dashboard(
  startDate: string,
  endDate: string,
): Promise<Ga4DashboardResponse> {
  let propertyId = "unconfigured";
  try {
    propertyId = credentials().propertyId;
  } catch (error) {
    const message = errorMessage(error);
    return {
      historical: { status: "unavailable", message },
      realtime: { status: "unavailable", message },
    };
  }

  const [historical, realtime] = await Promise.allSettled([
    cached(
      historicalCache,
      `${propertyId}:${startDate}:${endDate}`,
      HISTORICAL_TTL_MS,
      () => loadHistorical(startDate, endDate),
    ),
    cached(realtimeCache, propertyId, REALTIME_TTL_MS, loadRealtime),
  ]);

  if (historical.status === "rejected") logFailure("historical", historical.reason);
  if (realtime.status === "rejected") logFailure("realtime", realtime.reason);

  return {
    historical:
      historical.status === "fulfilled"
        ? { status: "available", data: historical.value }
        : { status: "unavailable", message: errorMessage(historical.reason) },
    realtime:
      realtime.status === "fulfilled"
        ? { status: "available", data: realtime.value }
        : { status: "unavailable", message: errorMessage(realtime.reason) },
  };
}
