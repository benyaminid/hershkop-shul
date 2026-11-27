import { json, sameOrigin, isAdmin } from "../../_lib/admin-auth.js";
const KEY = "site-content.json";
const MAX_SIZE = 500000;
export async function onRequest({ request, env }) {
  if (request.method === "GET") {
    if (!env.PRODUCT_IMAGES) return json({ site: null });
    try { const object = await env.PRODUCT_IMAGES.get(KEY); return object ? json({ site: JSON.parse(await object.text()) }) : json({ site: null }); }
    catch (error) { console.error("Site content read failed:", error?.message || "UnknownError"); return json({ error: "לא ניתן לטעון את הנהלים" }, 502); }
  }
  if (request.method !== "PUT") return json({ error: "Method not allowed" }, 405);
  if (!(await isAdmin(request, env))) return json({ error: "נדרשת התחברות" }, 401);
  if (!sameOrigin(request)) return json({ error: "Request rejected" }, 403);
  if (!env.PRODUCT_IMAGES) return json({ error: "אחסון התוכן עדיין לא חובר ב-Cloudflare" }, 503);
  try {
    const body = await request.json(),site = body?.site,news = site?.pages?.news,fathers = site?.pages?.fathers;
    if (!site || typeof site !== "object" || Array.isArray(site) || !news || typeof news.t !== "string" || !news.t.trim() || news.t.length > 120 ||
      typeof news.b !== "string" || news.b.length > 30000 || !Array.isArray(news.ruleTitles) || news.ruleTitles.length !== 3 ||
      !news.ruleTitles.every(x => typeof x === "string" && x.trim() && x.length <= 120) || !Array.isArray(news.ruleBodies) || news.ruleBodies.length !== 2 || !news.ruleBodies.every(x => typeof x === "string" && x.length <= 30000) || !fathers || typeof fathers.b !== "string" || fathers.b.length > 30000)
      return json({ error: "נתוני הנהלים אינם תקינים" }, 400);
    const serialized = JSON.stringify(site);
    if (serialized.length > MAX_SIZE) return json({ error: "הנתונים גדולים מדי" }, 413);
    await env.PRODUCT_IMAGES.put(KEY, serialized, { httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" } });
    return json({ success: true, site });
  } catch (error) { console.error("Site content save failed:", error?.message || "UnknownError"); return json({ error: "שמירת הנהלים נכשלה" }, 502); }
}
