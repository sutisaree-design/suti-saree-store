export interface SearchInsightRow {
  query: string;
  count: number;
  noResultCount: number;
  lastSearchedAt: string;
}

export interface SearchInsightsData {
  topSearches: SearchInsightRow[];
  noResultSearches: SearchInsightRow[];
  totalSearches: number;
  totalDistinctQueries: number;
  rangeDays: number;
}

export async function fetchSearchInsights(days = 30): Promise<SearchInsightsData> {
  const res = await fetch(`/api/admin/search-insights?days=${days}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load search insights');
  }
  return res.json();
}
