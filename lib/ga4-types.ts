export type Ga4Availability = {
  status: "unavailable";
  message: string;
};

export type Ga4Summary = {
  activeUsers: number;
  totalUsers: number;
  sessions: number;
  engagedSessions: number;
  engagementRate: number;
  averageSessionDuration: number;
  screenPageViews: number;
  newUsers: number;
};

export type Ga4BreakdownRow = {
  label: string;
  activeUsers: number;
  sessions: number;
};

export type Ga4PageRow = {
  path: string;
  title?: string;
  views?: number;
  activeUsers: number;
  sessions?: number;
};

export type Ga4HistoricalData = {
  summary: Ga4Summary;
  channels: Ga4BreakdownRow[];
  sourceMedium: Ga4BreakdownRow[];
  landingPages: Ga4PageRow[];
  pages: Ga4PageRow[];
  devices: Ga4BreakdownRow[];
  geography: Array<Ga4BreakdownRow & { country: string; region?: string }>;
};

export type Ga4RealtimeData = {
  activeUsers: number;
  pages: Array<{ label: string; activeUsers: number }>;
  devices: Array<{ label: string; activeUsers: number }>;
};

export type Ga4DashboardResponse = {
  historical:
    | { status: "available"; data: Ga4HistoricalData }
    | Ga4Availability;
  realtime:
    | { status: "available"; data: Ga4RealtimeData }
    | Ga4Availability;
};
