import { getServerSupabase } from './supabase-server';
import { BlogPostRow } from './types';

export async function fetchPublishedBlogPostsServer(): Promise<BlogPostRow[]> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('published', true)
    .order('published_at', { ascending: false });
  if (error) {
    console.error('fetchPublishedBlogPostsServer failed', error);
    return [];
  }
  return (data ?? []) as BlogPostRow[];
}

export async function fetchPublishedBlogPostBySlugServer(
  slug: string
): Promise<BlogPostRow | null> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle();
  if (error) {
    console.error('fetchPublishedBlogPostBySlugServer failed', error);
    return null;
  }
  return (data as BlogPostRow) ?? null;
}
