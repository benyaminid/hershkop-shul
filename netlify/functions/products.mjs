const json = (body, status = 200, cache = "public, max-age=60, s-maxage=300, stale-while-revalidate=600") =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });

export default async (request) => {
  if (request?.method !== "GET") {
    return json({ error: "Method not allowed" }, 405, "no-store");
  }

  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME;

  if (!token || !baseId || !tableName) {
    console.error("Airtable environment variables are missing");
    return json({ error: "Unable to load products" }, 500, "no-store");
  }

  try {
    const records = [];
    let offset;

    do {
      const url = new URL(
        `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`
      );
      url.searchParams.set("pageSize", "100");
      if (offset) url.searchParams.set("offset", offset);

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        console.error("Airtable request failed:", response.status);
        return json({ error: "Unable to load products" }, 502, "no-store");
      }

      const page = await response.json();
      records.push(...(page.records || []));
      offset = page.offset;
    } while (offset);

    const products = records.map(({ id, fields }) => ({
      id: fields["Legacy ID"] ?? id,
      n: fields.Name || "מוצר ללא שם",
      p: Number(fields.Price || 0),
      s: fields.Stock === undefined || fields.Stock === null
        ? null
        : Number(fields.Stock),
      e: fields.Emoji || "🎁",
      d: fields.Description || "",
      t: fields["On Sale"] === true ||
        (Array.isArray(fields.Tags) && fields.Tags.includes("מבצע")),
      z: fields["Show Zero"] === true,
      h: fields.Hidden === true,
      img: fields.Image || ""
    }));

    return json(products);
  } catch (error) {
    console.error("Products function failed:", error?.name || "UnknownError");
    return json({ error: "Unable to load products" }, 500, "no-store");
  }
};
