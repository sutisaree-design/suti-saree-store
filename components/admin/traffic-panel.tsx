'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
} from 'recharts';
import {
  Globe,
  MapPin,
  Clock,
  Wifi,
  Users,
  Eye,
  TrendingUp,
  Bot,
  UserCheck,
  RefreshCw,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  fetchTrafficData,
  fetchRealtimeData,
  formatDuration,
  type TrafficData,
  type RealtimeData,
} from '@/lib/traffic-api';

// ── helpers ────────────────────────────────────────────────────────────────

const FLAG: Record<string, string> = {
  India: '🇮🇳',
  'United States': '🇺🇸',
  'United Kingdom': '🇬🇧',
  Canada: '🇨🇦',
  Australia: '🇦🇺',
  Germany: '🇩🇪',
  France: '🇫🇷',
  UAE: '🇦🇪',
  Singapore: '🇸🇬',
  Pakistan: '🇵🇰',
  Bangladesh: '🇧🇩',
  Nepal: '🇳🇵',
};

function flag(country: string) {
  return FLAG[country] ?? '🌐';
}

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

// ── sub-components ─────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: 'green' | 'amber';
}) {
  const toneClass =
    tone === 'green'
      ? 'border-emerald-300 bg-emerald-50'
      : tone === 'amber'
      ? 'border-amber-300 bg-amber-50'
      : 'border-border/60 bg-card';
  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-xl font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Realtime widget ────────────────────────────────────────────────────────

function RealtimeWidget() {
  const [data, setData] = useState<RealtimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const d = await fetchRealtimeData();
      setData(d);
      setLastUpdated(new Date());
    } catch (err) {
      if (!silent) toast.error(err instanceof Error ? err.message : 'Realtime data failed');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    // Auto-refresh every 30 seconds
    intervalRef.current = setInterval(() => load(true), 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [load]);

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <h3 className="font-serif text-lg font-bold text-primary">Real-Time Visitors</h3>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => load(false)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-48 w-full rounded" />
        </div>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Could not load realtime data.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Active count */}
          <div>
            <div className="mb-3 flex items-end gap-2">
              <span className="text-5xl font-bold tabular-nums text-primary">{data.totalActive}</span>
              <span className="mb-1 text-sm text-muted-foreground">active right now</span>
            </div>

            <p className="mb-3 text-xs text-muted-foreground">
              GA4 automatically filters bot traffic — these are real human visitors.
            </p>

            {/* Country mini list */}
            {data.byCountry.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">By country</p>
                {data.byCountry.slice(0, 5).map((c) => (
                  <div key={c.country} className="flex items-center gap-2 text-sm">
                    <span>{flag(c.country)}</span>
                    <span className="flex-1 text-sm">{c.country}</span>
                    <span className="font-semibold tabular-nums">{c.activeUsers}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active pages */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Active pages</p>
            {data.byPage.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No active pages right now</p>
            ) : (
              <div className="space-y-2">
                {data.byPage.slice(0, 10).map((p) => (
                  <div key={p.page} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs" title={p.page}>
                        {p.page}
                      </p>
                      <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{
                            width: `${pct(p.activeUsers, data.byPage[0].activeUsers) || 4}%`,
                          }}
                        />
                      </div>
                    </div>
                    <span className="w-5 text-right text-xs font-semibold tabular-nums">
                      {p.activeUsers}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────

export default function TrafficPanel() {
  const [data, setData] = useState<TrafficData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'country' | 'time'>('overview');

  useEffect(() => {
    fetchTrafficData()
      .then(setData)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load traffic'))
      .finally(() => setLoading(false));
  }, []);

  const configMissing =
    !loading &&
    !data &&
    typeof window !== 'undefined';

  if (loading) {
    return (
      <div className="grid gap-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-start gap-3">
          <Bot className="mt-0.5 h-5 w-5 text-amber-600" />
          <div>
            <p className="font-semibold text-amber-800">GA4 not configured</p>
            <p className="mt-1 text-sm text-amber-700">
              To show traffic data, add these two environment variables in Vercel:
            </p>
            <ul className="mt-2 space-y-1 text-sm text-amber-700">
              <li>
                <code className="rounded bg-amber-100 px-1">GA4_PROPERTY_ID</code> — Your GA4 property ID
                (e.g. <code className="rounded bg-amber-100 px-1">123456789</code>)
              </li>
              <li>
                <code className="rounded bg-amber-100 px-1">GA4_SERVICE_ACCOUNT_JSON</code> — Service Account
                JSON from Google Cloud Console (paste full JSON as one line)
              </li>
            </ul>
            <p className="mt-3 text-xs text-amber-600">
              Google Cloud Console → IAM → Service Accounts → Create key → JSON. Grant the service account
              &quot;Viewer&quot; access in GA4 Admin → Property Access Management.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { summary, byCountry, byRegion, byHour, dailyTrend } = data;
  const returningUsers = summary.totalUsers - summary.newUsers;

  return (
    <div className="grid gap-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          icon={<UserCheck className="h-4 w-4" />}
          label="Real humans (30d)"
          value={summary.totalUsers.toLocaleString('en-IN')}
          sub="GA4 bot-filtered"
          tone="green"
        />
        <StatCard
          icon={<Bot className="h-4 w-4" />}
          label="Bot traffic"
          value="Filtered"
          sub="Auto-removed by GA4"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Sessions (30d)"
          value={summary.sessions.toLocaleString('en-IN')}
        />
        <StatCard
          icon={<Eye className="h-4 w-4" />}
          label="Page views (30d)"
          value={summary.pageViews.toLocaleString('en-IN')}
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Avg. session"
          value={formatDuration(summary.avgSessionDuration)}
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="New visitors"
          value={summary.newUsers.toLocaleString('en-IN')}
          sub={`Returning: ${returningUsers.toLocaleString('en-IN')}`}
        />
      </div>

      {/* Realtime widget */}
      <RealtimeWidget />

      {/* Sub-tabs */}
      <div className="flex gap-1 rounded-lg border border-border/60 bg-muted/40 p-1 w-fit">
        {(['overview', 'country', 'time'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-white text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'overview' ? 'Visitor Trend' : t === 'country' ? 'Countries & States' : 'Time of Day'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="rounded-lg border border-border/60 bg-card p-4">
          <h3 className="mb-3 font-serif text-lg font-bold text-primary">
            Human Visitor Trend — last 30 days
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={dailyTrend} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(d) =>
                  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                }
                minTickGap={24}
              />
              <YAxis tick={{ fontSize: 11 }} width={50} />
              <Tooltip
                labelFormatter={(d) =>
                  new Date(d as string).toLocaleDateString('en-IN', { dateStyle: 'medium' })
                }
                formatter={(value: number, name: string) =>
                  name === 'users'
                    ? [value.toLocaleString('en-IN'), 'Visitors']
                    : [value.toLocaleString('en-IN'), 'Sessions']
                }
              />
              <Line
                type="monotone"
                dataKey="users"
                stroke="#8b5e3c"
                strokeWidth={2}
                dot={false}
                name="users"
              />
              <Line
                type="monotone"
                dataKey="sessions"
                stroke="#c68b5f"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="4 2"
                name="sessions"
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-2 text-xs text-muted-foreground text-center">
            Solid line = unique visitors · Dashed line = total sessions · Bots already excluded by GA4
          </p>
        </div>
      )}

      {tab === 'country' && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Countries */}
          <div className="rounded-lg border border-border/60 bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-serif text-lg font-bold text-primary">Top Countries</h3>
            </div>
            <div className="space-y-2.5">
              {byCountry.map((c) => (
                <div key={c.country} className="flex items-center gap-3">
                  <span className="text-lg">{flag(c.country)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium truncate">{c.country}</span>
                      <span className="ml-2 tabular-nums text-muted-foreground">
                        {c.users.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${pct(c.users, byCountry[0]?.users || 1)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* India states */}
          <div className="rounded-lg border border-border/60 bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-serif text-lg font-bold text-primary">India — Top States</h3>
            </div>
            {byRegion.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No India regional data available yet.
              </p>
            ) : (
              <div className="space-y-2.5">
                {byRegion.map((r) => (
                  <div key={r.region} className="flex items-center gap-3">
                    <span className="w-4 text-xs text-muted-foreground">🇮🇳</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium truncate">{r.region}</span>
                        <span className="ml-2 tabular-nums text-muted-foreground">
                          {r.users.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-[#c68b5f]"
                          style={{ width: `${pct(r.users, byRegion[0]?.users || 1)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'time' && (
        <div className="rounded-lg border border-border/60 bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-serif text-lg font-bold text-primary">
              Traffic by Hour (IST) — last 30 days
            </h3>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            When real human visitors are most active on your site
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byHour} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                interval={1}
                angle={-45}
                textAnchor="end"
                height={40}
              />
              <YAxis tick={{ fontSize: 11 }} width={45} />
              <Tooltip
                formatter={(value: number) => [value.toLocaleString('en-IN'), 'Visitors']}
              />
              <Bar dataKey="users" name="Visitors" fill="#8b5e3c" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          {/* Peak hour callout */}
          {byHour.length > 0 && (() => {
            const peak = byHour.reduce((a, b) => (a.users > b.users ? a : b));
            return (
              <p className="mt-3 text-xs text-center text-muted-foreground">
                🔥 Peak traffic: <strong>{peak.label} IST</strong> with{' '}
                <strong>{peak.users.toLocaleString('en-IN')}</strong> visitors on average
              </p>
            );
          })()}
        </div>
      )}
    </div>
  );
}
