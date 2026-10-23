'use client';

import { BlogPostRow, BlogFaq } from './types';

// SECURITY: every function in this file used to write directly to
// `blog_posts` with the anon key (an over-broad RLS policy let ANY
// anon/authenticated caller insert/update/delete ANY post). All writes now
// go through app/api/admin/blog-posts/*, which checks the admin session
// cookie server-side before touching the database with the service role.
// Function names/signatures are unchanged so components/admin/blog-panel.tsx
// needs no changes.

/** Admin panel needs every post (published + draft); public pages filter
 *  to `published = true` separately (see lib/blog-api-server.ts). */
export async function fetchBlogPostsAdmin(): Promise<BlogPostRow[]> {
  const res = await fetch('/api/admin/blog-posts');
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to load blog posts');
  return (json.posts ?? []) as BlogPostRow[];
}

export async function createBlogPost(input: {
  slug: string;
  title: string;
  excerpt: string;
  keywords: string[];
  cover_image: string;
  body_paragraphs: string[];
  faqs?: BlogFaq[];
  read_minutes: number;
  related_category_name: string | null;
  published: boolean;
  published_at: string;
}): Promise<BlogPostRow> {
  const res = await fetch('/api/admin/blog-posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to create blog post');
  return json.post as BlogPostRow;
}

export async function updateBlogPost(
  id: string,
  input: Partial<{
    slug: string;
    title: string;
    excerpt: string;
    keywords: string[];
    cover_image: string;
    body_paragraphs: string[];
    faqs: BlogFaq[];
    read_minutes: number;
    related_category_name: string | null;
    published: boolean;
    published_at: string;
  }>
): Promise<BlogPostRow> {
  const res = await fetch(`/api/admin/blog-posts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to update blog post');
  return json.post as BlogPostRow;
}

export async function deleteBlogPost(id: string): Promise<void> {
  const res = await fetch(`/api/admin/blog-posts/${id}`, { method: 'DELETE' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to delete blog post');
}
