// ──────────────────────────────────────────────────────────────────────────────
// GA4 Traffic data types + fetch helpers (client-side)
// ──────────────────────────────────────────────────────────────────────────────

export interface TrafficSummary {
  totalUsers: number;
  sessions: number;
  pageViews: number;
  avgSessionDuration: number; // seconds
  bounceRate: number; // 0-100
  newUsers: number;
}

export interface CountryRow {
  country: string;
  users: number;
  sessions: number;
}

export interface RegionRow {
  region: string;
  users: number;
  sessions: number;
}

export interface HourRow {
  hour: number;
  label: string;
  users: number;
  sessions: number;
}

export interface DailyTrafficPoint {
  date: string;
  users: number;
  sessions: number;
}

export interface TrafficData {
  summary: TrafficSummary;
  byCountry: CountryRow[];
  byRegion: RegionRow[];
  byHour: HourRow[];
  dailyTrend: DailyTrafficPoint[];
}

export interface RealtimePage {
  page: string;
  activeUsers: number;
}

export interface RealtimeCountry {
  country: string;
  activeUsers: number;
}

export interface RealtimeData {
  totalActive: number;
  byPage: RealtimePage[];
  byCountry: RealtimeCountry[];
}

export async function fetchTrafficData(): Promise<TrafficData> {
  const res = await fetch('/api/admin/traffic');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load traffic data');
  }
  return res.json();
}

export async function fetchRealtimeData(): Promise<RealtimeData> {
  const res = await fetch('/api/admin/traffic/realtime');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load realtime data');
  }
  return res.json();
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}
