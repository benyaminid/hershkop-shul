const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600"
  }
});

export default async () => {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME;

  if (!token || !baseId || !tableName) {
    return json({ error: "Airtable environment variables are missing" }, 500);
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
        const detail = await response.text();
        console.error("Airtable request failed:", response.status, detail);
        return json({ error: "Unable to load products" }, 502);
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
    console.error("Products function failed:", error);
    return json({ error: "Unable to load products" }, 500);
  }
};
