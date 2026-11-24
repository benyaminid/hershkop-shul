import { json } from "../../_lib/admin-auth.js";
import { validEndpoint, takeOutbox } from "../../_lib/push.js";

// Called by the service worker right after a wake-up push; returns and clears the waiting messages.
export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!env.PRODUCT_IMAGES) return json({ messages: [] });
  try {
    const text = await request.text();
    if (text.length > 2000) return json({ messages: [] });
    const body = JSON.parse(text);
    if (!validEndpoint(body?.endpoint)) return json({ messages: [] });
    return json({ messages: await takeOutbox(env, body.endpoint) });
  } catch (error) {
    console.error("Push inbox failed:", error?.message || "UnknownError");
    return json({ messages: [] });
  }
}
