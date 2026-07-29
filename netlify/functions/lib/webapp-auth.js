/**
 * Auth for the Telegram Mini App (the /review editor).
 *
 * Two separate mechanisms, both keyed off TELEGRAM_BOT_TOKEN so there's no
 * extra secret to manage:
 *
 *   1. initData — Telegram signs the launch payload it hands the Mini App.
 *      Verifying it proves the request came from a real Telegram client on
 *      behalf of a specific user. This gates every read/write on a draft.
 *
 *   2. Preview tokens — short-lived, unguessable strings that let the preview
 *      iframe fetch a draft's markdown without initData. The iframe renders
 *      the real /web/video.html, which is a public page and has no business
 *      knowing about Telegram; a scoped token keeps it that way.
 *
 * Both throw httpError on failure so handlers can let them bubble.
 */

import crypto from "node:crypto";
import { httpError } from "./pipeline.js";

const MAX_INITDATA_AGE_SECONDS = 24 * 60 * 60; // Telegram keeps a session's initData stable; a day is generous but bounded
const PREVIEW_TOKEN_TTL_MS = 60 * 60 * 1000;

function botToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw httpError(500, "Server is missing the TELEGRAM_BOT_TOKEN environment variable");
  return token;
}

function hmac(key, message, encoding) {
  return crypto.createHmac("sha256", key).update(message).digest(encoding);
}

/** Constant-time compare that tolerates length mismatches without throwing. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a), "utf8");
  const bufB = Buffer.from(String(b), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies a Telegram Mini App initData string and returns the parsed user.
 *
 * Per Telegram's spec the secret key is HMAC_SHA256(key="WebAppData",
 * message=bot_token), and the signature covers every field except `hash`,
 * sorted alphabetically and joined with newlines.
 *
 * The `signature` field (Telegram's newer Ed25519 signature, meant for
 * third-party validation) is a documented grey area: some clients include it
 * in the HMAC payload and some don't. Rather than guess, we accept either —
 * both variants are still fully HMAC-verified against the bot token, so this
 * costs nothing in security and avoids a class of silent auth failures.
 */
export function verifyInitData(initData) {
  if (!initData || typeof initData !== "string") {
    throw httpError(401, "Missing Telegram initData");
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw httpError(401, "initData is missing its hash");

  const fields = [];
  for (const [key, value] of params.entries()) {
    if (key !== "hash") fields.push([key, value]);
  }

  const secretKey = hmac("WebAppData", botToken());
  const checkString = (pairs) =>
    pairs
      .slice()
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

  const candidates = [fields];
  if (params.has("signature")) candidates.push(fields.filter(([k]) => k !== "signature"));

  const matched = candidates.some((pairs) => safeEqual(hmac(secretKey, checkString(pairs), "hex"), hash));
  if (!matched) throw httpError(401, "initData failed signature verification");

  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || Date.now() / 1000 - authDate > MAX_INITDATA_AGE_SECONDS) {
    throw httpError(401, "initData has expired — reopen the editor from Telegram");
  }

  let user;
  try {
    user = JSON.parse(params.get("user") || "null");
  } catch {
    throw httpError(401, "initData contains an unreadable user field");
  }
  if (!user || !user.id) throw httpError(401, "initData has no user");

  // Single-operator site: only the configured chat owner may read or publish
  // drafts, even though a valid signature only proves "some Telegram user".
  const owner = String(process.env.TELEGRAM_CHAT_ID || "").trim();
  if (owner && String(user.id) !== owner) {
    throw httpError(403, "This editor is limited to the site owner");
  }

  return user;
}

/** Pulls initData from the header the Mini App sends, or the request body. */
export function requireWebAppUser(event, payload = {}) {
  const fromHeader =
    event.headers?.["x-telegram-initdata"] || event.headers?.["X-Telegram-InitData"] || "";
  return verifyInitData(fromHeader || payload.initData || "");
}

/** Mints a short-lived token scoping the bearer to one draft's preview. */
export function signPreviewToken(draftKey) {
  const expiresAt = Date.now() + PREVIEW_TOKEN_TTL_MS;
  const body = `${draftKey}.${expiresAt}`;
  return `${body}.${hmac(botToken(), body, "hex")}`;
}

/** Returns the draftKey a preview token authorises, or throws. */
export function verifyPreviewToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw httpError(401, "Malformed preview token");

  const [draftKey, expiresAt, signature] = parts;
  const body = `${draftKey}.${expiresAt}`;
  if (!safeEqual(hmac(botToken(), body, "hex"), signature)) {
    throw httpError(401, "Preview token failed signature verification");
  }
  if (!Number(expiresAt) || Number(expiresAt) < Date.now()) {
    throw httpError(401, "Preview token has expired — reopen the preview from the editor");
  }
  return draftKey;
}
