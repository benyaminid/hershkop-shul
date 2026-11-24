import { json, sameOrigin, isAdmin } from "../../_lib/admin-auth.js";
import { queueProduct, delayedProductNotify } from "../../_lib/push.js";

const TABLE_ID = "tblqCaAc3G8p2XjXO";
async function airtable(env, path = "", options = {}) {
  if (!env.AIRTABLE_WRITE_TOKEN || !env.AIRTABLE_BASE_ID) throw new Error("ConfigurationMissing");
  const url = "https://api.airtable.com/v0/" + env.AIRTABLE_BASE_ID + "/" + TABLE_ID + (path ? "/" + encodeURIComponent(path) : "");
  return fetch(url, {
    ...options,
    headers: {
      Authorization: "Bearer " + env.AIRTABLE_WRITE_TOKEN,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

async function allRecords(env) {
  const records = [];
  let offset = "";
  do {
    const url = new URL("https://api.airtable.com/v0/" + env.AIRTABLE_BASE_ID + "/" + TABLE_ID);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url, { headers: { Authorization: "Bearer " + env.AIRTABLE_WRITE_TOKEN } });
    if (!response.ok) throw new Error("AirtableRead" + response.status);
    const data = await response.json();
    records.push(...(data.records || []));
    offset = data.offset || "";
  } while (offset);
  return records;
}

function cleanInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const images = Array.isArray(input.images) ? input.images.filter(x => typeof x === "string").map(x => x.trim()).filter(Boolean) : (typeof input.image === "string" && input.image.trim() ? [input.image.trim()] : []);
  const emoji = typeof input.emoji === "string" ? input.emoji.trim() : "🎁";
  const price = Number(input.price);
  const stock = input.stock === "" || input.stock === null || input.stock === undefined ? null : Number(input.stock);
  const tags = Array.isArray(input.tags) ? input.tags.filter(x => x === "מבצע" || x === "חדש") : [];
  if (!name || name.length > 120 || description.length > 2000 || images.length > 12 || images.some(x => x.length > 1000) || emoji.length > 16) return null;
  if (!Number.isFinite(price) || price < 0 || (stock !== null && (!Number.isFinite(stock) || stock < 0))) return null;
  if (images.some(image => !(/^(https:\/\/|\/img\/|\/api\/images\/)/i.test(image)))) return null;
  const fields = {
    Name: name,
    Price: price,
    Description: description,
    Emoji: emoji || "🎁",
    Tags: [...new Set(tags)],
    "On Sale": tags.includes("מבצע"),
    "Show Zero": input.showZero === true,
    Hidden: input.hidden === true
  };
  fields.Images = JSON.stringify([...new Set(images)]);
  fields.Image = images[0] || null;
  fields.Stock = stock;
  return fields;
}

function present(record) {
  const f = record.fields || {};
  let images = [];
  try { const parsed = JSON.parse(f.Images || "[]"); if (Array.isArray(parsed)) images = parsed.filter(x => typeof x === "string" && x.trim()); } catch {}
  if (!images.length && f.Image) images = [f.Image];
  return {
    recordId: record.id,
    name: f.Name || "",
    price: f.Price ?? 0,
    image: images[0] || f.Image || "",
    images,
    description: f.Description || "",
    tags: Array.isArray(f.Tags) ? f.Tags : [],
    stock: f.Stock ?? null,
    emoji: f.Emoji || "🎁",
    showZero: f["Show Zero"] === true,
    hidden: f.Hidden === true,
  };
}

export async function onRequest({ request, env, waitUntil }) {
  if (!(await isAdmin(request, env))) return json({ error: "נדרשת התחברות" }, 401);
  if (request.method === "GET") {
    try {
      const records = await allRecords(env);
      return json({ products: records.map(present) });
    } catch (error) {
      console.error("Admin products read failed:", error?.message || "UnknownError");
      return json({ error: "לא ניתן לטעון את המוצרים" }, 502);
    }
  }
  if (!["POST", "PATCH", "DELETE"].includes(request.method)) return json({ error: "Method not allowed" }, 405);
  if (!sameOrigin(request)) return json({ error: "Request rejected" }, 403);

  try {
    const body = await request.json();
    if (request.method === "DELETE") {
      const recordId = typeof body?.recordId === "string" ? body.recordId : "";
      if (!/^rec[A-Za-z0-9]+$/.test(recordId)) return json({ error: "מוצר לא תקין" }, 400);
      const response = await airtable(env, recordId, { method: "PATCH", body: JSON.stringify({ fields: { Hidden: true } }) });
      if (!response.ok) return json({ error: "לא ניתן להסתיר את המוצר" }, 502);
      return json({ success: true });
    }

    const fields = cleanInput(body);
    if (!fields) return json({ error: "יש לבדוק את פרטי המוצר והשדות המספריים" }, 400);

    if (request.method === "POST") {
      const response = await airtable(env, "", { method: "POST", body: JSON.stringify({ fields }) });
      if (!response.ok) return json({ error: "לא ניתן להוסיף את המוצר" }, 502);
      const record = await response.json();
      if (fields.Hidden !== true && waitUntil) waitUntil(queueProduct(env, fields.Name).then(() => delayedProductNotify(env)));
      return json({ success: true, product: present(record) }, 201);
    }

    const recordId = typeof body.recordId === "string" ? body.recordId : "";
    if (!/^rec[A-Za-z0-9]+$/.test(recordId)) return json({ error: "מוצר לא תקין" }, 400);
    const response = await airtable(env, recordId, { method: "PATCH", body: JSON.stringify({ fields }) });
    if (!response.ok) return json({ error: "לא ניתן לעדכן את המוצר" }, 502);
    const record = await response.json();
    return json({ success: true, product: present(record) });
  } catch (error) {
    console.error("Admin products write failed:", error?.message || "UnknownError");
    return json({ error: "לא ניתן לשמור כרגע. נסה שוב" }, 502);
  }
}
