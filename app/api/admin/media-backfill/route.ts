import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-fulfillment-shared';
import { r2EnvPresent } from '@/lib/storage';
import { fetchBackfillProgress, resetBackfillProgress, runBackfillBatch, startBackfill } from '@/lib/media-backfill';

// ---------------------------------------------------------------------
// GET  /api/admin/media-backfill        -> current progress (for polling)
// POST /api/admin/media-backfill        -> { action: 'start' | 'run-batch' | 'reset' }
//
// This backfill mirrors pre-existing Supabase-only files into R2. It is:
//   - Read-only on Supabase (never modifies/deletes any original file)
//   - Idempotent (safe to start/reset/re-run — already-mirrored files
//     are HEAD-checked in R2 and skipped)
//   - Additive only — no DB row or URL is ever changed by this route
// ---------------------------------------------------------------------

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const progress = await fetchBackfillProgress();
  return NextResponse.json({ progress, r2Configured: r2EnvPresent() });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.action === 'start') {
    if (!r2EnvPresent()) {
      return NextResponse.json(
        { error: 'R2 environment variables are not configured — cannot start backfill.' },
        { status: 400 }
      );
    }
    try {
      const progress = await startBackfill();
      return NextResponse.json({ progress });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to start backfill' },
        { status: 500 }
      );
    }
  }

  if (body.action === 'run-batch') {
    try {
      const progress = await runBackfillBatch();
      return NextResponse.json({ progress });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to run backfill batch' },
        { status: 500 }
      );
    }
  }

  if (body.action === 'reset') {
    const progress = await resetBackfillProgress();
    return NextResponse.json({ progress });
  }

  return NextResponse.json({ error: 'action must be "start", "run-batch", or "reset"' }, { status: 400 });
}
