const TABLE_ID = "tbl6n85XwiAZ1gXTk";
async function getAllowedNumbers(request, env) {
  let values = null;
  if (env.PRODUCT_IMAGES) {
    const object = await env.PRODUCT_IMAGES.get("weekly-lottery.json");
    if (object) {
      const lottery = JSON.parse(await object.text());
      values = lottery?.nums;
    }
  }
  if (!values) {
    const response = await fetch(new URL("/site.json", request.url), { cache: "no-store" });
    if (!response.ok) throw new Error("LotteryConfigUnavailable");
    const site = await response.json();
    values = site?.winners?.nums;
  }
  if (!Array.isArray(values) || values.length !== 5) throw new Error("LotteryConfigInvalid");
  const numbers = values.map((value) => String(value));
  if (numbers.some((value) => !/^[0-9]{1,4}$/.test(value)) || new Set(numbers).size !== 5) {
    throw new Error("LotteryConfigInvalid");
  }
  return new Set(numbers);
}

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  }
});

async function getRecords(env) {
  if (!env.AIRTABLE_BASE_ID || !env.WINNERS_AIRTABLE_TOKEN) throw new Error("ConfigurationMissing");
  const url = new URL(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${TABLE_ID}`);
  url.searchParams.set("pageSize", "100");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${env.WINNERS_AIRTABLE_TOKEN}` }
  });
  if (!response.ok) throw new Error(`AirtableRead${response.status}`);
  const data = await response.json();
  return data.records || [];
}

function validName(value) {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 50 &&
    /^[\p{L}\p{M}][\p{L}\p{M}\s'’-]*$/u.test(value.trim());
}

export async function onRequest({ request, env }) {
  if (request.method === "GET") {
    try {
      const allowedNumbers = await getAllowedNumbers(request, env);
      if (env.PRODUCT_IMAGES) {
        const object = await env.PRODUCT_IMAGES.get("weekly-lottery.json");
        if (object) {
          const lottery = JSON.parse(await object.text());
          if (lottery && lottery.registrations && typeof lottery.registrations === "object") {
            const winners = Array.from(allowedNumbers).map(number => {
              const registration = lottery.registrations[number] || null;
              return {
                number,
                registered: !!registration,
                firstName: registration?.firstName || "",
                lastName: registration?.lastName || ""
              };
            });
            return json({ winners });
          }
        }
      }
      const records = await getRecords(env);
      const latest = new Map();
      records.forEach(record => {
        const number = String(record.fields?.["Winning Number"] || "");
        if (allowedNumbers.has(number)) latest.set(number, record.fields || {});
      });
      const winners = Array.from(latest, ([number, fields]) => ({
        number,
        registered: fields.Registered === true,
        firstName: fields["Child First Name"] || "",
        lastName: fields["Child Last Name"] || ""
      }));
      return json({ winners });
    } catch (error) {
      console.error("Winner status lookup failed:", error?.message || "UnknownError");
      return json({ error: "Unable to load winner status", diagnostic: error?.message || "UnknownError" }, 503);
    }
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await request.json();
    const number = String(body?.number ?? "");
    const allowedNumbers = await getAllowedNumbers(request, env);
    const firstName = body?.firstName?.trim();
    const lastName = body?.lastName?.trim();

    if (!allowedNumbers.has(number) || !validName(firstName) || !validName(lastName)) {
      return json({ error: "נא למלא שם פרטי ושם משפחה תקינים" }, 400);
    }

    // The current lottery is stored in Cloudflare R2. When its object exists,
    // R2 is the source of truth for registrations; do not require Airtable.
    if (env.PRODUCT_IMAGES) {
      const object = await env.PRODUCT_IMAGES.get("weekly-lottery.json");
      if (object) {
        const lottery = JSON.parse(await object.text());
        if (!lottery || !Array.isArray(lottery.nums) ||
            !lottery.registrations || typeof lottery.registrations !== "object" ||
            Array.isArray(lottery.registrations)) {
          throw new Error("LotteryStorageInvalid");
        }
        if (!lottery.nums.map(String).includes(number)) {
          return json({ error: "המספר אינו שייך להגרלה הנוכחית" }, 400);
        }
        if (lottery.registrations[number]) return json({ error: "הזכייה במספר זה כבר נרשמה" }, 409);
        lottery.registrations = {
          ...lottery.registrations,
          [number]: { firstName, lastName, registeredAt: new Date().toISOString() }
        };
        await env.PRODUCT_IMAGES.put("weekly-lottery.json", JSON.stringify(lottery), {
          httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" }
        });
        return json({ success: true });
      }
    }

    // Compatibility fallback for legacy deployments that still store winners in Airtable.
    const createUrl = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${TABLE_ID}`;
    const update = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WINNERS_AIRTABLE_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fields: {
          "Winning Number": Number(number),
          "Child First Name": firstName,
          "Child Last Name": lastName,
          Registered: true
        }
      })
    });

    if (!update.ok) {
      console.error("Winner record update failed:", update.status);
      return json({ error: "לא ניתן לשמור כרגע. נסו שוב מאוחר יותר" }, 503);
    }

    if (registrationKey && lottery) {
      lottery.registrations = { ...(lottery.registrations || {}), [registrationKey]: { firstName, lastName, registeredAt: new Date().toISOString() } };
      await env.PRODUCT_IMAGES.put("weekly-lottery.json", JSON.stringify(lottery), {
        httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" }
      });
    }
    return json({ success: true });
  } catch (error) {
    console.error("Winner registration failed:", error?.message || "UnknownError");
    return json({ error: "לא ניתן לשמור כרגע. נסו שוב מאוחר יותר" }, 503);
  }
}
