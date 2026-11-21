import { json, sameOrigin, isAdmin } from "../_lib/admin-auth.js";

const KEY = "weekly-bulletin.json";
const MAX_PAGES = 250;
const PAGE_URL = /^\/api\/images\/[a-f0-9-]{36}\.jpg$/i;

export async function onRequest({ request, env }) {
  if (request.method === "GET") {
    if (!env.PRODUCT_IMAGES) return json({ bulletin: null });
    try {
      const object = await env.PRODUCT_IMAGES.get(KEY);
      if (!object) return json({ bulletin: null });
      const bulletin = JSON.parse(await object.text());
      return json({ bulletin });
    } catch (error) {
      console.error("Bulletin read failed:", error?.message || "UnknownError");
      return json({ error: "לא ניתן לטעון את העלון" }, 502);
    }
  }

  if (request.method !== "PUT") return json({ error: "Method not allowed" }, 405);
  if (!(await isAdmin(request, env))) return json({ error: "נדרשת התחברות" }, 401);
  if (!sameOrigin(request)) return json({ error: "Request rejected" }, 403);
  if (!env.PRODUCT_IMAGES) return json({ error: "אחסון העלון עדיין לא חובר ב-Cloudflare" }, 503);

  try {
    const body = await request.json();
    const parsha = typeof body?.parsha === "string" ? body.parsha.trim().replace(/^פרשת\s*/u, "") : "";
    const pages = body?.pages;
    const sourceName = typeof body?.sourceName === "string" ? body.sourceName.trim().slice(0, 255) : "";
    if (!parsha || parsha.length > 80 || !/^[\u0590-\u05FF\s׳״'"-]+$/u.test(parsha)) {
      return json({ error: "שם הפרשה אינו תקין" }, 400);
    }
    if (!Array.isArray(pages) || pages.length < 1 || pages.length > MAX_PAGES || !pages.every(url => typeof url === "string" && PAGE_URL.test(url))) {
      return json({ error: "רשימת עמודי העלון אינה תקינה" }, 400);
    }
    const bulletin = { parsha, pages, sourceName, updatedAt: new Date().toISOString() };
    await env.PRODUCT_IMAGES.put(KEY, JSON.stringify(bulletin), {
      httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" }
    });
    return json({ success: true, bulletin });
  } catch (error) {
    console.error("Bulletin save failed:", error?.message || "UnknownError");
    return json({ error: "שמירת העלון נכשלה" }, 502);
  }
}
