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
  return btoa(binary).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
}

async function signToken(number, secret) {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ number, exp: Date.now() + 5 * 60 * 1000 })));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return payload + "." + b64url(new Uint8Array(signature));
}

function parseJsonResponse(result) {
  const raw = typeof result?.response === "string" ? result.response :
    typeof result?.answer === "string" ? result.answer :
    typeof result?.result === "string" ? result.result : JSON.stringify(result ?? {});
  const match = raw.match(/\\{[\\s\\S]*\\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function extractDigits(value) {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Fail closed by default. Enable only after completing the documented real-image test set.
  if (env.WINNER_VERIFY_V2_ENABLED !== "true") {
    return json({ error: "אימות הזכייה עדיין בבדיקות. לא ניתן כרגע לרשום זוכה." }, 503);
  }

  try {
    if (!env.AI || !env.WINNER_VERIFY_SECRET) {
      return json({ error: "שירות אימות הכרטיס אינו מוגדר במלואו." }, 503);
    }

    const body = await request.json();
    const number = String(body?.number ?? "");
    const allowed = await getAllowedNumbers(request);
    if (!allowed.has(number)) return json({ error: "מספר הכרטיס אינו בין המספרים הזוכים" }, 400);

    const image = body?.image;
    const imageMatch = typeof image === "string" && image.match(/^data:image\\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/);
    if (!imageMatch || image.length > 4_000_000) return json({ error: "צילום הכרטיס אינו תקין או גדול מדי" }, 400);

    const mimeType = imageMatch[1] === "jpg" ? "image/jpeg" : "image/" + imageMatch[1];
    const base64 = imageMatch[2];
    const binary = atob(base64);
    if (binary.length < 1000 || binary.length > 2_800_000) return json({ error: "יש לצלם כרטיס ברור ובגודל קטן יותר" }, 400);

    // Model 1: typed extraction. Keep leading zeroes because the ticket number is an identifier.
    const extraction = await env.AI.run("@cf/cloudflare/clairic", {
      model: "clairic",
      state: "Read the printed physical lottery ticket in the attached image. Do not infer or calculate missing information. The expected ticket layout is a round black community emblem at the top, a printed digit string in the center, and the exact Hebrew phrase השתתפתי באבות ובנים below it. Read every digit exactly, including leading zeroes. If the image is not clearly a complete ticket, return null for all fields.",
      images: [{ content_type: mimeType, base64 }],
      fields: {
        ticket_number: { type: "text", instructions: "Exact consecutive digits printed as the ticket number, preserving every leading zero. Null if not clearly readable." },
        participation_phrase: { type: "text", instructions: "Exact Hebrew phrase printed below the number. Null unless all words are legible." },
        ticket_is_present: { type: "boolean", instructions: "True only if a complete printed lottery ticket is visibly present, not a room or unrelated image." },
        round_black_emblem_present: { type: "boolean", instructions: "True only if the round black community emblem is visibly printed at the top of the ticket." },
        ticket_edges_visible: { type: "boolean", instructions: "True only if the complete outer boundary of the ticket is visible." }
      }
    });

    const answers = extraction?.answers || {};
    const extractedNumber = extractDigits(answers.ticket_number?.value);
    const phrase = String(answers.participation_phrase?.value ?? "").replace(/[״“”"']/g, "").replace(/\\s+/g, " ").trim();
    const phraseMatches = phrase === "השתתפתי באבות ובנים";
    const confident = (field) =>
      field?.value !== null && field?.value !== undefined &&
      Number(field?.confidence) >= 0.995 &&
      Number(field?.p_null ?? 1) <= 0.001;

    const typedPass =
      extraction?.truncated === false &&
      extractedNumber === number &&
      phraseMatches &&
      confident(answers.ticket_number) &&
      confident(answers.participation_phrase) &&
      answers.ticket_is_present?.value === true &&
      answers.round_black_emblem_present?.value === true &&
      answers.ticket_edges_visible?.value === true &&
      confident(answers.ticket_is_present) &&
      confident(answers.round_black_emblem_present) &&
      confident(answers.ticket_edges_visible);

    if (!typedPass) {
      return json({ error: "לא זוהה כרטיס מלא וברור עם המספר, הסמל והכיתוב הנדרשים. נסה צילום חד יותר." }, 422);
    }

    // Model 2: independent visual cross-check. Any disagreement or unparseable response rejects the ticket.
    const visual = await env.AI.run("@cf/moondream/moondream3.1-9B-A2B", {
      task: "query",
      image,
      question: "Inspect only the image. Return ONLY JSON: {\\"ticket_present\\":boolean,\\"whole_ticket_visible\\":boolean,\\"round_black_emblem_at_top\\":boolean,\\"hebrew_phrase_below_number\\":boolean,\\"printed_number\\":\\"digits exactly as printed, preserving leading zeroes\\"}. The expected layout is a complete paper ticket with a round black emblem at the top, a large number in the middle, and the exact Hebrew phrase השתתפתי באבות ובנים below. Do not guess. If no complete ticket is clearly visible, set every boolean false and printed_number to empty string. Read the image, never copy a number from this question."
    });
    const visualCheck = parseJsonResponse(visual);
    if (!visualCheck) return json({ error: "בדיקת התמונה הנוספת לא הצליחה. נסה שוב." }, 422);

    const visualNumber = extractDigits(visualCheck.printed_number);
    const visualPass =
      visualCheck.ticket_present === true &&
      visualCheck.whole_ticket_visible === true &&
      visualCheck.round_black_emblem_at_top === true &&
      visualCheck.hebrew_phrase_below_number === true &&
      visualNumber === number;

    if (!visualPass) return json({ error: "שתי בדיקות התמונה לא הסכימו על פרטי הכרטיס. לא ניתן לאמת אותו." }, 422);

    return json({ success: true, token: await signToken(number, env.WINNER_VERIFY_SECRET) });
  } catch (error) {
    console.error("Ticket verification v2 failed:", error?.message || "UnknownError");
    return json({ error: "שירות אימות הכרטיס אינו זמין כרגע. נסה שוב מאוחר יותר." }, 503);
  }
}
