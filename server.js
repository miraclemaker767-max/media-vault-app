const express = require('express');
const { MongoClient } = require('mongodb');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());

// Enable CORS for frontend requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Serve static frontend files from your root directory
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
// 1. TELEGRAM WEBHOOK (Logs payload & handles posts/documents)
// -------------------------------------------------------------
app.post('/telegram-webhook', async (req, res) => {
  const update = req.body;
  console.log('📥 Incoming webhook payload:', JSON.stringify(update));

  try {
    const post = update.channel_post || update.message;

    if (post && (post.video || post.document)) {
      const media = post.video || post.document;
      
      const videoData = {
        message_id: post.message_id,
        file_id: media.file_id,
        title: post.caption || 'VIP Private Video',
        thumbnail: '',
        destination: `https://t.me/PrivateVIPVault/${post.message_id}`,
        isManual: true,
        source: 'Telegram Private Vault',
        date: post.date || Date.now()
      };

      if (db) {
        await db.collection('videos').updateOne(
          { message_id: videoData.message_id },
          { $set: videoData },
          { upsert: true }
        );
        console.log(`📹 Successfully saved video message #${videoData.message_id} to MongoDB!`);
      } else {
        console.error('❌ Database connection not established yet.');
      }
    }

    // Handle delete command (e.g. "/delete 145")
    if (update.message && update.message.text && update.message.text.startsWith('/delete')) {
      const parts = update.message.text.split(' ');
      const messageIdToDelete = parseInt(parts[1]);

      if (messageIdToDelete && db) {
        await db.collection('videos').deleteOne({ message_id: messageIdToDelete });
        console.log(`🗑️ Deleted video message #${messageIdToDelete} from database`);
      }
    }
  } catch (error) {
    console.error('❌ Webhook error processing update:', error);
  }

  res.sendStatus(200);
});

// -------------------------------------------------------------
// 2. FETCH TELEGRAM PRIVATE VIDEOS
// -------------------------------------------------------------
app.get('/api/telegram-videos', async (req, res) => {
  try {
    if (!db) return res.json({ success: true, videos: [] });
    const videos = await db.collection('videos').find({}).sort({ date: -1 }).toArray();
    res.json({ success: true, videos });
  } catch (error) {
    console.error('Error fetching Telegram videos:', error);
    res.status(500).json({ success: false, videos: [] });
  }
});

// Compatibility alias
app.get('/api/get-videos', (req, res) => {
  res.redirect('/api/telegram-videos');
});

// -------------------------------------------------------------
// 3. EPORNER CATALOG INTEGRATION (Secure thumbnails)
// -------------------------------------------------------------
app.get('/api/videos', async (req, res) => {
  try {
    const response = await axios.get('https://www.eporner.com/api/v2/video/search/?query=hd&per_page=20&format=json');
    
    const epornerVideos = response.data.videos.map(video => {
      let thumb = video.default_thumb.src || '';
      if (thumb.startsWith('//')) thumb = `https:${thumb}`;
      else if (thumb.startsWith('http://')) thumb = thumb.replace('http://', 'https://');

      return {
        id: video.id,
        title: video.title,
        destination: video.url,
        thumbnail: thumb,
        duration: video.duration,
        isManual: false
      };
    });

    res.json({ success: true, videos: epornerVideos });
  } catch (error) {
    console.error('Error fetching Eporner catalog:', error);
    res.status(500).json({ success: false, videos: [] });
  }
});

// Compatibility alias
app.get('/api/eporner-videos', (req, res) => {
  res.redirect('/api/videos');
});

// -------------------------------------------------------------
// 4. TELEGRAM STARS PAYMENT INVOICE PLACEHOLDER
// -------------------------------------------------------------
app.get('/api/create-invoice', async (req, res) => {
  try {
    res.json({ success: false, message: 'Invoice system initialized' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Invoice creation failed' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
