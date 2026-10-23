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

    const [summaryRes, countryRes, regionRes, hourRes, dailyRes] = await Promise.all([
      // Overall summary — last 30 days
      client.runReport({
        property,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        metrics: [
          { name: 'totalUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'averageSessionDuration' },
          { name: 'bounceRate' },
          { name: 'newUsers' },
        ],
      }),

      // Top countries
      client.runReport({
        property,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        metrics: [{ name: 'totalUsers' }, { name: 'sessions' }],
        dimensions: [{ name: 'country' }],
        orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
        limit: 12,
      }),

      // India regions / states
      client.runReport({
        property,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        metrics: [{ name: 'totalUsers' }, { name: 'sessions' }],
        dimensions: [{ name: 'region' }],
        dimensionFilter: {
          filter: {
            fieldName: 'country',
            stringFilter: { value: 'India', matchType: 'EXACT' },
          },
        },
        orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
        limit: 15,
      }),

      // Traffic by hour of day (IST: UTC+5:30)
      client.runReport({
        property,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        metrics: [{ name: 'totalUsers' }, { name: 'sessions' }],
        dimensions: [{ name: 'hour' }],
        orderBys: [{ dimension: { dimensionName: 'hour' } }],
      }),

      // Daily trend — last 30 days
      client.runReport({
        property,
        dateRanges: [{ startDate: '29daysAgo', endDate: 'today' }],
        metrics: [{ name: 'totalUsers' }, { name: 'sessions' }],
        dimensions: [{ name: 'date' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
    ]);

    // Parse summary
    const sr = summaryRes[0]?.rows?.[0];
    const summary = {
      totalUsers: Number(sr?.metricValues?.[0]?.value ?? 0),
      sessions: Number(sr?.metricValues?.[1]?.value ?? 0),
      pageViews: Number(sr?.metricValues?.[2]?.value ?? 0),
      avgSessionDuration: Math.round(Number(sr?.metricValues?.[3]?.value ?? 0)),
      bounceRate: Number(Number(sr?.metricValues?.[4]?.value ?? 0).toFixed(1)),
      newUsers: Number(sr?.metricValues?.[5]?.value ?? 0),
    };

    const byCountry = (countryRes[0]?.rows ?? []).map((row) => ({
      country: row.dimensionValues?.[0]?.value ?? 'Unknown',
      users: Number(row.metricValues?.[0]?.value ?? 0),
      sessions: Number(row.metricValues?.[1]?.value ?? 0),
    }));

    const byRegion = (regionRes[0]?.rows ?? []).map((row) => ({
      region: row.dimensionValues?.[0]?.value ?? 'Unknown',
      users: Number(row.metricValues?.[0]?.value ?? 0),
      sessions: Number(row.metricValues?.[1]?.value ?? 0),
    }));

    // Shift hour from UTC to IST (+5:30 = +5 hours for display)
    const byHour = (hourRes[0]?.rows ?? []).map((row) => {
      const utcHour = Number(row.dimensionValues?.[0]?.value ?? 0);
      const istHour = (utcHour + 5) % 24; // approximate IST
      return {
        hour: istHour,
        label: `${String(istHour).padStart(2, '0')}:00`,
        users: Number(row.metricValues?.[0]?.value ?? 0),
        sessions: Number(row.metricValues?.[1]?.value ?? 0),
      };
    }).sort((a, b) => a.hour - b.hour);

    const dailyTrend = (dailyRes[0]?.rows ?? []).map((row) => {
      const d = row.dimensionValues?.[0]?.value ?? '';
      return {
        date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
        users: Number(row.metricValues?.[0]?.value ?? 0),
        sessions: Number(row.metricValues?.[1]?.value ?? 0),
      };
    });

    return NextResponse.json({ summary, byCountry, byRegion, byHour, dailyTrend });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load traffic data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
