// ====== СЫРОМАНИЯ — Telegram Webhook Backend (упрощённый и надёжный) ======
// ⚠️ СЕКРЕТЫ В КОДЕ — оставлены по вашей просьбе. Потом перенесите в .env и ревокните токен.

// --- СЕКРЕТЫ ---
const BOT_TOKEN = "8471372842:AAESenmIMBk8627-Y6e1iDOwnBds6pmu0zI"; // токен бота из @BotFather
const ADMIN_ID = 449468735; // ваш Telegram ID (убедитесь, что нажали /start этому боту)
const PUBLIC_URL = "https://puzzlebot-webhook-handler1.onrender.com/"; // URL для setWebhook (если нужен)

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
function tgRequest(method, payloadObj) {
  const data = JSON.stringify(payloadObj || {});
  const options = {
    hostname: "api.telegram.org",
    path: `/bot${BOT_TOKEN}/${method}`,
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

function sendMessage(chatId, text, parse_mode = "HTML") {
  return tgRequest("sendMessage", { chat_id: chatId, text, parse_mode, disable_web_page_preview: true });
}

// --- ХЕЛПЕРЫ ---
function escapeHtml(s = "") {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Универсальный форматтер: понимает payload и из WebApp (axios), и через web_app_data
function buildAdminText(payload, userFromUpdate) {
  const p = payload || {};
  const u = (p.telegram && p.telegram.user) || userFromUpdate || {};

  const username = u.username ? `@${u.username}` : "—";
  const fio = [u.first_name, u.last_name].filter(Boolean).join(" ") || "—";

  // поддержим несколько вариантов названий полей
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

// --- МАРШРУТ 1: Прямой заказ из мини-приложения (axios POST) ---
// Это самый простой путь: фронт шлёт JSON на /order, а мы пингуем админа.
app.post("/order", async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload || payload.type !== "cart") {
      return res.status(400).json({ ok: false, error: "Bad payload" });
    }

    // Сообщение админу
    const adminText = buildAdminText(payload, null);
    await sendMessage(ADMIN_ID, adminText);

    // Если фронт передал telegram.user.id — подтвердим пользователю тоже
    const userId = payload.telegram?.user?.id;
    if (userId) {
      await sendMessage(userId, "✅ Заказ получен!\nМы свяжемся для подтверждения. Спасибо! 🙌");
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("/order error:", e);
    return res.status(200).json({ ok: false });
  }
});

// --- МАРШРУТ 2: TG WEBHOOK — если решите отправлять данные через WebApp.sendData ---
app.post("/", async (req, res) => {
  try {
    const update = req.body || {};
    console.log("Received webhook:", JSON.stringify(update, null, 2));

    // A) Текстовое сообщение (например, /start) — визитка
    if (update.message && update.message.text && !update.message.web_app_data) {
      const chatId = update.message.chat.id;
      await sendMessage(
        chatId,
        "👋 Я принимаю заказы из мини‑приложения <b>Сыромания</b>.\nОткрой мини‑приложение, собери корзину и нажми «Отправить» — заказ придёт админу."
      );
      return res.sendStatus(200);
    }

    // B) Данные, присланные из WebApp через WebApp.sendData(...)
    if (update.message && update.message.web_app_data) {
      const user = update.message.from;
      let payload = {};
      try {
        payload = JSON.parse(update.message.web_app_data.data || "{}");
      } catch (e) {
        await sendMessage(user.id, "❌ Не удалось разобрать данные заказа. Попробуйте ещё раз.");
        return res.sendStatus(200);
      }

      const adminText = buildAdminText(payload, user);
      await sendMessage(ADMIN_ID, adminText);
      await sendMessage(user.id, "✅ Заказ получен!\nМы скоро свяжемся для подтверждения и доставки. Спасибо! 🙌");
      return res.sendStatus(200);
    }

    // C) Если случайно пришёл прямой JSON заказа на корень "/" — тоже обработаем (для совместимости)
    if (update && update.type === "cart") {
      const adminText = buildAdminText(update, update.telegram?.user || null);
      await sendMessage(ADMIN_ID, adminText);
      const userId = update.telegram?.user?.id;
      if (userId) await sendMessage(userId, "✅ Заказ получен! Мы свяжемся.");
      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    return res.sendStatus(200);
  }
});

// --- ХЭЛСЧЕК ---
app.get("/health", (req, res) => res.status(200).send("ok"));

// --- ХЕЛПЕРЫ ДЛЯ УСТАНОВКИ/СБРОСА ВЕБХУКА (нужны только для варианта sendData) ---
app.get("/setWebhook", async (req, res) => {
  try { const r = await tgRequest("setWebhook", { url: PUBLIC_URL }); res.status(200).json(r); }
  catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get("/deleteWebhook", async (req, res) => {
  try { const r = await tgRequest("deleteWebhook", {}); res.status(200).json(r); }
  catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get("/getWebhookInfo", async (req, res) => {
  try { const r = await tgRequest("getWebhookInfo", {}); res.status(200).json(r); }
  catch (e) { res.status(500).json({ error: String(e) }); }
});

// --- ЗАПУСК ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server listening on :${PORT}`));
