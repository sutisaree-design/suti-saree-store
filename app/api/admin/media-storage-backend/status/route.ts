import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-fulfillment-shared';
import { r2EnvPresent } from '@/lib/storage';

// GET /api/admin/media-storage-backend/status
// Returns whether R2 env vars are configured, so the admin UI can
// enable/disable the R2 backend toggle without exposing secrets.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ r2_configured: r2EnvPresent() });
}
