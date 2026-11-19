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

function parseJsonResponse(result) {
  const raw = typeof result?.response === "string" ? result.response :
    typeof result?.answer === "string" ? result.answer :
    typeof result?.result === "string" ? result.result : JSON.stringify(result ?? {});
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

// Cropped, high-contrast 128x128 reference of the community emblem supplied for the ticket layout.
const EMBLEM_REFERENCE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAAAAADmVT4XAAADKUlEQVR42u1b25KrMAyzPPz/L+s8FFqaq3Nz2DllZnfYbYlkW7aTAKDsPVR+BDYfR/+luJ33KwkcAg4OLieA+le4jADso3IBAbQZxskE0CEvTiOAbolzRh0A5mRqpwcG0G1OKBMYhq9T0OX4lVF0OX5FRbpEfA2m6Grza9boevPLBqmD+cUx1Qs/N6q64WfGVT/89MjqiJ8cWz3xU6OrK35ifPXFjxH81wUoEYA/A3XHD2DUH/8Ba0OkCWALA90bgG3Lc8QEsInBY3ZIsCsIT/HAqAPY7QKdnthdHsC+VHyGBvCANBR/Fb7sVtmsQt0ZAchvs3o3AYjo3iT8aQBP8AB+abj3yN+0Il4/IgTxaTfn7vL701cnuv/ZpEJYL6Pgq+Wdf+HshO8PETTG63sEk1hqRBcRUvCRLF+nFDJoxzh/435GufBpDUFQMpHp+8xMDSi8znBFLOUBcCQNGU8HsuMxw2Hw7jnJvWk4Xsb+6vMDrZ7nGAHG8DDyqhE9SqBotIZp7Uef3FPhMMiL3/dPmBAfM6IM6nciU48Gpd8uzD28gLxLaL9hkStuSNuJfFIiWfBQI4Dyf5C9o1W48G4/23tBXdDoLl5cmPzzCxFWEOCkIHRW1D82KcVmAljjgZ0NmbY6EFZRRg9+9M7KjYUIYVdLtb3P7PzzVQhrcdOG8POSASJJMKpXJzLAcpC1Lbtrfjibxdt4ClEIDs8ON2FmiVgihhn/RWB2fpn1yEWrY+sjepy3PGd3xdIpTea+UF9RBxa1SN4IdC9R2ae+WWtD8qs8MOkNFrkfMuACFqbF7xVBpR4MeQDfoAgLIs6tkRL7Q2RIBcWnnME8flwzZlfDypCJRZvvliljDXAH/pcIuQH/YXvF9HfAHg8wW4jojh96gN74UQi4VYQuDFhrRnTFT2UBPfGNu2Tr8NN1gH74mUJEN/xcJaQXfrYUcz4xts0J2blJw8oE2j4pte1K0kiRXetILI2+oR3P2pqt7ZCsWPeZzagv5bHOetuMaCwOdftMw2MRunlO2OcFm21LXvlskG/bS6+YjC49r/1CpmYuuqKLeVUD//3b9/8AP1n35niFHoQAAAAASUVORK5CYII=";

function extractDigits(value) {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

function normalizeTicketNumber(value) {
  return extractDigits(value).replace(/^0+(?=\d)/, "");
}

function confident(field) {
  return field?.value !== null && field?.value !== undefined &&
    Number(field?.confidence) >= 0.995 &&
    Number(field?.p_null) <= 0.001;
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Fail closed until the live positive/negative image test set has passed.
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
    const imageMatch = typeof image === "string" && image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/);
    if (!imageMatch || image.length > 4_000_000) return json({ error: "צילום הכרטיס אינו תקין או גדול מדי" }, 400);

    const mimeType = "image/" + imageMatch[1];
    const base64 = imageMatch[2];
    const binary = atob(base64);
    if (binary.length < 1000 || binary.length > 2_800_000) return json({ error: "יש לצלם כרטיס ברור ובגודל קטן יותר" }, 400);

    // Clairic accepts embedded images as {content_type, base64}; it returns typed values and uncertainty.
    const extraction = await env.AI.run("@cf/cloudflare/clairic", {
      model: "clairic",
      state: "Image 1 is the submitted ticket photo. Image 2 is the exact community emblem reference cropped from the owners original ticket sample. Read image 1 as a printed lottery ticket and compare its top emblem directly with image 2. Preserve every digit exactly, including leading zeroes. The ticket layout has the round black emblem at the top, a large printed digit string in the center, and the exact Hebrew phrase השתתפתי באבות ובנים below it. Do not infer missing content. If the ticket is not complete or the emblem is not a close visual match to image 2 in its distinctive lettering, ornaments, border and layout, return false for the relevant fields.",
      images: [
        { content_type: mimeType, base64 },
        { content_type: "image/png", base64: EMBLEM_REFERENCE_BASE64 }
      ],
      fields: {
        ticket_number: { type: "text", instructions: "Exact consecutive digits printed as the ticket number, preserving all leading zeroes. Null unless clearly printed and readable." },
        participation_phrase: { type: "text", instructions: "Exact Hebrew phrase printed below the number. Null unless all words are legible." },
        ticket_is_present: { type: "boolean", instructions: "True only if a complete printed lottery ticket is visibly present, not a room or unrelated image." },
        round_black_emblem_present: { type: "boolean", instructions: "True only if the round black emblem is visible at the top of image 1." },
        emblem_matches_reference: { type: "boolean", instructions: "Compare the emblem in image 1 directly against image 2. True only when the distinctive Hebrew lettering, ornament, circular border, internal linework and overall composition closely match the reference. A generic black circle or a different community logo is false." },
        ticket_edges_visible: { type: "boolean", instructions: "True only if the complete outer boundary of the ticket is visible." }
      }
    });

    const answers = extraction?.answers || {};
    const extractedNumber = extractDigits(answers.ticket_number?.value);
    const phrase = String(answers.participation_phrase?.value ?? "").replace(/[״“”"']/g, "").replace(/\s+/g, " ").trim();
    const typedPass =
      extraction?.truncated === false &&
      normalizeTicketNumber(extractedNumber) === normalizeTicketNumber(number) &&
      phrase === "השתתפתי באבות ובנים" &&
      confident(answers.ticket_number) &&
      confident(answers.participation_phrase) &&
      answers.ticket_is_present?.value === true &&
      answers.round_black_emblem_present?.value === true &&
      answers.ticket_edges_visible?.value === true &&
      confident(answers.ticket_is_present) &&
      confident(answers.round_black_emblem_present) &&
      answers.emblem_matches_reference?.value === true &&
      confident(answers.emblem_matches_reference) &&
      confident(answers.ticket_edges_visible);

    if (!typedPass) {
      return json({ error: "לא זוהה כרטיס מלא וברור עם המספר, הסמל והכיתוב הנדרשים. נסה צילום חד יותר." }, 422);
    }

    // Independent visual cross-check. A malformed or disagreeing response always rejects.
    const visual = await env.AI.run("@cf/moondream/moondream3.1-9B-A2B", {
      task: "query",
      image,
      question: "Inspect only this image. Return ONLY JSON with keys ticket_present (boolean), whole_ticket_visible (boolean), round_black_emblem_at_top (boolean), hebrew_phrase_below_number (boolean), and printed_number (string of digits exactly as printed, preserving leading zeroes). The expected layout is a complete paper ticket with a round black emblem at the top, a large number in the middle, and the exact Hebrew phrase השתתפתי באבות ובנים below. Do not guess. If no complete ticket is clearly visible, set all booleans false and printed_number to an empty string. Read the digits from the image itself."
    });
    const visualCheck = parseJsonResponse(visual?.answer ? visual : visual?.response ? visual : { answer: JSON.stringify(visual) });
    if (!visualCheck) return json({ error: "בדיקת התמונה הנוספת לא הצליחה. נסה שוב." }, 422);

    const visualPass =
      visualCheck.ticket_present === true &&
      visualCheck.whole_ticket_visible === true &&
      visualCheck.round_black_emblem_at_top === true &&
      visualCheck.hebrew_phrase_below_number === true &&
      normalizeTicketNumber(visualCheck.printed_number) === normalizeTicketNumber(number);

    if (!visualPass) return json({ error: "שתי בדיקות התמונה לא הסכימו על פרטי הכרטיס. לא ניתן לאמת אותו." }, 422);

    return json({ success: true, token: await signToken(number, env.WINNER_VERIFY_SECRET) });
  } catch (error) {
    console.error("Ticket verification v2 failed:", error?.message || "UnknownError");
    return json({ error: "שירות אימות הכרטיס אינו זמין כרגע. נסה שוב מאוחר יותר." }, 503);
  }
}
