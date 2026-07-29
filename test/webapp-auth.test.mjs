/* Security tests for the Mini App auth boundary. Builds real Telegram-format
 * initData with a known bot token and checks that valid payloads pass, and
 * that every tampering / expiry / wrong-user case is rejected. */
import assert from "node:assert";
import crypto from "node:crypto";

const BOT_TOKEN = "123456:TEST-BOT-TOKEN";
process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
process.env.TELEGRAM_CHAT_ID = "1000000000";

const auth = await import(
  "../netlify/functions/lib/webapp-auth.js"
);

/** Builds correctly-signed initData exactly the way Telegram does. */
function makeInitData(fields) {
  const pairs = Object.entries(fields);
  const checkString = pairs
    .slice()
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

const nowSec = Math.floor(Date.now() / 1000);
const owner = JSON.stringify({ id: 1000000000, first_name: "Chris" });

function expectThrows(fn, label) {
  assert.throws(fn, label);
}

/* ===================== happy path ===================== */

const valid = makeInitData({ auth_date: String(nowSec), query_id: "AAA", user: owner });
const user = auth.verifyInitData(valid);
assert.equal(user.id, 1000000000);
console.log("verifyInitData: OK — correctly-signed initData accepted");

// Telegram's newer Ed25519 `signature` field must not break HMAC validation,
// whichever way the client folds it into the signed payload.
const withSig = makeInitData({
  auth_date: String(nowSec),
  signature: "some-ed25519-sig",
  user: owner,
});
assert.equal(auth.verifyInitData(withSig).id, 1000000000);
console.log("verifyInitData: OK — payloads carrying a `signature` field still validate");

/* ===================== rejection cases ===================== */

expectThrows(() => auth.verifyInitData(""), "empty initData must be rejected");
expectThrows(() => auth.verifyInitData("user=x&auth_date=1"), "initData with no hash must be rejected");

// Flip one character of the payload while keeping the original hash.
const tampered = valid.replace("Chris", "Mallory");
expectThrows(() => auth.verifyInitData(tampered), "tampered payload must fail verification");
console.log("verifyInitData: OK — tampered payload rejected");

// A hash computed with a different bot token must not pass.
const forged = (() => {
  const fields = { auth_date: String(nowSec), user: owner };
  const checkString = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update("999:WRONG-TOKEN").digest();
  const hash = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
})();
expectThrows(() => auth.verifyInitData(forged), "initData signed by another bot must be rejected");
console.log("verifyInitData: OK — payload signed with a different bot token rejected");

const stale = makeInitData({ auth_date: String(nowSec - 60 * 60 * 48), user: owner });
expectThrows(() => auth.verifyInitData(stale), "stale initData must be rejected");
console.log("verifyInitData: OK — expired initData rejected");

// Correctly signed, but not the site owner — signature alone must not authorise.
const stranger = makeInitData({
  auth_date: String(nowSec),
  user: JSON.stringify({ id: 111222333, first_name: "Someone" }),
});
expectThrows(() => auth.verifyInitData(stranger), "a non-owner Telegram user must be rejected");
console.log("verifyInitData: OK — valid signature from a different user still rejected");

/* ===================== preview tokens ===================== */

const token = auth.signPreviewToken("abc123");
assert.equal(auth.verifyPreviewToken(token), "abc123");
console.log("previewToken: OK — round-trips to the draft key it was minted for");

expectThrows(() => auth.verifyPreviewToken("abc123.9999999999999.deadbeef"), "forged signature must fail");
expectThrows(() => auth.verifyPreviewToken("nonsense"), "malformed token must fail");

// An expired-but-authentically-signed token must still be refused.
const expiredBody = `abc123.${Date.now() - 1000}`;
const expiredSig = crypto.createHmac("sha256", BOT_TOKEN).update(expiredBody).digest("hex");
expectThrows(() => auth.verifyPreviewToken(`${expiredBody}.${expiredSig}`), "expired token must fail");
console.log("previewToken: OK — forged, malformed, and expired tokens all rejected");

// A token for one draft must not grant access to another.
assert.notEqual(auth.verifyPreviewToken(auth.signPreviewToken("other999")), "abc123");
console.log("previewToken: OK — tokens are scoped to a single draft");

console.log("\nALL WEBAPP-AUTH TESTS PASSED");
