export type SearchConsoleMetricRow = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type SearchConsoleQueryRow = SearchConsoleMetricRow & { query: string };
export type SearchConsolePageRow = SearchConsoleMetricRow & { page: string };
export type SearchConsoleTrendRow = SearchConsoleMetricRow & { date: string };

export type SearchConsoleOpportunity = SearchConsoleMetricRow & {
  query: string;
  page: string;
  labels: string[];
};

export type SearchConsoleData = {
  hasData: boolean;
  overview: SearchConsoleMetricRow;
  queries: SearchConsoleQueryRow[];
  pages: SearchConsolePageRow[];
  opportunities: SearchConsoleOpportunity[];
  opportunityRules: string[];
  trend: SearchConsoleTrendRow[];
  devices: Array<SearchConsoleMetricRow & { device: string }>;
  countries: Array<SearchConsoleMetricRow & { country: string }>;
  branded: Array<SearchConsoleMetricRow & { category: 'Branded' | 'Non-branded' }>;
};

export type SearchConsoleDashboardResponse =
  | { status: 'available'; data: SearchConsoleData }
  | { status: 'unavailable'; message: string };
