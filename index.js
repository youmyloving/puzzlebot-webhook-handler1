// ====== СЫРОМАНИЯ — Telegram Webhook Backend (2‑бота: отдельный заказной бот) ======
// ⚠️ СЕКРЕТЫ В КОДЕ оставлены по вашей просьбе. Потом перенесите в .env и ревокните токены.

// --- ENV / СЕКРЕТЫ ---
// Новый БОТ ТОЛЬКО ДЛЯ ЗАКАЗОВ (используется для отправки сообщений админу и пользователю)
const ORDER_BOT_TOKEN = process.env.ORDER_BOT_TOKEN || "8486413223:AAFSpmYn4CjBUq4sWvFvE9Y7_9I9cmPbA70";
// ID администратора, кому слать заказы (начните диалог с ботом, чтобы он мог вам писать)
const ADMIN_ID = Number(process.env.ADMIN_ID || "449468735");
// Публичный базовый URL вашего Render без завершающего "/" (для вебхука нового бота, если нужен)
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "https://puzzlebot-webhook-handler1.onrender.com";

// Если у вас есть ещё один «старый» бот под ПазлБота — он не мешает:
// мы используем ДРУГОЙ токен (ORDER_BOT_TOKEN), так что конфликта вебхуков не будет.

// --- ЗАВИСИМОСТИ ---
const express = require("express");
const bodyParser = require("body-parser");
const https = require("https");
const cors = require("cors");

const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization"] }));
app.use(bodyParser.json({ limit: "1mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ TG API ---
function tgRequest(botToken, method, payloadObj) {
  const data = JSON.stringify(payloadObj || {});
  const options = {
    hostname: "api.telegram.org",
    path: `/bot${botToken}/${method}`,
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let chunks = "";
      res.on("data", (d) => (chunks += d));
      res.on("end", () => {
        try { resolve(JSON.parse(chunks)); } catch (e) { resolve(chunks); }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function sendOrderBotMessage(chatId, text, parse_mode = "HTML") {
  return tgRequest(ORDER_BOT_TOKEN, "sendMessage", { chat_id: chatId, text, parse_mode, disable_web_page_preview: true });
}

// --- ХЕЛПЕРЫ ---
function escapeHtml(s = "") {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildAdminText(payload, userFromUpdate) {
  const p = payload || {};
  const u = (p.telegram && p.telegram.user) || userFromUpdate || {};
  const username = u.username ? `@${u.username}` : "—";
  const fio = [u.first_name, u.last_name].filter(Boolean).join(" ") || "—";
  const phone = p.contact?.phone || p.contact_phone || p.phone || "—";
  const address = p.contact?.address || p.delivery_address || p.address || "—";
  const comment = p.contact?.comment || p.comment || "—";
  const total = p.total || 0;
  let lines = "";
  (p.items || []).forEach((item) => {
    const name = item.name || "—";
    const variant = item.variant || "—";
    const qty = item.qty || 0;
    const lineTotal = item.line_total ?? "";
    lines += `— ${escapeHtml(name)} (${escapeHtml(variant)}) × ${qty}${lineTotal ? ` = ${lineTotal} ₽` : ""}\n`;
  });
  const when = p?.meta?.ts ? new Date(p.meta.ts).toLocaleString("ru-RU") : new Date().toLocaleString("ru-RU");
  return (
    `🛒 <b>Новый заказ из Mini App</b>\n\n` +
    `🕒 <b>Время:</b> ${escapeHtml(when)}\n` +
    `👤 <b>Пользователь:</b> ${escapeHtml(fio)} (${escapeHtml(username)})\n` +
    `🆔 <b>ID:</b> ${u.id || "—"}\n\n` +
    `📞 <b>Телефон:</b> ${escapeHtml(phone)}\n` +
    `📍 <b>Адрес:</b> ${escapeHtml(address)}\n` +
    `📝 <b>Комментарий:</b> ${escapeHtml(comment)}\n\n` +
    `📦 <b>Состав заказа:</b>\n` +
    `${lines || "—"}\n` +
    `💰 <b>Итого:</b> ${total} ₽`
  );
}

// --- 1) ПРЯМОЙ ПРИЁМ ЗАКАЗОВ С ФРОНТА (axios POST) ---
// Рекомендуемый путь: фронт шлёт JSON на /order, а мы рассылаем из «заказного» бота.
app.post("/order", async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload || payload.type !== "cart") return res.status(400).json({ ok: false, error: "Bad payload" });

    const adminText = buildAdminText(payload, null);
    await sendOrderBotMessage(ADMIN_ID, adminText);

    const userId = payload.telegram?.user?.id;
    if (userId) await sendOrderBotMessage(userId, "✅ Заказ получен!\nМы свяжемся для подтверждения. Спасибо! 🙌");

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("/order error:", e);
    return res.status(200).json({ ok: false });
  }
});

// --- 2) ВЕБХУК НОВОГО ЗАКАЗНОГО БОТА (необязательно, только если захотите sendData) ---
// Настройка вебхука: GET /setWebhook?bot=order → url будет `${PUBLIC_BASE_URL}/order-bot-webhook`
app.post("/order-bot-webhook", async (req, res) => {
  try {
    const update = req.body || {};

    // A) Текстовое /start и т.п. — визитка
    if (update.message && update.message.text && !update.message.web_app_data) {
      const chatId = update.message.chat.id;
      await sendOrderBotMessage(chatId, "👋 Я принимаю заказы из мини‑приложения <b>Сыромания</b>.\nСоберите корзину и нажмите «Отправить» — заказ придёт админу.");
      return res.sendStatus(200);
    }

    // B) Данные из WebApp.sendData(JSON)
    if (update.message && update.message.web_app_data) {
      const user = update.message.from;
      let payload = {};
      try { payload = JSON.parse(update.message.web_app_data.data || "{}"); }
      catch (e) {
        await sendOrderBotMessage(user.id, "❌ Не удалось разобрать данные заказа. Попробуйте ещё раз.");
        return res.sendStatus(200);
      }
      const adminText = buildAdminText(payload, user);
      await sendOrderBotMessage(ADMIN_ID, adminText);
      await sendOrderBotMessage(user.id, "✅ Заказ получен!\nМы скоро свяжемся для подтверждения и доставки. Спасибо! 🙌");
      return res.sendStatus(200);
    }

    // C) Если случайно прислали JSON заказа прямо сюда
    if (update && update.type === "cart") {
      const adminText = buildAdminText(update, update.telegram?.user || null);
      await sendOrderBotMessage(ADMIN_ID, adminText);
      const userId = update.telegram?.user?.id;
      if (userId) await sendOrderBotMessage(userId, "✅ Заказ получен! Мы свяжемся.");
      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("/order-bot-webhook error:", err);
    return res.sendStatus(200);
  }
});

// --- HEALTH ---
app.get("/health", (req, res) => res.status(200).send("ok"));

// --- ХЕЛПЕРЫ УПРАВЛЕНИЯ ВЕБХУКОМ ДЛЯ ЗАКАЗНОГО БОТА ---
app.get("/setWebhook", async (req, res) => {
  try {
    const which = (req.query.bot || "").toLowerCase();
    if (which !== "order") return res.status(400).json({ error: "specify ?bot=order" });
    const url = `${PUBLIC_BASE_URL.replace(/\/$/, "")}/order-bot-webhook`;
    const r = await tgRequest(ORDER_BOT_TOKEN, "setWebhook", { url });
    res.status(200).json(r);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get("/deleteWebhook", async (req, res) => {
  try {
    const which = (req.query.bot || "").toLowerCase();
    if (which !== "order") return res.status(400).json({ error: "specify ?bot=order" });
    const r = await tgRequest(ORDER_BOT_TOKEN, "deleteWebhook", {});
    res.status(200).json(r);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get("/getWebhookInfo", async (req, res) => {
  try {
    const which = (req.query.bot || "").toLowerCase();
    if (which !== "order") return res.status(400).json({ error: "specify ?bot=order" });
    const r = await tgRequest(ORDER_BOT_TOKEN, "getWebhookInfo", {});
    res.status(200).json(r);
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

// --- ЗАПУСК ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server listening on :${PORT}`));
