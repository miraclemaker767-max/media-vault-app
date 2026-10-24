const express = require("express");
const cors = require("cors");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files (index.html)
app.use(express.static(__dirname));

const BOT_TOKEN = process.env.BOT_TOKEN;

// In-memory array to store incoming private channel videos
let telegramVault = [];

// --- HEALTH CHECK ---
app.get("/health", (_req, res) => res.status(200).send("OK"));

// --- 1. TELEGRAM WEBHOOK (Receives video posts automatically) ---
app.post("/telegram-webhook", async (req, res) => {
  const update = req.body;
  console.log("📥 Incoming Telegram Webhook:", JSON.stringify(update));

  try {
    const post = update.channel_post || update.message;

    if (post && (post.video || post.document)) {
      const media = post.video || post.document;
      const fileId = media.file_id;

      // Extract raw channel ID (removes -100 for t.me/c/ deep link format)
      const rawChatId = String(post.chat.id).replace("-100", "");
      const privateLink = `https://t.me/c/${rawChatId}/${post.message_id}`;

      // Get direct streamable video URL from Telegram
      let directVideoUrl = privateLink;
      if (BOT_TOKEN) {
        try {
          const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
          const fileData = await fileRes.json();
          if (fileData.ok && fileData.result.file_path) {
            directVideoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
          }
        } catch (e) {
          console.error("Failed to resolve direct file path:", e);
        }
      }

      // Extract thumbnail if present
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
        title: post.caption || "VIP Private Video",
        thumbnail: thumbnailUrl,
        watchUrl: directVideoUrl,
        targetUrl: privateLink,
        isManual: true,
        source: "Telegram Private Vault"
      };

      // Add to front of list (avoid duplicates)
      telegramVault = telegramVault.filter(v => v.id !== videoItem.id);
      telegramVault.unshift(videoItem);

      console.log(`📹 Added video #${post.message_id} to vault! Total: ${telegramVault.length}`);
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
  }

  res.sendStatus(200);
});

// --- 2. GET TELEGRAM VIDEOS ENDPOINT ---
app.get("/api/telegram-videos", (_req, res) => {
  res.json({ videos: telegramVault });
});

// --- 3. EPORNER CATALOG ENDPOINT ---
// --- 3. EPORNER CATALOG ENDPOINT (Returns direct array format) ---
app.get("/api/videos", async (_req, res) => {
  try {
    const response = await fetch("https://www.eporner.com/api/v2/video/search/?query=hd&per_page=30&format=json");
    const data = await response.json();

    const items = Array.isArray(data.videos) ? data.videos : [];
    const normalizedVideos = items.map(v => {
      let thumb = v.default_thumb?.src || v.embed_url || "";
      if (thumb.startsWith("//")) thumb = `https:${thumb}`;
      else if (thumb.startsWith("http://")) thumb = thumb.replace("http://", "https://");

      return {
        id: String(v.id || v.url),
        title: v.title || "Featured Video",
        thumbnail: thumb,
        targetUrl: v.url,
        url: v.url,
        isManual: false,
        source: "Eporner"
      };
    });

    // Return direct array so index.html processes it instantly
    res.json(normalizedVideos);
  } catch (err) {
    console.error("Catalog fetch error:", err);
    res.json([]);
  }
});

// --- 4. TELEGRAM STARS PAYMENT ---
app.get("/api/create-invoice", async (_req, res) => {
  try {
    if (!BOT_TOKEN) return res.status(400).json({ error: "Bot token not configured" });

    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "VIP Vault Pass",
        description: "Unlock lifetime ad-free access to private VIP channel videos",
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
