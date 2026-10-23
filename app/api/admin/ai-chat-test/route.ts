import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyAdminToken, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';
import { fetchAiChatSettingsServer } from '@/lib/settings-api';

// Admin > Settings > AI Chat Assistant > "Test AI connection" hits this
// route so the admin can see the REAL upstream error (bad/missing key,
// model not enabled on the account, rate limit, network block, etc.)
// instead of the deliberately-generic message the storefront widget
// shows shoppers. Tests both the configured primary and fallback model.

const NIM_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const TEST_TIMEOUT_MS = 15000;

async function testModel(apiKey: string, model: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const res = await fetch(NIM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        temperature: 0,
        max_tokens: 10,
      }),
      signal: controller.signal,
    });

    const ms = Date.now() - startedAt;
    const rawText = await res.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // non-JSON body — keep rawText as-is for the admin to read
    }

    if (!res.ok) {
      return {
        model,
        ok: false,
        httpStatus: res.status,
        ms,
        errorDetail: parsed?.error?.message || parsed?.detail || rawText.slice(0, 500) || `HTTP ${res.status}`,
      };
    }

    const reply = parsed?.choices?.[0]?.message?.content?.trim();
    return { model, ok: true, httpStatus: res.status, ms, reply: reply || '(empty reply body)' };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError';
    return {
      model,
      ok: false,
      httpStatus: timedOut ? 504 : 0,
      ms: Date.now() - startedAt,
      errorDetail: timedOut
        ? `Timed out after ${TEST_TIMEOUT_MS}ms — either NVIDIA is slow right now, or outbound network to integrate.api.nvidia.com is blocked from this deployment.`
        : `Network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST() {
  const cookie = cookies().get(ADMIN_SESSION_COOKIE)?.value ?? null;
  const verified = await verifyAdminToken(cookie);
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      keyPresent: false,
      results: [],
      summary: 'NVIDIA_API_KEY is not set in this deployment\'s environment variables. Add it (Vercel/Netlify → Project → Environment Variables) and redeploy.',
    });
  }

  const settings = await fetchAiChatSettingsServer();
  const models = Array.from(new Set([settings.primary_model, settings.fallback_model].filter(Boolean)));

  const results = await Promise.all(models.map((m) => testModel(apiKey, m)));

  return NextResponse.json({
    keyPresent: true,
    keyPreview: `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`,
    aiChatEnabled: settings.enabled,
    results,
  });
}
