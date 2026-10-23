import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-fulfillment-shared';
import {
  fetchBlurBackfillProgress,
  resetBlurBackfillProgress,
  runBlurBackfillBatch,
  startBlurBackfill,
} from '@/lib/blur-preview-backfill';

// ---------------------------------------------------------------------
// GET  /api/admin/blur-preview-backfill  -> current progress (polling)
// POST /api/admin/blur-preview-backfill  -> { action: 'start' | 'run-batch' | 'reset' }
//
// Generates real per-image blur previews for pre-existing product/
// variant images. Only ever adds rows to the independent
// `image_blur_previews` table — never touches products.images /
// product_variants.images. Idempotent and safe to re-run any time. See
// lib/blur-preview-backfill.ts for the full safety notes.
// ---------------------------------------------------------------------

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const progress = await fetchBlurBackfillProgress();
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
      const progress = await startBlurBackfill();
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
      const progress = await runBlurBackfillBatch();
      return NextResponse.json({ progress });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to run backfill batch' },
        { status: 500 }
      );
    }
  }

  if (body.action === 'reset') {
    const progress = await resetBlurBackfillProgress();
    return NextResponse.json({ progress });
  }

  return NextResponse.json({ error: 'action must be "start", "run-batch", or "reset"' }, { status: 400 });
}
