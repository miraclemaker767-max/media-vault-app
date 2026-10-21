const https = require('https');

module.exports = (req, res) => {
    // Set CORS headers so GitHub Pages & Telegram can freely connect
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const TARGET_DESTINATION_URL = "https://t.me/your_telegram_channel";

    const options = {
        hostname: 'www.eporner.com',
        path: '/api/v2/video/search/?query=trending&per_page=18&format=json',
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
    };

    const apiReq = https.request(options, (apiRes) => {
        let data = '';
        apiRes.on('data', (chunk) => { data += chunk; });
        apiRes.on('end', () => {
            try {
                const parsedData = JSON.parse(data);
                if (!parsedData.videos || parsedData.videos.length === 0) {
                    return res.status(404).json({ error: "No videos found" });
                }

                const cleanList = parsedData.videos.map(v => ({
                    id: v.id,
                    title: v.title,
                    thumbnail: v.default_thumb ? v.default_thumb.src : (v.thumbs && v.thumbs[0] ? v.thumbs[0].src : ''),
                    targetUrl: TARGET_DESTINATION_URL
                }));

                return res.status(200).json(cleanList);
            } catch (err) {
                return res.status(500).json({ error: "JSON parse error" });
            }
        });
    });

    apiReq.on('error', () => {
        return res.status(500).json({ error: "Failed to connect to API" });
    });

    apiReq.end();
};