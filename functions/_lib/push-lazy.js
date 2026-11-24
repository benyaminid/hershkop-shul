import { flushDue } from "./push.js";

const KEY = "push-meta.json";

// Fallback for the missing scheduler: any site visit may release due daily notifications (at most once per 10 minutes).
export async function maybeFlush(env) {
  try {
    if (!env.PRODUCT_IMAGES) return;
    const object = await env.PRODUCT_IMAGES.get(KEY);
    let last = 0;
    if (object) { try { last = JSON.parse(await object.text()).lastFlush || 0; } catch {} }
    if (Date.now() - last < 10 * 60 * 1000) return;
    await env.PRODUCT_IMAGES.put(KEY, JSON.stringify({ lastFlush: Date.now() }), {
      httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" }
    });
    await flushDue(env);
  } catch (error) {
    console.error("Push lazy flush failed:", error?.message || "UnknownError");
  }
}
