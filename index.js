// ====== СЫРОМАНИЯ — Telegram Webhook Backend ======
// ⚠️ СЕКРЕТЫ В КОДЕ — ТОЛЬКО ЕСЛИ ПРОЕКТ НЕ ПУБЛИЧНЫЙ!
// Рекомендация: после запуска переведи на .env и ревокни токен.

// --- ТВОИ СЕКРЕТЫ (вшито по просьбе) ---
const BOT_TOKEN = "8471372842:AAESenmIMBk8627-Y6e1iDOwnBds6pmu0zI"; // токен бота из @BotFather
const ADMIN_ID = 449468735; // твой Telegram ID из @userinfobot

// --- ПУБЛИЧНЫЙ URL ТВОЕГО ХОСТА (Render) ---
// Нужен для /setWebhook-хелпера. Должен указывать ровно на корень, который принимает POST апдейты.
const PUBLIC_URL = "https://puzzlebot-webhook-handler1.onrender.com/";

// --- ПОДГОТОВКА СЕРВЕРА ---
const express = require("express");
const bodyParser = require("body-parser");
const https = require("https");
const cors = require("cors");

const app = express();
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(bodyParser.json({ limit: "1mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ TG API ---
function tgRequest(method, payloadObj) {
  const data = JSON.stringify(payloadObj || {});
  const options = {
    hostname: "api.telegram.org",
    path: `/bot${BOT_TOKEN}/${method}`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
    },
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let chunks = "";
      res.on("data", (d) => (chunks += d));
      res.on("end", () => {
        try {
          resolve(JSON.parse(chunks));
        } catch (e) {
          resolve(chunks);
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function sendMessage(chatId, text, parse_mode = "HTML") {
  return tgRequest("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode,
    disable_web_page_preview: true,
  });
}

// --- ХЕЛПЕРЫ ФОРМАТИРОВАНИЯ ---
function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatAdminMessage(payload, user) {
  const u = user || {};
  const username = u.username ? `@${u.username}` : "—";
  const fio = [u.first_name, u.last_name].filter(Boolean).join(" ") || "—";

  const phone = payload.contact_phone || "—";
  const address = payload.delivery_address || "—";
  const comment = payload.comment || "—";
  const total = payload.total || 0;

  let lines = "";
  (payload.items || []).forEach((item) => {
    const name = item.name || "—";
    const variant = item.variant || "—";
    const qty = item.qty || 0;
    const lineTotal = item.line_total ?? "";
    lines += `— ${escapeHtml(name)} (${escapeHtml(variant)}) × ${qty}${
      lineTotal ? ` = ${lineTotal} ₽` : ""
    }\n`;
  });

  const when = payload?.meta?.ts
    ? new Date(payload.meta.ts).toLocaleString("ru-RU")
    : new Date().toLocaleString("ru-RU");

  return (
    `🛒 <b>Новый заказ из Mini App</b>\n\n` +
    `🕒 <b>Время:</b> ${escapeHtml(when)}\n` +
    `👤 <b>Пользователь:</b> ${escapeHtml(fio)} (${escapeHtml(username)})\n` +
    `🆔 <b>ID:</b> ${u.id}\n\n` +
    `📞 <b>Телефон:</b> ${escapeHtml(phone)}\n` +
    `📍 <b>Адрес:</b> ${escapeHtml(address)}\n` +
    `📝 <b>Комментарий:</b> ${escapeHtml(comment)}\n\n` +
    `📦 <b>Состав заказа:</b>\n` +
    `${lines || "—"}\n` +
    `💰 <b>Итого:</b> ${total} ₽`
  );
}

// --- ОСНОВНОЙ ВЕБХУК: TG → НАШ СЕРВЕР ---
app.post("/", async (req, res) => {
  try {
    const update = req.body;
    console.log("Received webhook:", JSON.stringify(update, null, 2));

    // 1) /start или текстовые сообщения — просто ответим-визитка
    if (update.message && update.message.text && !update.message.web_app_data) {
      const chatId = update.message.chat.id;
      await sendMessage(
        chatId,
        "👋 Я принимаю заказы из мини-приложения <b>Сыромания</b>.\n" +
          "Открой мини-приложение, собери корзину и нажми «Отправить» — заказ придёт админу."
      );
      return res.sendStatus(200);
    }

    // 2) Заказ из mini-app приходит тут
    if (update.message && update.message.web_app_data) {
      const user = update.message.from;
      let payload = {};
      try {
        payload = JSON.parse(update.message.web_app_data.data || "{}");
      } catch (e) {
        await sendMessage(
          user.id,
          "❌ Не удалось разобрать данные заказа. Попробуйте ещё раз."
        );
        return res.sendStatus(200);
      }

      // Сообщение админу
      const adminText = formatAdminMessage(payload, user);
      await sendMessage(ADMIN_ID, adminText);

      // Подтверждение пользователю
      await sendMessage(
        user.id,
        "✅ Заказ получен!\n" +
          "Мы скоро свяжемся для подтверждения и согласования доставки. Спасибо! 🙌"
      );

      return res.sendStatus(200);
    }

    // 3) Прочие апдейты — игнорируем молча
    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(200);
  }
});

// --- ХЭЛСЧЕК ---
app.get("/health", (req, res) => res.status(200).send("ok"));

// --- ХЕЛПЕРЫ ДЛЯ УСТАНОВКИ/СБРОСА ВЕБХУКА ---
app.get("/setWebhook", async (req, res) => {
  try {
    const r = await tgRequest("setWebhook", { url: PUBLIC_URL });
    res.status(200).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/deleteWebhook", async (req, res) => {
  try {
    const r = await tgRequest("deleteWebhook", {});
    res.status(200).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/getWebhookInfo", async (req, res) => {
  try {
    const r = await tgRequest("getWebhookInfo", {});
    res.status(200).json(r);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// --- ЗАПУСК ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server listening on :${PORT}`);
});
