import { json, sameOrigin } from "../../_lib/admin-auth.js";
import { validEndpoint, cleanPrefs, setSubscription, getPrefs } from "../../_lib/push.js";

// POST { action: "get" | "set" | "remove", endpoint, prefs }
export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!sameOrigin(request)) return json({ error: "Request rejected" }, 403);
  if (!env.PRODUCT_IMAGES) return json({ error: "האחסון עדיין לא חובר ב-Cloudflare" }, 503);
  try {
    const text = await request.text();
    if (text.length > 4000) return json({ error: "Request too large" }, 413);
    const body = JSON.parse(text);
    if (!validEndpoint(body?.endpoint)) return json({ error: "מנוי לא תקין" }, 400);
    if (body.action === "get") return json({ prefs: await getPrefs(env, body.endpoint) });
    if (body.action === "remove") {
      await setSubscription(env, body.endpoint, cleanPrefs(null));
      return json({ success: true });
    }
    await setSubscription(env, body.endpoint, cleanPrefs(body.prefs));
    return json({ success: true });
  } catch (error) {
    const code = error?.message || "";
    console.error("Push subscribe failed:", code || "UnknownError");
    if (code === "TooManySubscribers") return json({ error: "לא ניתן להוסיף עוד מנויים כרגע" }, 503);
    return json({ error: "לא ניתן לשמור את ההגדרות כרגע" }, 502);
  }
}
