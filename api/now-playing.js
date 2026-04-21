import fetch from 'node-fetch';

const basic = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
const NOW_PLAYING_ENDPOINT = 'https://api.spotify.com/v1/me/player/currently-playing';
const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';

const getAccessToken = async () => {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Spotify Token Error:', errorText);
    throw new Error(`Refresh Token Failed: ${response.status}`);
  }

  return response.json();
};

const getNowPlaying = async () => {
  const { access_token } = await getAccessToken();

  return fetch(NOW_PLAYING_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  });
};

export default async function handler(req, res) {
  const origin = req.headers.origin;
  const allowedOrigins = ['https://www.pointonelab.com', 'https://pointonelab.com'];

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  // FORCE VERCEL TO FETCH FRESH DATA EVERY TIME
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const response = await getNowPlaying();

    // 204 means "Success, but nothing is playing right now"
    if (response.status === 204) {
      return res.status(200).json({ isPlaying: false, status: 'No active playback' });
    }

    // If Spotify returns an error, we want to see it in the Vercel logs
    if (response.status > 400) {
      const errorData = await response.text();
      console.error(`Spotify API Error (${response.status}):`, errorData);
      return res.status(200).json({ isPlaying: false, error: 'Spotify API error', code: response.status });
    }

    const song = await response.json();
    
    if (!song || !song.item) {
      return res.status(200).json({ isPlaying: false });
    }

    return res.status(200).json({
      isPlaying: song.is_playing,
      title: song.item.name,
      artist: song.item.artists.map((_artist) => _artist.name).join(', '),
      album: song.item.album.name,
      albumImageUrl: song.item.album.images[0].url,
      songUrl: song.item.external_urls.spotify,
    });
  } catch (error) {
    console.error('Serverless Function Error:', error.message);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}
