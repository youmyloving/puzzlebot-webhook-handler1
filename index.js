// --- КАРТА СООТВЕТСТВИЯ ТОВАРОВ ---
const PUZZLEBOT_PRODUCT_MAP = {
  "panir-classic": 100003,
  "panir-herbs": 100004,
  "panir-spicy": 100005,
  "panir-smoked": 100006,
  suluguni: 100007,
  "suluguni-smoked": 100008,
  imeretian: 100009,
  "imeretian-dill-garlic": 100010,
  halloumi: 100011,
  "halloumi-paprika-oregano": 100012,
  "halloumi-tomato-basil-garlic": 100013,
  "halloumi-tomato-paprika": 100014,
  kosichka: 100001,
  "kosichka-smoked": 100002,
  "spicy-klubok": 100015,
  mozzarella: 100016,
  buratta: 100017,
  ricotta: 100018,
  "ricotta-herbs": 100019,
  caciotta: 100020,
  "caciotta-fenugreek": 100021,
  "hard-village": 100022,
  "hard-smoked": 100023,
  "rolls-olives-walnut": 100024,
  "rolls-apricot-cedar": 100025,
  milk: 100042,
  "milk-topped": 100043,
  ryazhenka: 100044,
  whey: 100046,
  cream: 100045,
  tvorog: 100047,
  butter: 100048,
  ghee: 100049,
  "condensed-milk": 100050,
  "tvorozhnaya-massa": 100052,
  "cookies-tvorog": 100034,
  "cookies-oat": 100035,
  "cookies-nut": 100036,
  "cookies-carob": 100037,
  "cookies-sandy": 100038,
  "muffin-plain": 100054,
  "muffin-carob": 100055,
  "muffin-raisin": 100056,
  "muffin-mix-plain-raisin": 100057,
  "muffin-mix-plain-carob": 100058,
  "muffin-mix-raisin-carob": 100059,
  "sandesh-orange": 100026,
  "sandesh-walnut": 100028,
  "sandesh-carob": 100027,
  "barfi-classic": 100029,
  "barfi-hazelnut": 100030,
  "barfi-sesame": 100031,
  halva: 100032,
  "potato-cake-5": 100033,
  "casserole-plain": 100039,
  "casserole-raisin": 100040,
  "crazy-cake": 100041,
  "coconut-kuchen-1kg": 100060,
  "napoleon-1kg": 100061,
  "apple-pie": 100062,
  "bliny-10": 100063,
  "syrniki-10": 100064,
  "chapati-10": 100065,
  "misthi-dahi": 1000067,
};

// --- ID АДМИНИСТРАТОРА ---
// !!! ВАЖНО: Замените 123456789 на ваш реальный Telegram ID (узнать у бота @userinfobot)
const ADMIN_ID = 449468735;

// --- ТОКЕН ВАШЕГО БОТА ---
// !!! ВАЖНО: Вставьте сюда токен, который вы получили от @BotFather
const BOT_TOKEN = "8471372842:AAESenmIMBk8627-Y6e1iDOwnBds6pmu0zI";

// --- ОСНОВНОЙ КОД СЕРВЕРА (НЕ МЕНЯТЬ) ---
const express = require("express");
const bodyParser = require("body-parser");
const https = require("https");
const cors = require("cors");

const app = express();

app.use(
  cors({
    origin: "*", // Или укажите конкретный домен вашего веб-приложения
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(bodyParser.json());

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const sendMessage = async (chatId, text) => {
  const data = JSON.stringify({
    chat_id: chatId,
    text: text,
    parse_mode: "Markdown",
  });

  const options = {
    hostname: "api.telegram.org",
    path: `/bot${BOT_TOKEN}/sendMessage`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": data.length,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      res.on("data", (d) => {
        resolve(d);
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
};

app.post("/", async (req, res) => {
  console.log("Received webhook:", JSON.stringify(req.body, null, 2));

  const update = req.body;

  if (update.message && update.message.web_app_data) {
    const user = update.message.from;
    let payload;
    payload = JSON.parse(update.message.web_app_data.data);

    try {
      console.log(payload);
    } catch (e) {
      await sendMessage(
        user.id,
        "❌ Не удалось прочитать данные заказа. Пожалуйста, попробуйте еще раз."
      );
      return res.sendStatus(200);
    }

    let adminMessage = `🛒 *Новый заказ от Mini App!*\n\n`;
    adminMessage += `👤 Пользователь: ${user.first_name} ${
      user.last_name || ""
    } (@${user.username || "no_username"})\n`;
    adminMessage += `🆔 ID: ${user.id}\n\n`;
    adminMessage += `📦 *Состав заказа:*\n`;

    payload.items.forEach((item) => {
      adminMessage += `— ${item.name} (${item.variant}) - ${item.qty} шт.\n`;
    });

    adminMessage += `\n💰 *Итоговая сумма:* ${payload.total} ₽`;

    await sendMessage(ADMIN_ID, adminMessage);

    let userMessage = "✅ Ваш заказ успешно получен!\n\n";
    userMessage += "Мы свяжемся с вами в ближайшее время для подтверждения.";
    await sendMessage(user.id, userMessage);
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
