import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Background notification hook for Artha.
 *
 * The scheduler calls this endpoint at 11:00 and 15:00 IST.
 * Keep provider credentials server-side in environment variables.
 * The endpoint intentionally fails closed when credentials are absent.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const expected = process.env.CRON_SECRET;
  const authorization = req.headers.authorization;
  if (!expected || authorization !== `Bearer ${expected}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const provider = process.env.PUSH_PROVIDER;
  const pushUrl = process.env.PUSH_API_URL;
  const pushKey = process.env.PUSH_API_KEY;
  const appId = process.env.PUSH_APP_ID;

  if (!provider || !pushUrl || !pushKey || !appId) {
    return res.status(503).json({ error: "Push provider credentials are not configured" });
  }

  // Provider-neutral contract. A concrete provider adapter can be enabled
  // through PUSH_PROVIDER without exposing credentials to the client bundle.
  if (provider !== "generic") {
    return res.status(501).json({ error: `Push provider '${provider}' needs a server adapter` });
  }

  const upstream = await fetch(pushUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pushKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app_id: appId,
      source: "artha-rule-scheduler",
      timezone: "Asia/Kolkata",
      times: ["11:00", "15:00"],
      rule_90_price: Number(process.env.RULE_90_PRICE ?? 20),
      rule_alert_days: Number(process.env.RULE_ALERT_DAYS ?? 3),
    }),
  });

  const text = await upstream.text();
  return res.status(upstream.ok ? 200 : 502).json({ ok: upstream.ok, provider, response: text.slice(0, 1000) });
}
