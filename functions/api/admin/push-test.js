import { json, sameOrigin, isAdmin } from "../../_lib/admin-auth.js";
import { validEndpoint, vapidHeader } from "../../_lib/push.js";

// Admin-only: sends a single test push to ONE given device endpoint (the admin's own). It does not touch subscribers or real queues.
export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!(await isAdmin(request, env))) return json({ error: "נדרשת התחברות" }, 401);
  if (!sameOrigin(request)) return json({ error: "Request rejected" }, 403);
  if (!env.PRODUCT_IMAGES) return json({ error: "האחסון עדיין לא חובר ב-Cloudflare" }, 503);
  try {
    const text = await request.text();
    if (text.length > 2000) return json({ error: "Request too large" }, 413);
    const body = JSON.parse(text);
    if (!validEndpoint(body?.endpoint)) return json({ error: "מנוי לא תקין" }, 400);
    const response = await fetch(body.endpoint, {
      method: "POST",
      headers: { Authorization: await vapidHeader(env, body.endpoint), TTL: "300", Urgency: "high" }
    });
    return json({ success: response.status >= 200 && response.status < 300, status: response.status });
  } catch (error) {
    console.error("Push test failed:", error?.message || "UnknownError");
    return json({ error: "בדיקת ההתראה נכשלה" }, 502);
  }
}
