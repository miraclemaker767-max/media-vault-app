const express = require("express");
const cors = require("cors");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const BOT_TOKEN = process.env.BOT_TOKEN;

// In-memory array for private channel videos
let telegramVault = [];

app.get("/health", (_req, res) => res.status(200).send("OK"));

// --- VIDEO & THUMBNAIL PROXY ROUTE (Fixes CORS & Video Playback) ---
app.get("/api/proxy", async (req, res) => {
  const fileId = req.query.file_id;
  if (!fileId || !BOT_TOKEN) {
    return res.status(400).send("Missing file_id or bot token");
  }

  try {
    // 1. Get real file path from Telegram
    const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();

    if (!fileData.ok || !fileData.result.file_path) {
      return res.status(404).send("File not found on Telegram");
    }

    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;

    // 2. Fetch stream from Telegram with Range headers if requested by video player
    const headers = {};
    if (req.headers.range) {
      headers["Range"] = req.headers.range;
    }

    const mediaRes = await fetch(fileUrl, { headers });

    // 3. Forward stream headers to browser
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Content-Type", mediaRes.headers.get("content-type") || "video/mp4");
    
    if (mediaRes.headers.get("content-length")) {
      res.setHeader("Content-Length", mediaRes.headers.get("content-length"));
    }
    if (mediaRes.headers.get("accept-ranges")) {
      res.setHeader("Accept-Ranges", mediaRes.headers.get("accept-ranges"));
    }
    if (mediaRes.headers.get("content-range")) {
      res.setHeader("Content-Range", mediaRes.headers.get("content-range"));
      res.status(206); // Partial Content for seeking
    } else {
      res.status(mediaRes.status);
    }

    // Pipe stream directly to browser
    const arrayBuffer = await mediaRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));

  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).send("Error streaming media");
  }
});

// --- TELEGRAM WEBHOOK ---
app.post("/telegram-webhook", async (req, res) => {
  const update = req.body;

  try {
    const post = update.channel_post || update.message;

    // Handle Deletion Command: /delete [message_id]
    if (post && post.text && post.text.startsWith("/delete")) {
      const parts = post.text.trim().split(/\s+/);
      const targetId = parts[1];
      if (targetId) {
        telegramVault = telegramVault.filter(
          v => String(v.message_id) !== String(targetId) && v.id !== String(targetId)
        );
        console.log(`🗑️ Removed video #${targetId} from vault.`);
      }
      return res.sendStatus(200);
    }

    // Process Incoming Video Post
    if (post && (post.video || post.document)) {
      const media = post.video || post.document;
      const fileId = media.file_id;

      const rawChatId = String(post.chat.id).replace("-100", "");
      const privateLink = `https://t.me/c/${rawChatId}/${post.message_id}`;

      let thumbFileId = "";
      if (media.thumbnail || media.thumb) {
        thumbFileId = (media.thumbnail || media.thumb).file_id;
      }

      const videoItem = {
        id: String(fileId),
        file_id: fileId,
        thumb_file_id: thumbFileId,
        message_id: post.message_id,
        title: post.caption || `VIP Video #${post.message_id}`,
        targetUrl: privateLink,
        isManual: true,
        source: "Telegram Private Vault"
      };

      telegramVault = telegramVault.filter(v => v.id !== videoItem.id && v.message_id !== videoItem.message_id);
      telegramVault.unshift(videoItem);

      console.log(`📹 Added video #${post.message_id} to vault!`);
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
  }

  res.sendStatus(200);
});

// --- VAULT API ENDPOINT ---
app.get("/api/telegram-videos", (_req, res) => {
  const host = _req.protocol + "://" + _req.get("host");

  // Map videos to internal proxy URLs
  const proxiedVault = telegramVault.map(v => ({
    ...v,
    watchUrl: `${host}/api/proxy?file_id=${v.file_id}`,
    thumbnail: v.thumb_file_id ? `${host}/api/proxy?file_id=${v.thumb_file_id}` : ""
  }));

  res.json(proxiedVault);
});

// --- TELEGRAM STARS INVOICE ---
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
      res.status(400).json({ error: "Invoice creation failed", details: data });
    }
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
