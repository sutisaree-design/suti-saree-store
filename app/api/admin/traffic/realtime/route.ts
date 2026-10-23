import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { BetaAnalyticsDataClient } from '@google-analytics/data';

function getGa4Client() {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) throw new Error('GA4_PROPERTY_ID environment variable is not set');

  let credentials: object | undefined;
  if (process.env.GA4_SERVICE_ACCOUNT_JSON) {
    try {
      credentials = JSON.parse(process.env.GA4_SERVICE_ACCOUNT_JSON);
    } catch {
      throw new Error('GA4_SERVICE_ACCOUNT_JSON is not valid JSON');
    }
  }

  const client = new BetaAnalyticsDataClient(credentials ? { credentials } : {});
  return { client, propertyId };
}

export async function GET() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { client, propertyId } = getGa4Client();
    const property = `properties/${propertyId}`;

    const [pageRes, countryRes] = await Promise.all([
      // Active users by page path
      client.runRealtimeReport({
        property,
        metrics: [{ name: 'activeUsers' }],
        dimensions: [{ name: 'unifiedPagePathScreen' }],
        orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
        limit: 15,
      }),

      // Active users by country
      client.runRealtimeReport({
        property,
        metrics: [{ name: 'activeUsers' }],
        dimensions: [{ name: 'country' }],
        orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
        limit: 8,
      }),
    ]);

    const byPage = (pageRes[0]?.rows ?? []).map((row) => ({
      page: row.dimensionValues?.[0]?.value ?? '/',
      activeUsers: Number(row.metricValues?.[0]?.value ?? 0),
    }));

    const byCountry = (countryRes[0]?.rows ?? []).map((row) => ({
      country: row.dimensionValues?.[0]?.value ?? 'Unknown',
      activeUsers: Number(row.metricValues?.[0]?.value ?? 0),
    }));

    const totalActive = byPage.reduce((sum, p) => sum + p.activeUsers, 0);

    return NextResponse.json({ totalActive, byPage, byCountry });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load realtime data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
