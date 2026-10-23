import { redirect } from 'next/navigation';

// This route never existed by design — vendors log in through the same
// /login page as regular customers (see middleware.ts and
// app/sell-with-us/page.tsx, which link to /login?next=...). This page
// exists only so a bookmarked or shared /vendor/login link redirects
// somewhere useful instead of 404ing.
export default function VendorLoginRedirect() {
  redirect('/login?next=/vendor/dashboard');
}
