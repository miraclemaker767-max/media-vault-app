const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();
app.use(express.json());

// Pull connection string from Render Environment Variables
const MONGO_URI = process.env.MONGODB_URI;

let db;

// Connect to MongoDB Atlas
MongoClient.connect(MONGO_URI)
  .then(client => {
    console.log('✅ Connected successfully to MongoDB Atlas');
    db = client.db('telegramApp'); // Database name
  })
  .catch(error => console.error('❌ MongoDB Connection Error:', error));

// -------------------------------------------------------------
// 1. TELEGRAM WEBHOOK (Handles New Posts & Delete Commands)
// -------------------------------------------------------------
app.post('/telegram-webhook', async (req, res) => {
  const update = req.body;

  try {
    // A. Detect new video posted in your Telegram channel
    if (update.channel_post && update.channel_post.video) {
      const videoData = {
        message_id: update.channel_post.message_id,
        file_id: update.channel_post.video.file_id,
        caption: update.channel_post.caption || 'VIP Video',
        date: update.channel_post.date || Date.now()
      };

      if (db) {
        await db.collection('videos').updateOne(
          { message_id: videoData.message_id },
          { $set: videoData },
          { upsert: true }
        );
        console.log(`📹 Saved video message #${videoData.message_id} to Database`);
      }
    }

    // B. Detect delete command sent to bot (e.g. "/delete 145")
    if (update.message && update.message.text && update.message.text.startsWith('/delete')) {
      const parts = update.message.text.split(' ');
      const messageIdToDelete = parseInt(parts[1]);

      if (messageIdToDelete && db) {
        await db.collection('videos').deleteOne({ message_id: messageIdToDelete });
        console.log(`🗑️ Deleted video message #${messageIdToDelete} from Database via command.`);
      }
    }
  } catch (error) {
    console.error('Error handling webhook update:', error);
  }

  res.sendStatus(200);
});

// -------------------------------------------------------------
// 2. FETCH VIDEOS FOR MINI APP (Persists across refreshes!)
// -------------------------------------------------------------
app.get('/api/get-videos', async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database not connected yet' });
    }

    // Pull all videos directly from MongoDB
    const videos = await db.collection('videos').find({}).sort({ date: -1 }).toArray();
    res.json({ success: true, videos });
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({ success: false, videos: [] });
  }
});

// -------------------------------------------------------------
// 3. DELETE VIDEO ENDPOINT (Optional backup if triggered via code/UI)
// -------------------------------------------------------------
app.post('/api/delete-video', async (req, res) => {
  const { message_id } = req.body;

  try {
    if (db) {
      await db.collection('videos').deleteOne({ message_id: parseInt(message_id) });
      console.log(`🗑️ Deleted video message #${message_id} from Database`);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting video:', error);
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
