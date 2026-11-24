import { json } from "../../_lib/admin-auth.js";
import { flushDue } from "../../_lib/push.js";

// Triggered every ~15 minutes by .github/workflows/push-flush.yml. It only releases messages that are already due.
export async function onRequest({ request, env }) {
  if (request.method !== "GET" && request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!env.PRODUCT_IMAGES) return json({ error: "האחסון עדיין לא חובר ב-Cloudflare" }, 503);
  try {
    return json({ success: true, ...(await flushDue(env)) });
  } catch (error) {
    console.error("Push flush failed:", error?.message || "UnknownError");
    return json({ error: "flush failed" }, 502);
  }
}
