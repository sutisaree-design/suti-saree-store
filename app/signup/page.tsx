'use client';

import { useState, FormEvent, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16 4 9.1 8.5 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.4 0 10.3-2.1 14-5.5l-6.5-5.5c-2 1.5-4.6 2.5-7.5 2.5-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9 39.5 15.9 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.5 5.5C41.5 36 44 30.5 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="#1877F2">
      <path d="M22 12.06C22 6.51 17.52 2 12 2S2 6.51 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.9 3.77-3.9 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.89h2.78l-.44 2.91h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94z" />
    </svg>
  );
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/account';
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [facebookLoading, setFacebookLoading] = useState(false);
  const [referredByCode, setReferredByCode] = useState(searchParams.get('ref') || '');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const fullName = fd.get('fullName') as string;
    const email = fd.get('email') as string;
    const password = fd.get('password') as string;

    setLoading(true);
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, email, password, next, referredByCode: referredByCode || undefined }),
    });
    const result = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      toast.error(result.error || 'Something went wrong. Please try again.');
      return;
    }

    toast.success('Check your email to confirm your account, then log in.');
    router.push('/login');
  };

  const onGoogle = async () => {
    setGoogleLoading(true);
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      toast.error(error.message);
      setGoogleLoading(false);
    }
  };

  const onFacebook = async () => {
    setFacebookLoading(true);
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      toast.error(error.message);
      setFacebookLoading(false);
    }
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

      {/* Signup card — fixed bottom sheet on mobile, centered card on desktop */}
      <div className="fixed inset-x-0 bottom-0 z-10 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-background p-6 shadow-[0_-8px_24px_rgba(0,0,0,0.12)] md:static md:z-auto md:max-h-none md:w-full md:max-w-sm md:rounded-2xl md:border md:border-border/60 md:p-8 md:shadow-none">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border md:hidden" />

        <div className="text-center">
          <h1 className="font-serif text-2xl font-bold text-primary md:text-3xl">
            Create your account
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Join AruhiHandlooms for faster checkout &amp; order tracking
          </p>
        </div>

        <div className="mt-5 space-y-5">
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            onClick={onGoogle}
            disabled={googleLoading}
          >
            {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
            Continue with Google
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            onClick={onFacebook}
            disabled={facebookLoading}
          >
            {facebookLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FacebookIcon />}
            Continue with Facebook
          </Button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs uppercase text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" name="fullName" required placeholder="Priya Sharma" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required placeholder="you@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <PasswordInput id="password" name="password" required minLength={6} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="referredByCode">
                Referral code <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="referredByCode"
                name="referredByCode"
                value={referredByCode}
                onChange={(e) => setReferredByCode(e.target.value.toUpperCase())}
                placeholder="e.g. PRIYA4F2K"
                className="uppercase"
              />
            </div>
            <Button type="submit" className="w-full bg-primary" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create account
            </Button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
