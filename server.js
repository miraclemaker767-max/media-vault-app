const express = require("express");
const cors = require("cors");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const BOT_TOKEN = process.env.BOT_TOKEN;
let telegramVault = [];

app.get("/health", (_req, res) => res.status(200).send("OK"));

// --- TELEGRAM WEBHOOK ---
app.post("/telegram-webhook", async (req, res) => {
  const update = req.body;

  try {
    const post = update.channel_post || update.message;

    if (post && post.text && post.text.startsWith("/delete")) {
      const parts = post.text.trim().split(/\s+/);
      const targetId = parts[1];
      if (targetId) {
        telegramVault = telegramVault.filter(
          v => String(v.message_id) !== String(targetId) && v.id !== String(targetId)
        );
      }
      return res.sendStatus(200);
    }

    if (post && (post.video || post.document)) {
      const media = post.video || post.document;
      const fileId = media.file_id;

      const rawChatId = String(post.chat.id).replace("-100", "");
      const privateLink = `https://t.me/c/${rawChatId}/${post.message_id}`;

      let directVideoUrl = privateLink;
      if (BOT_TOKEN) {
        try {
          const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
          const fileData = await fileRes.json();
          if (fileData.ok && fileData.result.file_path) {
            directVideoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
          }
        } catch (e) {}
      }

      let thumbnailUrl = "";
      if (BOT_TOKEN && (media.thumbnail || media.thumb)) {
        try {
          const thumbObj = media.thumbnail || media.thumb;
          const thumbRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${thumbObj.file_id}`);
          const thumbData = await thumbRes.json();
          if (thumbData.ok && thumbData.result.file_path) {
            thumbnailUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${thumbData.result.file_path}`;
          }
        } catch (e) {}
      }

      const videoItem = {
        id: String(fileId),
        message_id: post.message_id,
        title: post.caption || `VIP Video #${post.message_id}`,
        thumbnail: thumbnailUrl,
        watchUrl: directVideoUrl,
        targetUrl: privateLink,
        isManual: true,
        source: "Telegram Private Vault"
      };

      telegramVault = telegramVault.filter(v => v.id !== videoItem.id && v.message_id !== videoItem.message_id);
      telegramVault.unshift(videoItem);
    }
  } catch (err) {
    console.error("Webhook error:", err);
  }

  res.sendStatus(200);
});

app.get("/api/telegram-videos", (_req, res) => {
  res.json(telegramVault);
});

app.get("/api/create-invoice", async (_req, res) => {
  try {
    if (!BOT_TOKEN) return res.status(400).json({ error: "Bot token missing" });

    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "VIP Vault Pass",
        description: "Lifetime access to private VIP video stream",
        payload: "vip_access_pass",
        currency: "XTR",
        prices: [{ label: "VIP Pass", amount: 100 }]
      })
    });

    const data = await response.json();
    if (data.ok && data.result) {
      res.json({ invoiceLink: data.result });
    } else {
      res.status(400).json({ error: "Invoice creation failed" });
    }
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
