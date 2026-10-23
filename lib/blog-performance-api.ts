export interface BlogPostPerformance {
  slug: string;
  views: number;
  users: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

export interface BlogPerformanceData {
  days: number;
  posts: BlogPostPerformance[];
}

export async function fetchBlogPerformance(days = 30): Promise<BlogPerformanceData> {
  const res = await fetch(`/api/admin/blog-performance?days=${days}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to load blog performance data');
  }
  return res.json();
}
