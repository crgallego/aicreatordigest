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

/** Edits an existing message's text, typically to reflect a decision
 * (published / rejected) and to remove its buttons. */
export async function editMessageText(chatId, messageId, text, { buttons } = {}) {
  return call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : { reply_markup: { inline_keyboard: [] } }),
  });
}

/** Must be called after every callback_query, even just to acknowledge it —
 * otherwise Telegram leaves the button showing a loading spinner. Make's own
 * scenarios answer the callback directly (so the toast fires instantly,
 * before any slow work), so this stays here for direct/local use only. */
export async function answerCallbackQuery(callbackQueryId, text) {
  return call("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text, show_alert: false } : {}),
  });
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
