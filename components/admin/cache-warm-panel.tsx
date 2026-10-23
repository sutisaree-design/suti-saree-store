'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Flame, RefreshCw, CheckCircle2, XCircle, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

// -----------------------------------------------------------------------
// Cache Warm Panel — client-driven batch runner.
//
// IMPORTANT: this only runs while this tab is open. There is no reliable
// background job on Vercel's free tier, so "Warm Cache" walks through the
// catalog in small steps called from the browser. Closing the tab pauses
// the run — reopening this panel and clicking the button again picks up
// where it left off (progress is saved server-side after every step).
// -----------------------------------------------------------------------

type WarmStatus = {
  state: 'idle' | 'running' | 'done' | 'error';
  total: number;
  offset: number;
  cached: number;
  failed: number;
  cf_hit: number;
  cf_miss: number;
  cf_other: number;
  cf_unknown: number;
  sample_non_hit_urls: string[];
  failed_urls: string[];
  started_at: string | null;
  finished_at: string | null;
  error?: string;
};

type VerifyStatus = {
  state: 'idle' | 'running' | 'done' | 'error';
  total: number;
  offset: number;
  cf_hit: number;
  cf_miss: number;
  cf_other: number;
  cf_unknown: number;
  sample_non_hit_urls: string[];
  started_at: string | null;
  finished_at: string | null;
  error?: string;
};

const EMPTY_WARM: WarmStatus = {
  state: 'idle', total: 0, offset: 0, cached: 0, failed: 0,
  cf_hit: 0, cf_miss: 0, cf_other: 0, cf_unknown: 0,
  sample_non_hit_urls: [], failed_urls: [], started_at: null, finished_at: null,
};

const EMPTY_VERIFY: VerifyStatus = {
  state: 'idle', total: 0, offset: 0,
  cf_hit: 0, cf_miss: 0, cf_other: 0, cf_unknown: 0,
  sample_non_hit_urls: [], started_at: null, finished_at: null,
};

const STEP_DELAY_MS = 250; // gap between batch calls — gentle on Supabase/R2 & Vercel

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return '';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const secs = Math.round((e - s) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString();
}

export default function CacheWarmPanel() {
  const [warm, setWarm] = useState<WarmStatus>(EMPTY_WARM);
  const [verify, setVerify] = useState<VerifyStatus>(EMPTY_VERIFY);
  const [starting, setStarting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const runningRef = useRef(false); // guards against double loops (e.g. StrictMode double-invoke)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/cache-warm?action=status');
      if (res.ok) {
        const data = await res.json();
        setWarm(data.warm ?? EMPTY_WARM);
        setVerify(data.verify ?? EMPTY_VERIFY);
      }
    } catch {
      // silent — panel just shows last known state
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Drives the warm loop: calls ?action=step repeatedly until done/error.
  const runWarmLoop = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      let current: WarmStatus | null = null;
      do {
        const res = await fetch('/api/admin/cache-warm?action=step', { method: 'POST' });
        current = await res.json();
        setWarm(current!);
        if (current!.state === 'running') {
          await new Promise((r) => setTimeout(r, STEP_DELAY_MS));
        }
      } while (current && current.state === 'running');

      if (current?.state === 'done') toast.success('Cache warm complete!');
      if (current?.state === 'error') toast.error(current.error || 'Cache warm failed');
    } finally {
      runningRef.current = false;
    }
  }, []);

  const runVerifyLoop = useCallback(async () => {
    let current: VerifyStatus | null = null;
    do {
      const res = await fetch('/api/admin/cache-warm?action=verify-step', { method: 'POST' });
      current = await res.json();
      setVerify(current!);
      if (current!.state === 'running') {
        await new Promise((r) => setTimeout(r, STEP_DELAY_MS));
      }
    } while (current && current.state === 'running');

    if (current?.state === 'done') {
      const rate = current.total > 0 ? Math.round((current.cf_hit / current.total) * 100) : 0;
      if (rate >= 90) toast.success(`Verified — ${rate}% actually cached by Cloudflare`);
      else if (rate >= 50) toast.warning(`Verified — only ${rate}% are true HITs`);
      else toast.error(`Verified — only ${rate}% cached. Check Cloudflare config.`);
    }
  }, []);

  const handleStart = async () => {
    setStarting(true);
    try {
      const res = await fetch('/api/admin/cache-warm?action=start', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to start');
        return;
      }
      setWarm(data);
      if (data.total === 0) {
        toast.error('No media URLs found in catalog');
        return;
      }
      toast.success(`Warming ${data.total} URLs…`);
      runWarmLoop();
    } catch {
      toast.error('Network error — could not start');
    } finally {
      setStarting(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const res = await fetch('/api/admin/cache-warm?action=verify-start', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Verify failed to start');
        return;
      }
      setVerify(data);
      await runVerifyLoop();
    } catch {
      toast.error('Network error — could not verify');
    } finally {
      setVerifying(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await fetch('/api/admin/cache-warm?action=reset');
      setWarm(EMPTY_WARM);
      setVerify(EMPTY_VERIFY);
      toast.success('Status reset');
    } catch {
      toast.error('Failed to reset');
    } finally {
      setResetting(false);
    }
  };

  // Resume an interrupted run (e.g. tab was closed mid-warm) if status says running
  const handleResume = () => {
    toast.info('Resuming warm run…');
    runWarmLoop();
  };

  const pct = warm.total > 0 ? Math.round((warm.offset / warm.total) * 100) : 0;
  const isRunning = warm.state === 'running';
  const isDone = warm.state === 'done';
  const isError = warm.state === 'error';
  const isVerifyRunning = verify.state === 'running';

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange-500" />
          Cloudflare Cache Warm
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Pehli request pe Cloudflare ke paas image nahi hoti — yeh button ek baar click karo
          aur saari product images / videos cache ho jayengi.
        </p>
      </div>

      <div className="rounded-lg border bg-amber-50 border-amber-200 p-3 text-xs text-amber-800">
        ⚠️ Yeh panel khula rakhna zaroori hai jab tak warming chal rahi ho — tab band karne se
        run pause ho jaata hai (progress save rehta hai, dobara button dabao toh wahin se resume
        ho jaayega).
      </div>

      {/* Resume banner if a run was left running (e.g. after reload) */}
      {isRunning && !starting && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 flex items-center justify-between text-sm">
          <span className="text-blue-800">Ek run pehle se chal rahi thi (ya pause thi) — resume karo?</span>
          <Button size="sm" onClick={handleResume} className="gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> Resume
          </Button>
        </div>
      )}

      {/* Warm status card */}
      {warm.state !== 'idle' && (
        <div className={`rounded-lg border p-5 space-y-4 ${
          isDone ? 'border-green-200 bg-green-50' :
          isError ? 'border-red-200 bg-red-50' :
          'border-blue-200 bg-blue-50'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-medium text-sm">
              {isRunning && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
              {isDone && <CheckCircle2 className="w-4 h-4 text-green-600" />}
              {isError && <XCircle className="w-4 h-4 text-red-600" />}
              <span className={isDone ? 'text-green-700' : isError ? 'text-red-700' : 'text-blue-700'}>
                {isRunning ? 'Warming…' : isDone ? 'Completed' : 'Error'}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {warm.started_at ? `Started: ${formatTime(warm.started_at)}` : ''}
              {warm.started_at ? ` · ${formatDuration(warm.started_at, warm.finished_at)}` : ''}
            </span>
          </div>

          {warm.total > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{warm.offset} / {warm.total} processed</span>
                <span className="text-muted-foreground">{pct}%</span>
              </div>
              <div className="h-3 bg-white/60 rounded-full overflow-hidden border">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isDone ? 'bg-green-500' : isError ? 'bg-red-400' : 'bg-blue-500'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {warm.failed > 0 && (
                <p className="text-xs text-red-600">{warm.failed} requests failed (timeout / 404)</p>
              )}
            </div>
          )}

          {warm.total > 0 && (
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-md bg-white/70 p-3 border">
                <p className="text-2xl font-bold text-gray-800">{warm.total}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Total URLs</p>
              </div>
              <div className="rounded-md bg-white/70 p-3 border">
                <p className="text-2xl font-bold text-green-700">{warm.cached}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Request OK</p>
              </div>
              <div className="rounded-md bg-white/70 p-3 border">
                <p className={`text-2xl font-bold ${warm.failed > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {warm.failed}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Failed</p>
              </div>
            </div>
          )}

          {warm.total > 0 && (warm.cf_hit + warm.cf_miss + warm.cf_other + warm.cf_unknown > 0) && (
            <div className="pt-1 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-2 mt-2">
                CF-Cache-Status (first pass — run &quot;Verify&quot; below after this finishes for the true picture):
              </p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-md bg-white/70 p-2 border">
                  <p className="text-lg font-bold text-green-700">{warm.cf_hit}</p>
                  <p className="text-[10px] text-muted-foreground">HIT</p>
                </div>
                <div className="rounded-md bg-white/70 p-2 border">
                  <p className="text-lg font-bold text-amber-600">{warm.cf_miss}</p>
                  <p className="text-[10px] text-muted-foreground">MISS</p>
                </div>
                <div className="rounded-md bg-white/70 p-2 border">
                  <p className="text-lg font-bold text-red-600">{warm.cf_other}</p>
                  <p className="text-[10px] text-muted-foreground">BYPASS/DYNAMIC</p>
                </div>
                <div className="rounded-md bg-white/70 p-2 border">
                  <p className="text-lg font-bold text-gray-500">{warm.cf_unknown}</p>
                  <p className="text-[10px] text-muted-foreground">No Header</p>
                </div>
              </div>
              {warm.cf_unknown === warm.total && (
                <p className="text-xs text-red-600 mt-2">
                  ⚠️ Koi bhi request pe CF-Cache-Status header nahi mila — Cloudflare proxy
                  (orange cloud) is domain ke liye off ho sakta hai. DNS record check karo.
                </p>
              )}
            </div>
          )}

          {isError && warm.error && (
            <p className="text-sm text-red-700 bg-red-100 rounded p-2 font-mono">{warm.error}</p>
          )}

          {/* Failed URLs — exact reason each one didn't succeed */}
          {warm.failed_urls.length > 0 && (
            <div className="pt-1 border-t">
              <p className="text-xs font-medium text-red-700 mb-2 mt-2">
                {warm.failed} Failed URLs {warm.failed_urls.length < warm.failed ? `(showing first ${warm.failed_urls.length})` : ''}:
              </p>
              <ul className="space-y-1 font-mono text-[11px] text-red-800 bg-red-100/60 rounded p-2 max-h-48 overflow-y-auto">
                {warm.failed_urls.map((u) => (
                  <li key={u} className="break-all">{u}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Verify section */}
      {isDone && (
        <div className="rounded-lg border p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-medium text-sm flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                Verify Cache (real check)
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Warming ka pehla pass khud MISS dikha sakta hai (usi request ne cache banaya).
                Yeh dobara request karke confirm karta hai — ab HIT hai toh pakka cached hai.
              </p>
            </div>
            <Button onClick={handleVerify} disabled={verifying || isVerifyRunning} variant="outline" size="sm" className="gap-2 shrink-0">
              {verifying || isVerifyRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Verify Now
            </Button>
          </div>

          {verify.state !== 'idle' && verify.total > 0 && (
            <div className="space-y-3">
              {isVerifyRunning && (
                <p className="text-xs text-muted-foreground">{verify.offset} / {verify.total} checked…</p>
              )}
              {verify.state === 'done' && (() => {
                const rate = Math.round((verify.cf_hit / verify.total) * 100);
                return (
                  <div className="flex items-center gap-3">
                    <div className="h-3 flex-1 bg-gray-100 rounded-full overflow-hidden border">
                      <div
                        className={`h-full rounded-full ${rate >= 90 ? 'bg-green-500' : rate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold whitespace-nowrap">{rate}% actually cached</span>
                  </div>
                );
              })()}

              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-md bg-green-50 p-2 border border-green-200">
                  <p className="text-lg font-bold text-green-700">{verify.cf_hit}</p>
                  <p className="text-[10px] text-muted-foreground">HIT</p>
                </div>
                <div className="rounded-md bg-amber-50 p-2 border border-amber-200">
                  <p className="text-lg font-bold text-amber-600">{verify.cf_miss}</p>
                  <p className="text-[10px] text-muted-foreground">MISS</p>
                </div>
                <div className="rounded-md bg-red-50 p-2 border border-red-200">
                  <p className="text-lg font-bold text-red-600">{verify.cf_other}</p>
                  <p className="text-[10px] text-muted-foreground">BYPASS/DYNAMIC</p>
                </div>
                <div className="rounded-md bg-gray-50 p-2 border">
                  <p className="text-lg font-bold text-gray-500">{verify.cf_unknown}</p>
                  <p className="text-[10px] text-muted-foreground">No Header</p>
                </div>
              </div>

              {verify.state === 'done' && verify.sample_non_hit_urls.length > 0 && (
                <div className="text-xs">
                  <p className="font-medium text-muted-foreground mb-1">Jo cache nahi huin (sample):</p>
                  <ul className="space-y-0.5 font-mono text-[11px] text-muted-foreground max-h-32 overflow-y-auto">
                    {verify.sample_non_hit_urls.map((u) => (
                      <li key={u} className="truncate">{u}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button onClick={handleStart} disabled={isRunning || starting} className="gap-2">
          {starting || isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flame className="w-4 h-4" />}
          {isRunning ? 'Warming…' : isDone ? 'Warm Again' : 'Warm Cache Now'}
        </Button>

        {warm.state !== 'idle' && (
          <Button variant="outline" onClick={handleReset} disabled={resetting || isRunning} className="gap-2">
            {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Reset
          </Button>
        )}

        <Button variant="ghost" onClick={fetchStatus} disabled={isRunning} className="gap-2 ml-auto">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Tips */}
      <div className="text-xs text-muted-foreground space-y-1 border-t pt-4">
        <p>• Panel khula rakho jab tak "Completed" na dikhe — yeh tumhare browser se driven hai</p>
        <p>• Naye products add karne ke baad dobara "Warm Cache Now" click karo</p>
        <p>• Cloudflare cache purge karne ke baad bhi dobara warm karna padega</p>
        <p>• Har batch mein 8 URLs, 250ms gap — Supabase/R2/Vercel par load minimal</p>
      </div>
    </div>
  );
}
