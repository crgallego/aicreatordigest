/**
 * Minimal Telegram Bot API client — just the calls this pipeline needs.
 * Requires TELEGRAM_BOT_TOKEN in the environment.
 */

const API_BASE = "https://api.telegram.org";

function apiUrl(method) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN environment variable");
  return `${API_BASE}/bot${token}/${method}`;
}

async function call(method, body) {
  const res = await fetch(apiUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description || res.status}`);
  }
  return data.result;
}

/** Sends a message with optional inline keyboard buttons. Returns the sent
 * message's id, needed later to edit it or to correlate a reply back to it. */
export async function sendMessage(chatId, text, { buttons } = {}) {
  const result = await call("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: false,
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
  return result.message_id;
}

/** Sends a photo with an HTML caption and optional inline keyboard buttons.
 * Used for "unprocessed" cards (candidate queue, draft review) so they stand
 * out visually from the plain-text history lines left behind after a
 * decision. Returns the sent message's id. */
export async function sendPhoto(chatId, photoUrl, caption, { buttons } = {}) {
  const result = await call("sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption: caption.length > 1024 ? `${caption.slice(0, 1021)}...` : caption,
    parse_mode: "HTML",
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
  return result.message_id;
}

/**
 * Sends a card as a photo, falling back to a text message if Telegram will not
 * take the image.
 *
 * Telegram fetches the photo URL itself and rejects the entire request if it
 * dislikes what comes back ("wrong type of the web page content", "failed to
 * get HTTP URL content"), which costs the whole card — buttons included — over
 * nothing but a thumbnail. Observed 2026-07-29. The card is the point; the
 * picture is decoration.
 */
export async function sendCard(chatId, photoUrl, caption, { buttons } = {}) {
  try {
    return await sendPhoto(chatId, photoUrl, caption, { buttons });
  } catch (err) {
    console.warn(`sendPhoto failed (${err.message}); falling back to a text card`);
    return sendMessage(chatId, caption, { buttons });
  }
}

/** Removes a message outright — used once a decision (published, rejected,
 * discarded) is final, so the card is gone rather than sitting there edited. */
export async function deleteMessage(chatId, messageId) {
  return call("deleteMessage", { chat_id: chatId, message_id: messageId });
}

/** Escapes text for Telegram's HTML parse mode (a small tag subset, not full HTML). */
export function escapeTelegramHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
