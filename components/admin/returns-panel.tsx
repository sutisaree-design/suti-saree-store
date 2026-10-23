'use client';

import { useEffect, useState } from 'react';
import { useAdminFocus } from './use-admin-focus';
import { Loader2, RotateCcw, Truck, IndianRupee, ShieldAlert, Package } from 'lucide-react';
import { formatINR } from '@/lib/format';
import {
  fetchReturnAutomationSettings,
  saveReturnAutomationSettings,
  type ReturnAutomationSettings,
} from '@/lib/settings-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

type ReturnRow = {
  id: string;
  order_id: string;
  type: 'return' | 'exchange';
  reason: string;
  reason_key?: string | null;
  desired_size?: string | null;
  status: string;
  admin_notes?: string | null;
  refund_amount?: number | null;
  created_at: string;
  pickup_status: string;
  pickup_waybill?: string | null;
  pickup_error?: string | null;
  refund_status?: string | null;
  razorpay_refund_id?: string | null;
  refund_error?: string | null;
  exchange_courier?: string | null;
  exchange_tracking_number?: string | null;
  exchange_shipped_at?: string | null;
  exchange_ready_date?: string | null;
  order?: {
    customer_name?: string;
    customer_email?: string;
    total_amount?: number;
    payment_method?: string;
  } | null;
  return_risk?: {
    return_count: number;
    rto_count: number;
    blocked_until: string | null;
    is_blocked: boolean;
  } | null;
};

const STATUS_OPTIONS = ['requested', 'approved', 'rejected', 'refunded', 'completed'];

const STATUS_COLORS: Record<string, string> = {
  requested: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800',
  rejected: 'bg-red-100 text-red-800',
  refunded: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-emerald-100 text-emerald-800',
};

const PICKUP_LABELS: Record<string, string> = {
  not_scheduled: 'Pickup not scheduled',
  scheduled: 'Pickup scheduled',
  picked_up: 'Picked up',
  in_transit: 'In transit to warehouse',
  received: 'Received at warehouse',
  failed: 'Pickup failed',
};

const PICKUP_COLORS: Record<string, string> = {
  not_scheduled: 'bg-muted text-muted-foreground',
  scheduled: 'bg-blue-100 text-blue-800',
  picked_up: 'bg-indigo-100 text-indigo-800',
  in_transit: 'bg-indigo-100 text-indigo-800',
  received: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
};

const REFUND_LABELS: Record<string, string> = {
  not_applicable: 'No refund needed (COD)',
  pending: 'Refund pending',
  pending_manual: 'Refund pending — manual',
  processing: 'Refund processing…',
  refunded: 'Refunded',
  failed: 'Refund failed',
};

const REFUND_COLORS: Record<string, string> = {
  not_applicable: 'bg-muted text-muted-foreground',
  pending: 'bg-amber-100 text-amber-800',
  pending_manual: 'bg-amber-100 text-amber-800',
  processing: 'bg-blue-100 text-blue-800',
  refunded: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
};

export default function ReturnsPanel() {
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(false);
  useAdminFocus(!loading && returns.length > 0);
  const [automation, setAutomation] = useState<ReturnAutomationSettings | null>(null);
  const [savingAutomation, setSavingAutomation] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/returns');
      if (res.ok) {
        const body = await res.json();
        setReturns(body.returns || []);
      } else {
        toast.error('Failed to load return requests');
      }
    } catch {
      toast.error('Failed to load return requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    fetchReturnAutomationSettings().then(setAutomation);
  }, []);

  const onToggleAutomation = async (checked: boolean) => {
    if (!automation) return;
    const next: ReturnAutomationSettings = { mode: checked ? 'automatic' : 'manual' };
    setAutomation(next);
    setSavingAutomation(true);
    try {
      await saveReturnAutomationSettings(next);
      toast.success(
        checked
          ? 'Automatic mode on — pickup + refund happen with no admin action'
          : 'Switched to manual — you\u2019ll trigger pickup + refund yourself'
      );
    } catch (err) {
      setAutomation(automation);
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingAutomation(false);
    }
  };

  const pendingCount = returns.filter((r) => r.status === 'requested').length;

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border/60 bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Requests</p>
          <p className="mt-2 text-2xl font-semibold">{returns.length}</p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card p-4">
          <p className="text-xs text-muted-foreground">Awaiting Review</p>
          <p className="mt-2 text-2xl font-semibold">{pendingCount}</p>
        </div>
      </div>

      <div className="flex max-w-xl items-center justify-between gap-4 rounded-lg border border-border/60 bg-card p-5">
        <div>
          <Label htmlFor="return-automation-enabled">
            {!automation ? 'Loading…' : automation.mode === 'automatic' ? 'Automatic' : 'Manual'} return
            processing
          </Label>
          <p className="text-xs text-muted-foreground">
            {automation?.mode === 'automatic'
              ? 'On: approving a return auto-schedules Delhivery reverse pickup, and the refund fires automatically once it\u2019s back at your warehouse.'
              : 'Off: pickup and refund each need a button click from you — use this if you want to review every step by hand.'}
          </p>
        </div>
        <Switch
          id="return-automation-enabled"
          checked={automation?.mode === 'automatic'}
          disabled={!automation || savingAutomation}
          onCheckedChange={onToggleAutomation}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
        </div>
      ) : returns.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <RotateCcw className="h-10 w-10" />
          <p>No return or exchange requests yet.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {returns.map((r) => (
            <div key={r.id} data-focus-id={r.id}>
              <ReturnCard r={r} onUpdated={load} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReturnCard({ r, onUpdated }: { r: ReturnRow; onUpdated: () => void }) {
  const [status, setStatus] = useState(r.status);
  const [notes, setNotes] = useState(r.admin_notes || '');
  const [refundAmount, setRefundAmount] = useState(r.refund_amount?.toString() || '');
  const [saving, setSaving] = useState(false);
  const [schedulingPickup, setSchedulingPickup] = useState(false);
  const [checkingPickup, setCheckingPickup] = useState(false);
  const [processingRefund, setProcessingRefund] = useState(false);

  // Exchange shipping fields
  const [exchangeCourier, setExchangeCourier] = useState(r.exchange_courier || '');
  const [exchangeTracking, setExchangeTracking] = useState(r.exchange_tracking_number || '');
  const [exchangeReadyDate, setExchangeReadyDate] = useState(r.exchange_ready_date || '');
  const [shippingExchange, setShippingExchange] = useState(false);
  const [savingReadyDate, setSavingReadyDate] = useState(false);

  const dirty =
    status !== r.status ||
    notes !== (r.admin_notes || '') ||
    refundAmount !== (r.refund_amount?.toString() || '');

  const isOnlinePaid = r.order?.payment_method === 'online';
  const canSchedulePickup =
    ['approved', 'requested'].includes(r.status) &&
    r.pickup_status !== 'received' &&
    !r.pickup_waybill;
  const canCheckPickup = !!r.pickup_waybill && r.pickup_status !== 'received';
  const canProcessRefund =
    isOnlinePaid && r.refund_status !== 'refunded' && r.refund_status !== 'not_applicable';

  const isExchange = r.type === 'exchange';
  const exchangeAlreadyShipped = !!r.exchange_shipped_at;
  const canMarkExchangeShipped =
    isExchange && !exchangeAlreadyShipped && (exchangeCourier.trim() || exchangeTracking.trim());

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/returns/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          admin_notes: notes,
          refund_amount: refundAmount ? Number(refundAmount) : null,
        }),
      });
      if (res.ok) {
        toast.success('Return request updated — customer notified by email');
        onUpdated();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || 'Failed to update');
      }
    } catch {
      toast.error('Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const schedulePickup = async () => {
    setSchedulingPickup(true);
    try {
      const res = await fetch(`/api/admin/returns/${r.id}/schedule-pickup`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success('Reverse pickup scheduled with Delhivery — customer notified');
        onUpdated();
      } else {
        toast.error(body.error || 'Failed to schedule pickup');
      }
    } catch {
      toast.error('Failed to schedule pickup');
    } finally {
      setSchedulingPickup(false);
    }
  };

  const checkPickup = async () => {
    setCheckingPickup(true);
    try {
      const res = await fetch(`/api/admin/returns/${r.id}/check-pickup`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Pickup status: ${PICKUP_LABELS[body.pickup_status] || body.pickup_status}`);
        onUpdated();
      } else {
        toast.error(body.error || 'Failed to check pickup status');
      }
    } catch {
      toast.error('Failed to check pickup status');
    } finally {
      setCheckingPickup(false);
    }
  };

  const processRefund = async () => {
    setProcessingRefund(true);
    try {
      const res = await fetch(`/api/admin/returns/${r.id}/refund`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success('Refund processed via Razorpay — customer notified');
        onUpdated();
      } else {
        toast.error(body.error || 'Refund failed');
      }
    } catch {
      toast.error('Refund failed');
    } finally {
      setProcessingRefund(false);
    }
  };

  const markExchangeShipped = async () => {
    if (!exchangeCourier.trim() && !exchangeTracking.trim()) {
      toast.error('Courier ya tracking number enter karo');
      return;
    }
    setShippingExchange(true);
    try {
      const res = await fetch(`/api/admin/returns/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exchange_courier: exchangeCourier.trim() || null,
          exchange_tracking_number: exchangeTracking.trim() || null,
          exchange_shipped_at: new Date().toISOString(),
          status: 'completed',
        }),
      });
      if (res.ok) {
        toast.success('Exchange item marked as shipped — customer ko email gaya');
        onUpdated();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || 'Failed to mark as shipped');
      }
    } catch {
      toast.error('Failed to mark as shipped');
    } finally {
      setShippingExchange(false);
    }
  };

  const saveReadyDate = async () => {
    setSavingReadyDate(true);
    try {
      const res = await fetch(`/api/admin/returns/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exchange_ready_date: exchangeReadyDate || null,
        }),
      });
      if (res.ok) {
        toast.success('Ready date saved — customer ko email gaya');
        onUpdated();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || 'Failed to save date');
      }
    } catch {
      toast.error('Failed to save date');
    } finally {
      setSavingReadyDate(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium capitalize">
            {r.type} request{' '}
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status] || 'bg-muted'}`}
            >
              {r.status}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Order #{r.order_id.slice(0, 8)} &middot; {r.order?.customer_name || 'Guest'} (
            {r.order?.customer_email || '—'}) &middot; {isOnlinePaid ? 'Paid online' : 'COD'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Requested {new Date(r.created_at).toLocaleString('en-IN')}
          </p>
          {r.return_risk && r.return_risk.return_count + r.return_risk.rto_count >= 2 && (
            <span
              className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                r.return_risk.is_blocked ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              <ShieldAlert className="h-3 w-3" />
              {r.return_risk.return_count} return{r.return_risk.return_count === 1 ? '' : 's'} &middot;{' '}
              {r.return_risk.rto_count} RTO{r.return_risk.rto_count === 1 ? '' : 's'}
              {r.return_risk.is_blocked && r.return_risk.blocked_until && (
                <> — COD paused till {new Date(r.return_risk.blocked_until).toLocaleDateString('en-IN')}</>
              )}
            </span>
          )}
        </div>
        {r.order?.total_amount !== undefined && (
          <div className="text-sm font-semibold">{formatINR(r.order.total_amount)}</div>
        )}
      </div>

      {/* Reason */}
      <p className="mt-3 text-sm">
        <span className="font-medium">Reason: </span>
        {r.reason}
      </p>

      {/* Desired size — exchange */}
      {isExchange && r.desired_size && (
        <p className="mt-1 text-sm">
          <span className="font-medium">Customer chahta hai: </span>
          <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-blue-800">{r.desired_size}</span>
        </p>
      )}

      {/* Pickup + refund status badges */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${PICKUP_COLORS[r.pickup_status] || 'bg-muted'}`}
        >
          <Truck className="h-3 w-3" /> {PICKUP_LABELS[r.pickup_status] || r.pickup_status}
        </span>
        {r.pickup_waybill && (
          <span className="text-xs text-muted-foreground">AWB: {r.pickup_waybill}</span>
        )}
        {r.refund_status && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${REFUND_COLORS[r.refund_status] || 'bg-muted'}`}
          >
            <IndianRupee className="h-3 w-3" /> {REFUND_LABELS[r.refund_status] || r.refund_status}
          </span>
        )}
        {isExchange && exchangeAlreadyShipped && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
            <Package className="h-3 w-3" /> Exchange shipped{' '}
            {r.exchange_courier ? `via ${r.exchange_courier}` : ''}
            {r.exchange_tracking_number ? ` — ${r.exchange_tracking_number}` : ''}
          </span>
        )}
      </div>
      {r.pickup_error && (
        <p className="mt-1 text-xs text-red-700">Pickup issue: {r.pickup_error}</p>
      )}
      {r.refund_error && (
        <p className="mt-1 text-xs text-red-700">Refund issue: {r.refund_error}</p>
      )}

      {/* Action buttons */}
      <div className="mt-3 flex flex-wrap gap-2">
        {canSchedulePickup && (
          <Button size="sm" variant="outline" onClick={schedulePickup} disabled={schedulingPickup}>
            {schedulingPickup && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Schedule Reverse Pickup
          </Button>
        )}
        {canCheckPickup && (
          <Button size="sm" variant="outline" onClick={checkPickup} disabled={checkingPickup}>
            {checkingPickup && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Check Pickup Status
          </Button>
        )}
        {canProcessRefund && (
          <Button size="sm" variant="outline" onClick={processRefund} disabled={processingRefund}>
            {processingRefund && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Process Refund Now
          </Button>
        )}
      </div>

      {/* Exchange shipping section */}
      {isExchange && !exchangeAlreadyShipped && (
        <div className="mt-4 rounded-md border border-blue-200 bg-blue-50/50 p-3">
          <p className="mb-2 text-xs font-semibold text-blue-900">
            📦 New item dispatch (exchange)
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1">
              <label className="text-xs font-medium text-muted-foreground">Courier</label>
              <Input
                value={exchangeCourier}
                onChange={(e) => setExchangeCourier(e.target.value)}
                placeholder="E.g. Delhivery, DTDC, BlueDart"
                className="h-8 text-sm"
              />
            </div>
            <div className="grid gap-1">
              <label className="text-xs font-medium text-muted-foreground">Tracking number</label>
              <Input
                value={exchangeTracking}
                onChange={(e) => setExchangeTracking(e.target.value)}
                placeholder="AWB / tracking ID"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="mt-2 flex items-end gap-3">
            <div className="grid gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                Stock ready date <span className="text-muted-foreground">(agar abhi nahi hai)</span>
              </label>
              <Input
                type="date"
                value={exchangeReadyDate}
                onChange={(e) => setExchangeReadyDate(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={saveReadyDate}
              disabled={savingReadyDate || !exchangeReadyDate}
              className="h-8 text-xs"
            >
              {savingReadyDate && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Notify ready date
            </Button>
          </div>
          <Button
            size="sm"
            className="mt-3 w-full bg-blue-700 text-white hover:bg-blue-800"
            onClick={markExchangeShipped}
            disabled={shippingExchange || !canMarkExchangeShipped}
          >
            {shippingExchange && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Mark Exchange Item as Shipped &amp; Notify Customer
          </Button>
        </div>
      )}

      {/* Status / refund / notes */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded border px-2 py-1.5 text-sm"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Refund amount (₹)</label>
          <Input
            type="number"
            value={refundAmount}
            onChange={(e) => setRefundAmount(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-1">
          <label className="text-xs font-medium text-muted-foreground">Note to customer</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note" />
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={save} disabled={!dirty || saving}>
          {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          Save &amp; notify customer
        </Button>
      </div>
    </div>
  );
}
