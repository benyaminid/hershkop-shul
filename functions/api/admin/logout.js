
import { json, clearSessionCookie, sameOrigin } from "../../_lib/admin-auth.js";

export async function onRequest({ request }) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!sameOrigin(request)) return json({ error: "Request rejected" }, 403);
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": clearSessionCookie(),
      "X-Content-Type-Options": "nosniff"
    }
  });
}
