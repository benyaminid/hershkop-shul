const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_ID = "tbl6n85XwiAZ1gXTk";
const TOKEN = process.env.WINNERS_AIRTABLE_TOKEN;
async function getAllowedNumbers(request) {
  const response = await fetch(new URL("/site.json", request.url), { cache: "no-store" });
  if (!response.ok) throw new Error("LotteryConfigUnavailable");
  const site = await response.json();
  const values = site?.winners?.nums;
  if (!Array.isArray(values) || values.length !== 5) throw new Error("LotteryConfigInvalid");
  const numbers = values.map((value) => String(value));
  if (numbers.some((value) => !/^[0-9]{1,10}$/.test(value)) || new Set(numbers).size !== 5) {
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

async function getRecords() {
  if (!BASE_ID || !TOKEN) throw new Error("ConfigurationMissing");
  const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
  url.searchParams.set("pageSize", "100");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` }
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

export default async (request) => {
  if (request.method === "GET") {
    try {
      const allowedNumbers = await getAllowedNumbers(request);
      const records = await getRecords();
      const winners = records
        .map(({ fields }) => ({
          number: String(fields["Winning Number"] || ""),
          registered: fields.Registered === true
        }))
        .filter((winner) => allowedNumbers.has(winner.number));
      return json({ winners });
    } catch (error) {
      console.error("Winner status lookup failed:", error?.message || "UnknownError");
      return json({ error: "Unable to load winner status" }, 503);
    }
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await request.json();
    const number = String(body?.number ?? "");
    const allowedNumbers = await getAllowedNumbers(request);
    const firstName = body?.firstName?.trim();
    const lastName = body?.lastName?.trim();

    if (!allowedNumbers.has(number) || !validName(firstName) || !validName(lastName)) {
      return json({ error: "נא למלא שם פרטי ושם משפחה תקינים" }, 400);
    }

    const records = await getRecords();
    const record = records.find(({ fields }) =>
      String(fields["Winning Number"] || "") === number
    );

    if (!record) return json({ error: "מספר הזכייה לא נמצא" }, 404);
    if (record.fields.Registered === true ||
        record.fields["Child First Name"] ||
        record.fields["Child Last Name"]) {
      return json({ error: "הזכייה במספר זה כבר נרשמה" }, 409);
    }

    const updateUrl = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${record.id}`;
    const update = await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fields: {
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

    return json({ success: true });
  } catch (error) {
    console.error("Winner registration failed:", error?.message || "UnknownError");
    return json({ error: "לא ניתן לשמור כרגע. נסו שוב מאוחר יותר" }, 503);
  }
};
