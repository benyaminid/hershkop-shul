import { json, sameOrigin, isAdmin } from "../_lib/admin-auth.js";

const KEY = "weekly-lottery.json";
const WINNER_COUNT = 5;
const MAX_POOL = 10000;

function parseNumbers(raw) {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 2000) throw new Error("InvalidInput");
  const values = new Set();
  const parts = raw.split(",");
  if (parts.some(part => !part.trim())) throw new Error("InvalidInput");
  for (const part of parts) {
    const token = part.trim();
    const range = token.match(/^(\d{1,4})\s*-\s*(\d{1,4})$/);
    if (range) {
      const start = Number(range[1]), end = Number(range[2]);
      if (start > end || end - start > 9999) throw new Error("InvalidRange");
      for (let n = start; n <= end; n++) values.add(n);
    } else if (/^\d{1,4}$/.test(token)) {
      values.add(Number(token));
    } else {
      throw new Error("InvalidInput");
    }
    if (values.size > MAX_POOL) throw new Error("PoolTooLarge");
  }
  if (values.size < WINNER_COUNT) throw new Error("NotEnoughNumbers");
  return Array.from(values);
}

// Uniform integer sampling using Web Crypto and rejection sampling.
function secureRandomInt(max) {
  const range = 0x100000000;
  const limit = Math.floor(range / max) * max;
  const value = new Uint32Array(1);
  do { crypto.getRandomValues(value); } while (value[0] >= limit);
  return value[0] % max;
}

function drawUnique(pool, count) {
  const values = pool.slice();
  for (let i = 0; i < count; i++) {
    const j = i + secureRandomInt(values.length - i);
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values.slice(0, count);
}

function israelDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const get = type => parts.find(part => part.type === type)?.value || "";
  return get("year") + "-" + get("month") + "-" + get("day");
}

async function readLottery(request, env) {
  if (env.PRODUCT_IMAGES) {
    const object = await env.PRODUCT_IMAGES.get(KEY);
    if (object) return JSON.parse(await object.text());
  }
  const response = await fetch(new URL("/site.json", request.url), { cache: "no-store" });
  if (!response.ok) throw new Error("ConfigUnavailable");
  const site = await response.json();
  const winners = site?.winners;
  if (!winners || !Array.isArray(winners.nums)) return { wk: "", nums: [], history: [] };
  return { wk: winners.wk || "", nums: winners.nums, history: Array.isArray(winners.history) ? winners.history : [] };
}

export async function onRequest({ request, env }) {
  if (request.method === "GET") {
    try { return json({ lottery: await readLottery(request, env) }); }
    catch (error) {
      console.error("Lottery read failed:", error?.message || "UnknownError");
      return json({ error: "לא ניתן לטעון את נתוני ההגרלה" }, 503);
    }
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!(await isAdmin(request, env))) return json({ error: "נדרשת התחברות" }, 401);
  if (!sameOrigin(request)) return json({ error: "Request rejected" }, 403);
  if (!env.PRODUCT_IMAGES) return json({ error: "אחסון ההגרלה עדיין לא חובר ב-Cloudflare" }, 503);

  try {
    const body = await request.json();
    const input = body?.input;
    const parsha = typeof body?.parsha === "string" ? body.parsha.trim().replace(/^פרשת\s*/u, "") : "";
    if (!parsha || parsha.length > 80 || !/^[\u0590-\u05FF\s׳״'"-]+$/u.test(parsha)) return json({ error: "יש להזין שם פרשה תקין" }, 400);
    const wk = "של שבת פרשת " + parsha;
    const pool = parseNumbers(input);
    const nums = drawUnique(pool, WINNER_COUNT);
    const previous = await readLottery(request, env);
    const date = israelDate();
    const parsha = wk.replace(/^של שבת\s*/u, "").replace(/^פרשת\s*/u, "");
    const history = [{ date, parsha, wk, nums, poolSize: pool.length }, ...(Array.isArray(previous.history) ? previous.history : [])];
    const lottery = { wk, parsha, input: input.trim(), nums, date, poolSize: pool.length, history, registrations: {}, drawnAt: new Date().toISOString() };
    await env.PRODUCT_IMAGES.put(KEY, JSON.stringify(lottery), {
      httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" }
    });
    return json({ success: true, lottery });
  } catch (error) {
    const code = error?.message || "";
    const status = code === "NotEnoughNumbers" || code === "InvalidInput" || code === "InvalidRange" || code === "PoolTooLarge" ? 400 : 502;
    const messages = {
      NotEnoughNumbers: "נדרשים לפחות חמישה מספרים שונים.",
      InvalidInput: "פורמט המספרים אינו תקין.",
      InvalidRange: "טווח המספרים אינו תקין.",
      PoolTooLarge: "אפשר להזין עד 10,000 מספרים שונים."
    };
    console.error("Lottery draw failed:", code || "UnknownError");
    return json({ error: messages[code] || "ההגרלה נכשלה ולא נשמרה" }, status);
  }
}
