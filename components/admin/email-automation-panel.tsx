'use client';

import { useEffect, useState, FormEvent } from 'react';
import { Mail, Save } from 'lucide-react';
import {
  EmailAutomationSettings,
  DEFAULT_EMAIL_AUTOMATION_SETTINGS,
  fetchEmailAutomationSettings,
  saveEmailAutomationSettings,
  EmailAutomationLogEntry,
  fetchEmailAutomationLog,
} from '@/lib/email-automation-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function EmailAutomationPanel() {
  const [settings, setSettings] = useState<EmailAutomationSettings>(DEFAULT_EMAIL_AUTOMATION_SETTINGS);
  const [log, setLog] = useState<EmailAutomationLogEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchEmailAutomationSettings(), fetchEmailAutomationLog()])
      .then(([s, l]) => {
        setSettings(s);
        setLog(l);
      })
      .catch(() => toast.error('Failed to load email automation settings'))
      .finally(() => setLoading(false));
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveEmailAutomationSettings(settings);
      toast.success('Email automation settings saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="mt-4 text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="mt-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" /> Email Automation
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Runs once a day via a scheduled job. Requires an email provider configured under
            Admin &gt; Settings &gt; Email Notifications.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-8">
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Welcome series</p>
                  <p className="text-sm text-muted-foreground">
                    Sends a one-time welcome email with a discount code after signup.
                  </p>
                </div>
                <Switch
                  checked={settings.welcome_enabled}
                  onCheckedChange={(v) => setSettings({ ...settings, welcome_enabled: v })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Send after (hours since signup)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={settings.welcome_delay_hours}
                    onChange={(e) =>
                      setSettings({ ...settings, welcome_delay_hours: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Coupon code to include</Label>
                  <Input
                    value={settings.welcome_coupon_code}
                    onChange={(e) => setSettings({ ...settings, welcome_coupon_code: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Create this coupon code under Admin &gt; Coupons so it actually works at checkout.
              </p>
            </section>

            <section className="space-y-4 border-t border-border pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Win-back campaign</p>
                  <p className="text-sm text-muted-foreground">
                    Sends a one-time "we miss you" email to customers who haven't ordered in a while.
                  </p>
                </div>
                <Switch
                  checked={settings.winback_enabled}
                  onCheckedChange={(v) => setSettings({ ...settings, winback_enabled: v })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Inactive for (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={settings.winback_days_inactive}
                    onChange={(e) =>
                      setSettings({ ...settings, winback_days_inactive: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Coupon code to include</Label>
                  <Input
                    value={settings.winback_coupon_code}
                    onChange={(e) => setSettings({ ...settings, winback_coupon_code: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Each customer only ever gets one win-back email — create this coupon under Admin &gt; Coupons too.
              </p>
            </section>

            <Button type="submit" disabled={saving}>
              <Save className="mr-2 h-4 w-4" /> {saving ? 'Saving…' : 'Save settings'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent sends</CardTitle>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">No automated emails sent yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {log.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span>{entry.email}</span>
                  <span className="flex items-center gap-3">
                    <Badge variant="outline" className="capitalize">
                      {entry.automation_type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.sent_at).toLocaleString('en-IN')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
