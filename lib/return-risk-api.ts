// ---------------------------------------------------------------------
// Return / RTO risk tracking.
//
// Har baar jab:
//   - ek return "refunded"/"completed" hota hai (lib/return-automation.ts), ya
//   - ek forward shipment Delhivery par RTO dikhata hai (lib/cron-jobs.ts
//     -> runForwardShipmentTrackingJob)
// tab recordReturnRiskIncident() us order ke customer_phone ke against
// `customer_return_risk` row update karta hai.
//
// Jaise hi kisi phone number ka (return_count + rto_count) >= 2 ho jaata
// hai, us number ke liye 15 din ka `blocked_until` set ho jaata hai —
// is window ke andar naya COD order place_order_with_items() (SQL side,
// supabase/migrations/20260911000000_return_rto_risk_tracking.sql) khud
// reject kar deta hai. Prepaid/online orders kabhi block nahi hote.
//
// Server-only module (service-role client) — 'use client' components se
// import mat karo.
// ---------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js';

export const RETURN_RISK_THRESHOLD = 2; // combined return+RTO count that triggers a cooldown
export const RETURN_RISK_COOLDOWN_DAYS = 15;

export type ReturnRiskIncidentType = 'return' | 'rto';

export interface CustomerReturnRisk {
  phone: string;
  return_count: number;
  rto_count: number;
  last_incident_at: string | null;
  last_incident_type: ReturnRiskIncidentType | null;
  blocked_until: string | null;
  is_blocked: boolean;
}

function toRiskView(row: any, phone: string): CustomerReturnRisk {
  const blocked_until = row?.blocked_until ?? null;
  return {
    phone,
    return_count: row?.return_count ?? 0,
    rto_count: row?.rto_count ?? 0,
    last_incident_at: row?.last_incident_at ?? null,
    last_incident_type: row?.last_incident_type ?? null,
    blocked_until,
    is_blocked: !!blocked_until && new Date(blocked_until).getTime() > Date.now(),
  };
}

/** Reads the current risk record for a phone number. Never throws — an
 *  unknown/clean number just comes back as all-zero, not-blocked. */
export async function getReturnRiskForPhone(
  admin: SupabaseClient,
  phone: string | null | undefined
): Promise<CustomerReturnRisk | null> {
  const clean = phone?.trim();
  if (!clean) return null;

  const { data } = await admin
    .from('customer_return_risk')
    .select('*')
    .eq('phone', clean)
    .maybeSingle();

  return toRiskView(data, clean);
}

/** Batch variant of getReturnRiskForPhone, used by the admin returns
 *  panel so it doesn't do one query per row. */
export async function getReturnRiskForPhones(
  admin: SupabaseClient,
  phones: string[]
): Promise<Record<string, CustomerReturnRisk>> {
  const clean = Array.from(new Set(phones.map((p) => p?.trim()).filter((p): p is string => !!p)));
  if (clean.length === 0) return {};

  const { data } = await admin.from('customer_return_risk').select('*').in('phone', clean);
  const byPhone: Record<string, CustomerReturnRisk> = {};
  for (const phone of clean) {
    const row = (data || []).find((r) => r.phone === phone);
    byPhone[phone] = toRiskView(row, phone);
  }
  return byPhone;
}

/**
 * Increments the return or RTO counter for a phone number and — once the
 * combined count crosses RETURN_RISK_THRESHOLD — (re)sets a 15-day
 * `blocked_until` from now. Safe to call repeatedly (e.g. the daily cron
 * re-checking a still-in-transit RTO); each call is a fresh increment, so
 * only call this once per genuinely new incident (return-automation.ts
 * and cron-jobs.ts already guard for that — see their call sites).
 */
export async function recordReturnRiskIncident(
  admin: SupabaseClient,
  phone: string | null | undefined,
  type: ReturnRiskIncidentType
): Promise<CustomerReturnRisk | null> {
  const clean = phone?.trim();
  if (!clean) return null;

  const { data: existing } = await admin
    .from('customer_return_risk')
    .select('*')
    .eq('phone', clean)
    .maybeSingle();

  const nextReturnCount = (existing?.return_count ?? 0) + (type === 'return' ? 1 : 0);
  const nextRtoCount = (existing?.rto_count ?? 0) + (type === 'rto' ? 1 : 0);
  const now = new Date();
  const willBeBlocked = nextReturnCount + nextRtoCount >= RETURN_RISK_THRESHOLD;
  const blockedUntil = willBeBlocked
    ? new Date(now.getTime() + RETURN_RISK_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString()
    : existing?.blocked_until ?? null;

  const { data, error } = await admin
    .from('customer_return_risk')
    .upsert(
      {
        phone: clean,
        return_count: nextReturnCount,
        rto_count: nextRtoCount,
        last_incident_at: now.toISOString(),
        last_incident_type: type,
        blocked_until: blockedUntil,
      },
      { onConflict: 'phone' }
    )
    .select('*')
    .single();

  if (error) return toRiskView(existing, clean);
  return toRiskView(data, clean);
}
