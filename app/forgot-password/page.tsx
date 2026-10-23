'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const email = fd.get('email') as string;

    setLoading(true);
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, next: '/reset-password' }),
    });
    const result = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      toast.error(result.error || 'Something went wrong. Please try again.');
      return;
    }
    setSent(true);
  };

  return (
    <div className="relative min-h-[70vh] overflow-hidden bg-gradient-to-br from-primary via-primary to-primary/80 md:flex md:min-h-[70vh] md:items-center md:justify-center md:bg-none md:py-16">
      {/* Decorative brand panel — mobile only, sits behind the sheet below */}
      <div className="flex flex-col items-center gap-2 px-6 pb-44 pt-16 text-center text-primary-foreground md:hidden">
        <span className="font-serif text-3xl font-bold text-secondary">Aruhi</span>
        <p className="text-sm text-primary-foreground/80">
          Get personalised suggestions, offers &amp; more
        </p>
      </div>

      {/* Reset card — fixed bottom sheet on mobile, centered card on desktop */}
      <div className="fixed inset-x-0 bottom-0 z-10 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-background p-6 shadow-[0_-8px_24px_rgba(0,0,0,0.12)] md:static md:z-auto md:max-h-none md:w-full md:max-w-sm md:rounded-2xl md:border md:border-border/60 md:p-8 md:shadow-none">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border md:hidden" />

        <div className="text-center">
          <h1 className="font-serif text-2xl font-bold text-primary md:text-3xl">
            Reset your password
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {sent
              ? "We've sent you a reset link"
              : "Enter your email and we'll send you a link to reset your password"}
          </p>
        </div>

        <div className="mt-5">
          {sent ? (
            <div className="space-y-4 rounded-lg border border-border bg-card p-5 text-center">
              <Mail className="mx-auto h-8 w-8 text-primary" />
              <p className="text-sm text-muted-foreground">
                Check your inbox (and spam folder) for a link to reset your password. The link
                expires shortly, so use it soon.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required placeholder="you@example.com" />
              </div>
              <Button type="submit" className="w-full bg-primary" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send reset link
              </Button>
            </form>
          )}
        </div>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
