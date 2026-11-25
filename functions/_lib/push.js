const SUBS_KEY = "push-subscribers.json";
const VAPID_KEY = "push-vapid.json";
const BATCH_KEY = "push-batch.json";
export const CATS = ["lottery", "products", "bulletin", "news"];
const MAX_SUBS = 3000;
const MAX_OUTBOX = 5;
const SITE = "https://hershkop-shul.pages.dev/";
const HOST_OK = ["googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];
const enc = new TextEncoder();
let vapidCache = null;

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function readJson(env, key, fallback) {
  const object = await env.PRODUCT_IMAGES.get(key);
  if (!object) return fallback;
  try { return JSON.parse(await object.text()); } catch { return fallback; }
}

async function writeJson(env, key, value, extra = {}) {
  return env.PRODUCT_IMAGES.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" },
    ...extra
  });
}

export function validEndpoint(endpoint) {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  let url;
  try { url = new URL(endpoint); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  return HOST_OK.some(h => url.hostname === h || url.hostname.endsWith("." + h));
}

export async function hashEndpoint(endpoint) {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(endpoint))));
}

// ---------- Israel time helpers ----------
function ilParts(ms) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(ms));
  const get = type => Number(parts.find(p => p.type === type).value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), mi: get("minute") };
}
function ilOffset(ms) {
  const p = ilParts(ms);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Math.floor(ms / 60000) * 60000;
}
function ilToUtc(y, m, d, h) {
  const guess = Date.UTC(y, m - 1, d, h);
  return guess - ilOffset(guess);
}
export function nextOccurrence(hour, now) {
  const p = ilParts(now);
  let at = ilToUtc(p.y, p.m, p.d, hour);
  if (at <= now) at = ilToUtc(p.y, p.m, p.d + 1, hour);
  return at;
}

// ---------- Shabbat quiet window (Israel): from 40 minutes before Friday sunset until 50 minutes after Saturday sunset ----------
// Sunset is computed (NOAA algorithm) for central Israel, so the window follows the seasons. Cities differ by only a few minutes.
const SHABBAT_LAT = 32.0;
const SHABBAT_LON = 34.85;
const SHABBAT_BEFORE_MIN = 40;
const SHABBAT_AFTER_MIN = 50;
function ilWeekday(ms) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", weekday: "short" }).format(new Date(ms));
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[name];
}
function sunsetUtc(y, m, d) {
  const rad = x => x * Math.PI / 180, deg = x => x * 180 / Math.PI;
  const n = Math.floor(275 * m / 9) - Math.floor((m + 9) / 12) * (1 + Math.floor((y - 4 * Math.floor(y / 4) + 2) / 3)) + d - 30;
  const lngHour = SHABBAT_LON / 15;
  const t = n + ((18 - lngHour) / 24);
  const meanAnomaly = 0.9856 * t - 3.289;
  let longitude = meanAnomaly + 1.916 * Math.sin(rad(meanAnomaly)) + 0.020 * Math.sin(rad(2 * meanAnomaly)) + 282.634;
  longitude = ((longitude % 360) + 360) % 360;
  let ra = deg(Math.atan(0.91764 * Math.tan(rad(longitude))));
  ra = ((ra % 360) + 360) % 360;
  ra = (ra + (Math.floor(longitude / 90) * 90 - Math.floor(ra / 90) * 90)) / 15;
  const sinDec = 0.39782 * Math.sin(rad(longitude));
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(rad(90.833)) - sinDec * Math.sin(rad(SHABBAT_LAT))) / (cosDec * Math.cos(rad(SHABBAT_LAT)));
  const h = deg(Math.acos(Math.max(-1, Math.min(1, cosH)))) / 15;
  let ut = h + ra - 0.06571 * t - 6.622 - lngHour;
  ut = ((ut % 24) + 24) % 24;
  return Date.UTC(y, m - 1, d) + ut * 3600000;
}
// Returns the UTC time at which the quiet window ends if `ms` falls inside it, otherwise 0.
export function shabbatEndIfActive(ms) {
  const day = ilWeekday(ms);
  if (day !== 5 && day !== 6) return 0;
  const p = ilParts(ms);
  const friday = new Date(Date.UTC(p.y, p.m - 1, p.d - (day === 6 ? 1 : 0)));
  const saturday = new Date(friday.getTime() + 86400000);
  const start = sunsetUtc(friday.getUTCFullYear(), friday.getUTCMonth() + 1, friday.getUTCDate()) - SHABBAT_BEFORE_MIN * 60000;
  const end = sunsetUtc(saturday.getUTCFullYear(), saturday.getUTCMonth() + 1, saturday.getUTCDate()) + SHABBAT_AFTER_MIN * 60000;
  return ms >= start && ms < end ? end : 0;
}

// ---------- VAPID (keys are generated once and kept privately in R2) ----------
async function loadVapid(env) {
  if (vapidCache) return vapidCache;
  let stored = await readJson(env, VAPID_KEY, null);
  if (!stored || !stored.publicKey || !stored.privateJwk) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const publicKey = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
    const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    await writeJson(env, VAPID_KEY, { publicKey, privateJwk, createdAt: new Date().toISOString() }, { onlyIf: { etagDoesNotMatch: "*" } });
    stored = await readJson(env, VAPID_KEY, null);
  }
  if (!stored || !stored.publicKey || !stored.privateJwk) throw new Error("VapidUnavailable");
  const key = await crypto.subtle.importKey("jwk", stored.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  vapidCache = { publicKey: stored.publicKey, key };
  return vapidCache;
}

export async function getPublicKey(env) {
  return (await loadVapid(env)).publicKey;
}

export async function vapidHeader(env, endpoint) {
  const { publicKey, key } = await loadVapid(env);
  const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: SITE
  })));
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(header + "." + claims)));
  return "vapid t=" + header + "." + claims + "." + b64url(signature) + ", k=" + publicKey;
}

// A payload-less push only wakes the service worker; it then fetches its message from /api/push/inbox.
async function ping(env, endpoint) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: await vapidHeader(env, endpoint), TTL: "86400", Urgency: "normal" }
  });
  return response.status;
}

// ---------- state ----------
async function loadSubs(env) {
  const data = await readJson(env, SUBS_KEY, { subs: {} });
  if (!data || typeof data.subs !== "object" || !data.subs) return { subs: {} };
  return data;
}
async function saveSubs(env, data) { await writeJson(env, SUBS_KEY, data); }

export function cleanPrefs(input) {
  const out = {};
  for (const c of CATS) {
    const p = input && typeof input === "object" ? input[c] : null;
    if (p && p.on === true) {
      const hour = Number.isInteger(p.hour) && p.hour >= 5 && p.hour <= 23 ? p.hour : 8;
      out[c] = { on: true, mode: p.mode === "daily" ? "daily" : "now", hour };
    } else {
      out[c] = { on: false, mode: "now", hour: 8 };
    }
  }
  return out;
}
export function hasAny(prefs) { return CATS.some(c => prefs[c] && prefs[c].on); }

export async function setSubscription(env, endpoint, prefs) {
  const data = await loadSubs(env);
  const id = await hashEndpoint(endpoint);
  if (!hasAny(prefs)) {
    delete data.subs[id];
  } else {
    const existing = data.subs[id];
    if (!existing && Object.keys(data.subs).length >= MAX_SUBS) throw new Error("TooManySubscribers");
    const pending = (existing?.pending || []).filter(m => prefs[m.cat]?.on && prefs[m.cat].mode === "daily");
    data.subs[id] = { endpoint, prefs, outbox: existing?.outbox || [], pending, createdAt: existing?.createdAt || Date.now(), updatedAt: Date.now() };
  }
  await saveSubs(env, data);
}

export async function getPrefs(env, endpoint) {
  const data = await loadSubs(env);
  return data.subs[await hashEndpoint(endpoint)]?.prefs || null;
}

export async function takeOutbox(env, endpoint) {
  const data = await loadSubs(env);
  const sub = data.subs[await hashEndpoint(endpoint)];
  if (!sub || !sub.outbox?.length) return [];
  const messages = sub.outbox.map(({ cat, title, body, url }) => ({ cat, title, body, url }));
  sub.outbox = [];
  await saveSubs(env, data);
  return messages;
}

async function deliver(env, data, hashes) {
  if (!hashes.length) return;
  const dead = [];
  for (let i = 0; i < hashes.length; i += 25) {
    const part = hashes.slice(i, i + 25);
    const results = await Promise.allSettled(part.map(h => ping(env, data.subs[h].endpoint)));
    results.forEach((r, k) => { if (r.status === "fulfilled" && (r.value === 404 || r.value === 410)) dead.push(part[k]); });
  }
  if (dead.length) {
    const fresh = await loadSubs(env);
    dead.forEach(h => { delete fresh.subs[h]; });
    await saveSubs(env, fresh);
  }
}

// ---------- events ----------
// During the Shabbat window nothing is sent: messages wait and are released after it ends.
export async function notifyEvent(env, ev) {
  try {
    if (!env.PRODUCT_IMAGES || !CATS.includes(ev.cat)) return;
    const data = await loadSubs(env);
    const now = Date.now();
    const msg = { cat: ev.cat, title: ev.title, body: ev.body, url: ev.url || "/", at: now };
    const targets = [];
    for (const [id, sub] of Object.entries(data.subs)) {
      const p = sub.prefs?.[ev.cat];
      if (!p || !p.on) continue;
      const hold = shabbatEndIfActive(now);
      if (p.mode === "daily" || hold) {
        const wanted = p.mode === "daily" ? nextOccurrence(p.hour, now) : now;
        const dueAt = shabbatEndIfActive(wanted) || wanted;
        sub.pending = (sub.pending || []).concat({ ...msg, dueAt }).slice(-20);
      } else {
        sub.outbox = (sub.outbox || []).concat(msg).slice(-MAX_OUTBOX);
        targets.push(id);
      }
    }
    await saveSubs(env, data);
    await deliver(env, data, targets);
  } catch (error) {
    console.error("Push notify failed:", error?.message || "UnknownError");
  }
}

export async function queueProduct(env, name) {
  try {
    if (!env.PRODUCT_IMAGES) return;
    const batch = await readJson(env, BATCH_KEY, {});
    const names = (batch.names || []).concat(String(name || "").slice(0, 80)).slice(-20);
    await writeJson(env, BATCH_KEY, { names, count: (batch.count || 0) + 1, lastAt: Date.now() });
  } catch (error) {
    console.error("Push queue failed:", error?.message || "UnknownError");
  }
}

async function sendProductBatch(env) {
  const batch = await readJson(env, BATCH_KEY, {});
  if (!batch.count) return;
  await writeJson(env, BATCH_KEY, {});
  const names = (batch.names || []).filter(Boolean);
  const shown = names.slice(0, 3).join(", ") + (batch.count > 3 ? " ועוד" : "");
  await notifyEvent(env, {
    cat: "products",
    title: batch.count === 1 ? "מוצר חדש בהרש-שופ" : "מוצרים חדשים בהרש-שופ",
    body: batch.count === 1 ? (names[0] || "נוסף מוצר חדש לחנות") : "נוספו " + batch.count + " מוצרים: " + shown,
    url: "/#shop-all"
  });
}

// Several products are usually saved one after another; wait for a quiet moment and send one message.
export async function delayedProductNotify(env) {
  try {
    await new Promise(resolve => setTimeout(resolve, 20000));
    const batch = await readJson(env, BATCH_KEY, {});
    if (!batch.count || Date.now() - batch.lastAt < 15000) return;
    await sendProductBatch(env);
  } catch (error) {
    console.error("Push product notify failed:", error?.message || "UnknownError");
  }
}

// Called every ~15 minutes: releases daily-digest messages whose hour has arrived. Does nothing during Shabbat.
export async function flushDue(env) {
  const out = { moved: 0, pings: 0, batch: false };
  if (shabbatEndIfActive(Date.now())) return { ...out, shabbat: true };
  const batch = await readJson(env, BATCH_KEY, {});
  if (batch.count && Date.now() - batch.lastAt > 60000) { await sendProductBatch(env); out.batch = true; }
  const data = await loadSubs(env);
  const now = Date.now();
  const targets = [];
  let changed = false;
  for (const [id, sub] of Object.entries(data.subs)) {
    const keep = [], due = [];
    for (const m of sub.pending || []) (m.dueAt <= now ? due : keep).push(m);
    const before = (sub.outbox || []).length;
    sub.outbox = (sub.outbox || []).filter(m => now - m.at < 3 * 86400000);
    if (sub.outbox.length !== before) changed = true;
    if (due.length) {
      sub.pending = keep;
      sub.outbox = sub.outbox.concat(due.map(({ dueAt, ...m }) => m)).slice(-MAX_OUTBOX);
      targets.push(id);
      out.moved += due.length;
      changed = true;
    }
  }
  if (changed) await saveSubs(env, data);
  await deliver(env, data, targets);
  out.pings = targets.length;
  return out;
}
