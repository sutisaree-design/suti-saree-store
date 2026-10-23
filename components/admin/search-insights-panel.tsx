'use client';

import { useEffect, useState } from 'react';
import { Search, SearchX, TrendingUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { fetchSearchInsights, SearchInsightsData } from '@/lib/search-insights-api';

const RANGE_OPTIONS = [7, 30, 90];

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone?: 'warn';
}) {
  return (
    <div
      className={`rounded-xl border p-4 shadow-sm ${
        tone === 'warn' ? 'border-amber-300 bg-amber-50' : 'border-border/60 bg-card'
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

export default function SearchInsightsPanel() {
  const [data, setData] = useState<SearchInsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchSearchInsights(days)
      .then(setData)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load search data'))
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <div className="grid gap-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-lg" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Could not load search data right now.</p>;
  }

  const { topSearches, noResultSearches, totalSearches, totalDistinctQueries, rangeDays } = data;
  const filteredTop = topSearches.filter((s) =>
    s.query.toLowerCase().includes(filter.trim().toLowerCase())
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          What shoppers are actually typing into the search box — last {rangeDays} days.
        </p>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm"
        >
          {RANGE_OPTIONS.map((d) => (
            <option key={d} value={d}>
              Last {d} days
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <SummaryCard icon={<Search className="h-3.5 w-3.5" />} label="Total searches" value={totalSearches} />
        <SummaryCard
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="Distinct queries"
          value={totalDistinctQueries}
        />
        <SummaryCard
          icon={<SearchX className="h-3.5 w-3.5" />}
          label="Queries with 0 results"
          value={noResultSearches.length}
          tone={noResultSearches.length > 0 ? 'warn' : undefined}
        />
      </div>

      {/* Zero-result searches — the actionable list */}
      <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <SearchX className="h-4 w-4 text-amber-500" />
          <h3 className="font-serif text-lg font-bold text-primary">Searches with no results</h3>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Shoppers searched these but the catalog showed nothing — usually fixed by tagging more
          products (colour, occasion, fabric) with these words, or adding a missing product.
        </p>
        {noResultSearches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No zero-result searches in this period — nice.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Search term</th>
                  <th className="pb-2 pr-3 font-medium">Times searched</th>
                  <th className="pb-2 font-medium">Last searched</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {noResultSearches.map((s) => (
                  <tr key={s.query}>
                    <td className="py-2 pr-3 font-medium">&quot;{s.query}&quot;</td>
                    <td className="py-2 pr-3 text-amber-700">{s.noResultCount}</td>
                    <td className="py-2 text-muted-foreground">{timeAgo(s.lastSearchedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* All searches, ranked */}
      <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-serif text-lg font-bold text-primary">Top Searches</h3>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter search terms..."
            className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs"
          />
        </div>
        {topSearches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No searches recorded in this period yet.</p>
        ) : filteredTop.length === 0 ? (
          <p className="text-sm text-muted-foreground">No search term matches &quot;{filter}&quot;.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Search term</th>
                  <th className="pb-2 pr-3 font-medium">Times searched</th>
                  <th className="pb-2 pr-3 font-medium">No-result rate</th>
                  <th className="pb-2 font-medium">Last searched</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredTop.map((s) => {
                  const noResultRate = s.count > 0 ? Math.round((s.noResultCount / s.count) * 100) : 0;
                  return (
                    <tr key={s.query}>
                      <td className="py-2 pr-3 font-medium">&quot;{s.query}&quot;</td>
                      <td className="py-2 pr-3 text-emerald-600">{s.count}</td>
                      <td
                        className={`py-2 pr-3 font-medium ${
                          noResultRate > 0 ? 'text-amber-700' : 'text-muted-foreground'
                        }`}
                      >
                        {noResultRate > 0 ? `${noResultRate}%` : '—'}
                      </td>
                      <td className="py-2 text-muted-foreground">{timeAgo(s.lastSearchedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
