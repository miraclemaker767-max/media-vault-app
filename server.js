const express = require('express');
const { MongoClient } = require('mongodb');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());

// Serve static frontend files from your project root or a 'public' folder
app.use(express.static(__dirname));

const MONGO_URI = process.env.MONGODB_URI;
let db;

// Connect to MongoDB Atlas
MongoClient.connect(MONGO_URI)
  .then(client => {
    console.log('✅ Connected successfully to MongoDB Atlas');
    db = client.db('telegramApp');
  })
  .catch(error => console.error('❌ MongoDB Connection Error:', error));

// -------------------------------------------------------------
// 1. TELEGRAM WEBHOOK (New Posts & Delete Commands)
// -------------------------------------------------------------
app.post('/telegram-webhook', async (req, res) => {
  const update = req.body;

  try {
    if (update.channel_post && update.channel_post.video) {
      const videoData = {
        message_id: update.channel_post.message_id,
        file_id: update.channel_post.video.file_id,
        title: update.channel_post.caption || 'VIP Video',
        thumbnail: '', 
        url: `https://t.me/your_channel/${update.channel_post.message_id}`,
        date: update.channel_post.date || Date.now()
      };

      if (db) {
        await db.collection('videos').updateOne(
          { message_id: videoData.message_id },
          { $set: videoData },
          { upsert: true }
        );
        console.log(`📹 Saved video message #${videoData.message_id}`);
      }
    }

    if (update.message && update.message.text && update.message.text.startsWith('/delete')) {
      const parts = update.message.text.split(' ');
      const messageIdToDelete = parseInt(parts[1]);

      if (messageIdToDelete && db) {
        await db.collection('videos').deleteOne({ message_id: messageIdToDelete });
        console.log(`🗑️ Deleted video message #${messageIdToDelete}`);
      }
    }
  } catch (error) {
    console.error('Webhook error:', error);
  }

  res.sendStatus(200);
});

// -------------------------------------------------------------
// 2. FETCH TELEGRAM VIDEOS FROM MONGODB
// -------------------------------------------------------------
app.get('/api/get-videos', async (req, res) => {
  try {
    if (!db) return res.json({ success: true, videos: [] });
    const videos = await db.collection('videos').find({}).sort({ date: -1 }).toArray();
    res.json({ success: true, videos });
  } catch (error) {
    res.status(500).json({ success: false, videos: [] });
  }
});

// -------------------------------------------------------------
// 3. EPORNER CATALOG INTEGRATION
// -------------------------------------------------------------
app.get('/api/eporner-videos', async (req, res) => {
  try {
    const response = await axios.get('https://www.eporner.com/api/v2/video/search/?query=hd&per_page=20&format=json');
    
    const epornerVideos = response.data.videos.map(video => ({
      id: video.id,
      title: video.title,
      url: video.url,
      thumbnail: video.default_thumb.src.startsWith('http') ? video.default_thumb.src : `https:${video.default_thumb.src}`,
      duration: video.duration
    }));

    res.json({ success: true, videos: epornerVideos });
  } catch (error) {
    console.error('Error fetching Eporner catalog:', error);
    res.status(500).json({ success: false, videos: [] });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
