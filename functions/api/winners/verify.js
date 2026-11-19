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
    return json({ error: "אימות הזכייה הושהה זמנית כדי למנוע אישור שגוי. לא ניתן כרגע לרשום זוכה עד להטמעת בדיקת כרטיס אמינה." }, 503);
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
    const prompt = "You are performing strict physical-document verification, not guessing. Inspect the image itself. Return ONLY one JSON object with exactly six fields: ticket_present (boolean), ticket_boundary_visible (boolean), number (string containing only digits actually printed on the ticket), community_emblem (boolean), participation_text (boolean), whole_ticket_visible (boolean). The expected winning number is " + number + ". CRITICAL: If the image shows no physical lottery ticket, a blank camera view, a room, a hand, a table, unrelated objects, or an image where you cannot clearly distinguish the actual ticket as a separate printed object, set ticket_present=false and ALL other booleans=false and number=\"\". Never infer that a ticket exists from the expected number or from this prompt. The entire ticket must be visibly present with its outer edges/boundary distinguishable from the background; otherwise ticket_boundary_visible=false and whole_ticket_visible=false. The ticket layout has a round black community emblem at the top, the printed number in the center, and the exact Hebrew phrase השתתפתי באבות ובנים below the number. Read the digits from the image itself; never copy the expected number. If any digit is unclear, return an empty number string. Set each visual field true only when that feature is directly visible and legible in this image. If uncertain about ANY field, use false.";
    const result = await env.AI.run("@cf/meta/llama-3.2-11b-vision-instruct", { image, prompt, max_tokens: 180, temperature: 0 });
    const raw = typeof result?.response === "string" ? result.response : JSON.stringify(result?.response ?? result);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return json({ error: "לא הצלחנו לקרוא את הכרטיס. נסה צילום חד וברור יותר." }, 422);
    let check;
    try { check = JSON.parse(match[0]); } catch { return json({ error: "לא הצלחנו לקרוא את הכרטיס. נסה שוב." }, 422); }
    const normalize = (value) => String(value ?? "").replace(/\D/g, "").replace(/^0{1,2}(?=\d)/, "");
    const readNumber = normalize(check.number);
    const validNumber = /^[0-9]{1,10}$/.test(readNumber) && readNumber === normalize(number);
    const valid = validNumber && check.ticket_present === true && check.ticket_boundary_visible === true && check.community_emblem === true && check.participation_text === true && check.whole_ticket_visible === true;
    if (!valid) return json({ error: "לא זוהה כרטיס הגרלה ברור ומלא. יש להציג את הכרטיס עצמו, כולל גבולותיו, הסמל, המספר והכיתוב, ולנסות שוב." }, 422);
    return json({ success: true, token: await signToken(number, env.WINNER_VERIFY_SECRET) });
  } catch (error) {
    console.error("Ticket verification failed:", error?.message || "UnknownError");
    return json({ error: "שירות אימות הכרטיס אינו זמין כרגע. נסה שוב מאוחר יותר." }, 503);
  }
}