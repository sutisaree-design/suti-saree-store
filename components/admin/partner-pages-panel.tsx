'use client';

import { useEffect, useState, FormEvent } from 'react';
import { toast } from 'sonner';
import { Save, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  PartnerPagesContent,
  PartnerRegistrationContent,
  PartnerLandingContent,
  fetchPartnerPagesContent,
  savePartnerPagesContent,
  DEFAULT_PARTNER_PAGES_CONTENT,
} from '@/lib/settings-api';

// Admin > Marketing > Partner Pages.
// Edits copy shown on the 4 public vendor/reseller SEO landing pages —
// /vendor-registration, /vendor-login, /reseller-registration,
// /reseller-login. These pages exist outside the login-protected
// /vendor and /account paths on purpose, so Google can actually index
// them; this panel is how admins update that copy without a code change.

type RegistrationKey = 'vendor_registration' | 'reseller_registration';
type LoginKey = 'vendor_login' | 'reseller_login';

const REGISTRATION_PAGES: { key: RegistrationKey; label: string; path: string }[] = [
  { key: 'vendor_registration', label: 'Vendor Registration', path: '/vendor-registration' },
  { key: 'reseller_registration', label: 'Reseller Registration', path: '/reseller-registration' },
];

const LOGIN_PAGES: { key: LoginKey; label: string; path: string }[] = [
  { key: 'vendor_login', label: 'Vendor Login', path: '/vendor-login' },
  { key: 'reseller_login', label: 'Reseller Login', path: '/reseller-login' },
];

export default function PartnerPagesPanel() {
  const [form, setForm] = useState<PartnerPagesContent | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPartnerPagesContent()
      .then(setForm)
      .catch(() => toast.error('Failed to load partner pages content'));
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      await savePartnerPagesContent(form);
      toast.success('Partner pages content saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const updateRegistration = <K extends keyof PartnerRegistrationContent>(
    key: RegistrationKey,
    field: K,
    value: PartnerRegistrationContent[K]
  ) => {
    setForm((f) => f && { ...f, [key]: { ...f[key], [field]: value } });
  };

  const updateLanding = <K extends keyof PartnerLandingContent>(
    key: LoginKey,
    field: K,
    value: PartnerLandingContent[K]
  ) => {
    setForm((f) => f && { ...f, [key]: { ...f[key], [field]: value } });
  };

  const updateStep = (key: RegistrationKey, i: number, field: 'title' | 'body', text: string) => {
    setForm((f) => {
      if (!f) return f;
      const steps = f[key].steps.map((s, idx) => (idx === i ? { ...s, [field]: text } : s));
      return { ...f, [key]: { ...f[key], steps } };
    });
  };

  const updateFaq = (key: RegistrationKey, i: number, field: 'q' | 'a', text: string) => {
    setForm((f) => {
      if (!f) return f;
      const faqs = f[key].faqs.map((item, idx) => (idx === i ? { ...item, [field]: text } : item));
      return { ...f, [key]: { ...f[key], faqs } };
    });
  };

  if (!form) {
    return <p className="py-4 text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-2xl font-bold text-primary">Partner Pages (Vendor &amp; Reseller SEO)</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          These 4 public pages exist so Google can index vendor/reseller registration
          and login — the real forms live behind login and can&apos;t be indexed
          directly. Edit their headline, description, and FAQ copy here; the login/
          registration buttons and links are fixed and always point to the correct place.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-10">
        {REGISTRATION_PAGES.map(({ key, label, path }) => {
          const c = form[key];
          return (
            <div key={key} className="rounded-lg border border-border/60 bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-serif text-lg font-semibold text-primary">{label}</h3>
                <a
                  href={path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-secondary hover:underline"
                >
                  View page <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="mt-4 grid gap-4">
                <div className="grid gap-1.5">
                  <Label>Hero heading</Label>
                  <Input
                    value={c.hero_heading}
                    onChange={(e) => updateRegistration(key, 'hero_heading', e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Hero subtext (also used as the page&apos;s meta description)</Label>
                  <Textarea
                    rows={2}
                    value={c.hero_subtext}
                    onChange={(e) => updateRegistration(key, 'hero_subtext', e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5 sm:max-w-xs">
                  <Label>Button text</Label>
                  <Input
                    value={c.cta_label}
                    onChange={(e) => updateRegistration(key, 'cta_label', e.target.value)}
                  />
                </div>

                <div className="mt-2 border-t border-border/60 pt-4">
                  <p className="text-sm font-medium">Steps (4 — icons are fixed, only text is editable)</p>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    {c.steps.map((s, i) => (
                      <div key={i} className="grid gap-1.5 rounded-md border border-border/60 p-3">
                        <Label>Step {i + 1} title</Label>
                        <Input value={s.title} onChange={(e) => updateStep(key, i, 'title', e.target.value)} />
                        <Label>Step {i + 1} body</Label>
                        <Textarea
                          rows={2}
                          value={s.body}
                          onChange={(e) => updateStep(key, i, 'body', e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-2 border-t border-border/60 pt-4">
                  <p className="text-sm font-medium">FAQs (3 — shown on-page and as FAQ rich results)</p>
                  <div className="mt-3 space-y-4">
                    {c.faqs.map((f, i) => (
                      <div key={i} className="grid gap-1.5 rounded-md border border-border/60 p-3">
                        <Label>Question {i + 1}</Label>
                        <Input value={f.q} onChange={(e) => updateFaq(key, i, 'q', e.target.value)} />
                        <Label>Answer {i + 1}</Label>
                        <Textarea rows={2} value={f.a} onChange={(e) => updateFaq(key, i, 'a', e.target.value)} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {LOGIN_PAGES.map(({ key, label, path }) => {
          const c = form[key];
          return (
            <div key={key} className="rounded-lg border border-border/60 bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-serif text-lg font-semibold text-primary">{label}</h3>
                <a
                  href={path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-secondary hover:underline"
                >
                  View page <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="mt-4 grid gap-4">
                <div className="grid gap-1.5">
                  <Label>Hero heading</Label>
                  <Input value={c.hero_heading} onChange={(e) => updateLanding(key, 'hero_heading', e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Hero subtext (also used as the page&apos;s meta description)</Label>
                  <Textarea rows={2} value={c.hero_subtext} onChange={(e) => updateLanding(key, 'hero_subtext', e.target.value)} />
                </div>
                <div className="grid gap-1.5 sm:max-w-xs">
                  <Label>Button text</Label>
                  <Input value={c.cta_label} onChange={(e) => updateLanding(key, 'cta_label', e.target.value)} />
                </div>
              </div>
            </div>
          );
        })}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving} className="w-fit bg-primary">
            <Save className="mr-1.5 h-4 w-4" /> {saving ? 'Saving…' : 'Save Partner Pages Content'}
          </Button>
          <Button type="button" variant="outline" onClick={() => setForm(DEFAULT_PARTNER_PAGES_CONTENT)}>
            Reset to default text
          </Button>
        </div>
      </form>
    </div>
  );
}
