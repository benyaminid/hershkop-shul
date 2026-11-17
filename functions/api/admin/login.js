
import { json, sameOrigin, createSession, sessionCookie } from "../../_lib/admin-auth.js";

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!sameOrigin(request)) return json({ error: "Request rejected" }, 403);
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) {
    return json({ error: "מערכת הניהול עדיין לא הוגדרה" }, 503);
  }

  try {
    const body = await request.json();
    const password = typeof body?.password === "string" ? body.password : "";
    if (!password || password.length > 256 || password !== env.ADMIN_PASSWORD) {
      return json({ error: "סיסמה שגויה" }, 401);
    }
    const session = await createSession(env.ADMIN_SESSION_SECRET);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Set-Cookie": sessionCookie(session.value, session.exp - Math.floor(Date.now() / 1000)),
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return json({ error: "בקשה לא תקינה" }, 400);
  }
}
