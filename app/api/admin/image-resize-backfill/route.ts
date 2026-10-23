import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-fulfillment-shared';
import {
  fetchResizeBackfillProgress,
  resetResizeBackfillProgress,
  runResizeBackfillBatch,
  startResizeBackfill,
} from '@/lib/image-resize-backfill';

// ---------------------------------------------------------------------
// GET  /api/admin/image-resize-backfill  -> current progress (polling)
// POST /api/admin/image-resize-backfill  -> { action: 'start' | 'run-batch' | 'reset' }
//
// Generates -sm/-md responsive variants for pre-existing product/review
// images. Read-only on the original files (only ever adds new variant
// files alongside them), idempotent, and safe to re-run any time. See
// lib/image-resize-backfill.ts for the full safety notes.
// ---------------------------------------------------------------------

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const progress = await fetchResizeBackfillProgress();
  return NextResponse.json({ progress });
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
    try {
      const progress = await startResizeBackfill();
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
      const progress = await runResizeBackfillBatch();
      return NextResponse.json({ progress });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to run backfill batch' },
        { status: 500 }
      );
    }
  }

  if (body.action === 'reset') {
    const progress = await resetResizeBackfillProgress();
    return NextResponse.json({ progress });
  }

  return NextResponse.json({ error: 'action must be "start", "run-batch", or "reset"' }, { status: 400 });
}
