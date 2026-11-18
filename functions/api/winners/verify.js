const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" }
});
async function getAllowedNumbers(request) {
  const response = await fetch(new URL("/site.json", request.url), { cache: "no-store" });
  if (!response.ok) throw new Error("LotteryConfigUnavailable");
  const site = await response.json();
  const values = site?.winners?.nums;
  if (!Array.isArray(values) || values.length !== 5) throw new Error("LotteryConfigInvalid");
  const numbers = values.map(String);
  if (numbers.some((n) => !/^[0-9]{1,10}$/.test(n)) || new Set(numbers).size !== 5) throw new Error("LotteryConfigInvalid");
  return new Set(numbers);
}
function b64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function signToken(number, secret) {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ number, exp: Date.now() + 5 * 60 * 1000 })));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return payload + "." + b64url(new Uint8Array(signature));
}
export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    if (!env.AI || !env.WINNER_VERIFY_SECRET) return json({ error: "שירות אימות הכרטיס עדיין לא הופעל. יש להגדיר Cloudflare Workers AI ואת WINNER_VERIFY_SECRET." }, 503);
    const body = await request.json();
    const number = String(body?.number ?? "");
    const allowed = await getAllowedNumbers(request);
    if (!allowed.has(number)) return json({ error: "מספר הכרטיס אינו בין המספרים הזוכים" }, 400);
    const image = body?.image;
    if (typeof image !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > 4_000_000) return json({ error: "צילום הכרטיס אינו תקין או גדול מדי" }, 400);
    const base64 = image.substring(image.indexOf(",") + 1);
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    if (bytes.length < 1000 || bytes.length > 2_800_000) return json({ error: "יש לצלם כרטיס ברור ובגודל קטן יותר" }, 400);
    const prompt = "Inspect this single photographed lottery ticket. Return only JSON with boolean fields: community_emblem, exact_number, participation_text, whole_ticket_visible, genuine_layout. The ticket layout has a round black community emblem at the top, a ticket number in the center, and the Hebrew phrase השתתפתי באבות ובנים below it. The number must be visibly printed and match exactly " + number + ". Do not infer unreadable characters. Set community_emblem true only if the round black emblem is clearly present at the top. Set participation_text true only if the Hebrew phrase is visible and legible. Set genuine_layout true only if all three elements appear in this arrangement. If uncertain, use false.";
    const result = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", { image, prompt, max_tokens: 180 });
    const raw = typeof result?.response === "string" ? result.response : JSON.stringify(result?.response ?? result);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return json({ error: "לא הצלחנו לקרוא את הכרטיס. נסה צילום חד וברור יותר." }, 422);
    let check;
    try { check = JSON.parse(match[0]); } catch { return json({ error: "לא הצלחנו לקרוא את הכרטיס. נסה שוב." }, 422); }
    const valid = check.community_emblem === true && check.exact_number === true && check.participation_text === true && check.whole_ticket_visible === true && check.genuine_layout === true;
    if (!valid) return json({ error: "הכרטיס לא אומת. ודא שסמל הקהילה, המספר הזוכה והכיתוב מופיעים בבירור ונסה שוב." }, 422);
    return json({ success: true, token: await signToken(number, env.WINNER_VERIFY_SECRET) });
  } catch (error) {
    console.error("Ticket verification failed:", error?.message || "UnknownError");
    return json({ error: "שירות אימות הכרטיס אינו זמין כרגע. נסה שוב מאוחר יותר." }, 503);
  }
}