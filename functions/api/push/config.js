import { json } from "../../_lib/admin-auth.js";
import { getPublicKey } from "../../_lib/push.js";

export async function onRequest({ request, env }) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!env.PRODUCT_IMAGES) return json({ error: "האחסון עדיין לא חובר ב-Cloudflare" }, 503);
  try {
    return json({ publicKey: await getPublicKey(env) });
  } catch (error) {
    console.error("Push config failed:", error?.message || "UnknownError");
    return json({ error: "ההתראות אינן זמינות כרגע" }, 503);
  }
}
