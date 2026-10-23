'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Store, CheckCircle2, Clock, XCircle, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/auth-context';
import { fetchMyVendorProfile, submitVendorApplication, checkVendorNameAvailability, type VendorProfile, type VendorNameConflict } from '@/lib/vendor-api';

const EMPTY_FORM = {
  business_name: '',
  owner_name: '',
  phone: '',
  whatsapp: '',
  email: '',
  pan_number: '',
  gst_number: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  pincode: '',
  expected_category: '',
};

export default function SellWithUsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [checkingProfile, setCheckingProfile] = useState(true);
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [nameConflict, setNameConflict] = useState<VendorNameConflict | null>(null);

  // Debounced live check: warns before submitting if this business name
  // would collide with an existing vendor's or admin collection's page
  // (both share the /collection/[slug] URL space).
  useEffect(() => {
    const name = form.business_name.trim();
    if (!name) {
      setNameConflict(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      checkVendorNameAvailability(name).then((conflict) => {
        if (!cancelled) setNameConflict(conflict);
      });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.business_name]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setCheckingProfile(false);
      return;
    }
    setForm((f) => ({ ...f, email: user.email || f.email }));
    fetchMyVendorProfile()
      .then(setProfile)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to check application status'))
      .finally(() => setCheckingProfile(false));
  }, [authLoading, user]);

  const handleChange = (field: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !form.business_name ||
      !form.owner_name ||
      !form.phone ||
      !form.pan_number ||
      !form.address_line1 ||
      !form.city ||
      !form.state ||
      !form.pincode
    ) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (!/^[0-9]{6}$/.test(form.pincode)) {
      toast.error('Pincode must be a 6-digit number');
      return;
    }
    setSubmitting(true);
    try {
      const created = await submitVendorApplication(form);
      setProfile(created);
      toast.success('Application submitted! We will review it soon.');
      // GA4 event for Google Ads "Vendor Signup" conversion tracking.
      if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
        (window as any).gtag('event', 'vendor_signup', {
          event_category: 'partner_signup',
          event_label: 'sell_with_us',
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  };

  const heading = (
    <div className="mb-10 text-center sm:mb-14">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Vendor Sourcing</p>
      <h1 className="mt-1 font-serif text-3xl font-bold text-primary sm:text-4xl">Sell With Us</h1>
      <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
        Partner with AruhiHandlooms as a supplying vendor. This is an internal sourcing
        relationship — your business is never shown publicly on the site; we photograph,
        list, and ship every order to your customer under our own name.
      </p>
    </div>
  );

  if (authLoading || checkingProfile) {
    return (
      <div className="container-boutique max-w-2xl py-14 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Not logged in — apply with the same account used to shop / order.
  if (!user) {
    return (
      <div className="container-boutique max-w-2xl py-10 sm:py-14">
        {heading}
        <div className="rounded-lg border border-border/60 bg-gradient-to-br from-primary/5 to-secondary/5 p-6 text-center">
          <Store className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 font-serif text-lg font-semibold text-primary">Log in to apply</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Vendor applications use the same login as your regular AruhiHandlooms account.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Link href="/login?next=/sell-with-us">
              <Button className="bg-primary">Log In</Button>
            </Link>
            <Link href="/signup?next=/sell-with-us">
              <Button variant="outline">Create Account</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Already applied — show status instead of the form.
  if (profile) {
    const statusMeta: Record<VendorProfile['status'], { icon: typeof Clock; label: string; className: string; body: string }> = {
      pending: {
        icon: Clock,
        label: 'Under Review',
        className: 'text-amber-600 bg-amber-50 border-amber-200',
        body: "We've received your application and our team is reviewing it. We'll notify you by email once there's an update.",
      },
      approved: {
        icon: CheckCircle2,
        label: 'Approved',
        className: 'text-green-700 bg-green-50 border-green-200',
        body: 'Your vendor application is approved. Head to your vendor dashboard to get started.',
      },
      rejected: {
        icon: XCircle,
        label: 'Not Approved',
        className: 'text-red-700 bg-red-50 border-red-200',
        body: profile.admin_note || "We're not able to move ahead with your application at this time.",
      },
      suspended: {
        icon: Ban,
        label: 'Suspended',
        className: 'text-red-700 bg-red-50 border-red-200',
        body: 'Your vendor account is currently suspended. Please contact us for details.',
      },
    };
    const meta = statusMeta[profile.status];
    const Icon = meta.icon;

    return (
      <div className="container-boutique max-w-2xl py-10 sm:py-14">
        {heading}
        <div className={`rounded-lg border p-6 text-center ${meta.className}`}>
          <Icon className="mx-auto h-8 w-8" />
          <p className="mt-3 font-serif text-lg font-semibold">{meta.label}</p>
          <p className="mt-1 text-sm">{meta.body}</p>
          {profile.status === 'approved' && (
            <Button className="mt-5 bg-primary" onClick={() => router.push('/vendor/dashboard')}>
              Go to Vendor Dashboard
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Logged in, no application yet — show the form.
  return (
    <div className="container-boutique max-w-2xl py-10 sm:py-14">
      {heading}
      <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-border/60 bg-card p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Business Name *</Label>
            <Input required value={form.business_name} onChange={handleChange('business_name')} />
            {nameConflict && (
              <p className="mt-1 text-xs text-amber-600">
                &ldquo;{nameConflict.name}&rdquo; is already in use —{' '}
                <Link href={`/collection/${nameConflict.slug}`} target="_blank" className="underline">
                  view that collection
                </Link>
                . You can still apply; a number will be added to your storefront link if needed.
              </p>
            )}
          </div>
          <div>
            <Label>Owner Name *</Label>
            <Input required value={form.owner_name} onChange={handleChange('owner_name')} />
          </div>
          <div>
            <Label>Phone *</Label>
            <Input required value={form.phone} onChange={handleChange('phone')} />
          </div>
          <div>
            <Label>WhatsApp</Label>
            <Input value={form.whatsapp} onChange={handleChange('whatsapp')} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={handleChange('email')} />
          </div>
          <div>
            <Label>PAN Number *</Label>
            <Input required value={form.pan_number} onChange={handleChange('pan_number')} />
          </div>
          <div>
            <Label>GST Number (optional)</Label>
            <Input value={form.gst_number} onChange={handleChange('gst_number')} />
          </div>
          <div>
            <Label>Expected Product Category</Label>
            <Input
              placeholder="e.g. Silk Sarees"
              value={form.expected_category}
              onChange={handleChange('expected_category')}
            />
          </div>
        </div>
        <div className="space-y-4 rounded-md border border-border/60 p-4">
          <p className="text-sm font-semibold text-primary">Pickup Address *</p>
          <p className="-mt-2 text-xs text-muted-foreground">
            This is where our courier partner will collect stock from — not shown to customers.
          </p>
          <div>
            <Label>Address Line 1 *</Label>
            <Input
              required
              placeholder="House/Flat no., Street, Area"
              value={form.address_line1}
              onChange={handleChange('address_line1')}
            />
          </div>
          <div>
            <Label>Address Line 2 (optional)</Label>
            <Input
              placeholder="Landmark, additional info"
              value={form.address_line2}
              onChange={handleChange('address_line2')}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>City *</Label>
              <Input required value={form.city} onChange={handleChange('city')} />
            </div>
            <div>
              <Label>State *</Label>
              <Input required value={form.state} onChange={handleChange('state')} />
            </div>
            <div>
              <Label>Pincode *</Label>
              <Input
                required
                inputMode="numeric"
                maxLength={6}
                placeholder="6-digit pincode"
                value={form.pincode}
                onChange={handleChange('pincode')}
              />
            </div>
          </div>
        </div>
        <Button type="submit" className="w-full bg-primary" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit Application'}
        </Button>
      </form>
    </div>
  );
}
