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

// Webhook listener
app.post("/telegram-webhook", async (req, res) => {
  const update = req.body;

  try {
    const post = update.channel_post || update.message;

    // Handle delete command: /delete [message_id]
    if (post && post.text && post.text.startsWith("/delete")) {
      const parts = post.text.split(" ");
      const targetId = parts[1];
      if (targetId) {
        telegramVault = telegramVault.filter(v => !v.targetUrl.includes(targetId) && v.id !== targetId);
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
        } catch (e) {
          console.error("Error fetching file path:", e);
        }
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
        title: post.caption || "VIP Private Video",
        thumbnail: thumbnailUrl, // Empty if Telegram did not provide one
        watchUrl: directVideoUrl,
        targetUrl: privateLink,
        isManual: true,
        source: "Telegram Private Vault"
      };

      telegramVault = telegramVault.filter(v => v.id !== videoItem.id);
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
