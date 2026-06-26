import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Intercept axios.get to add automatic retries for stalker portal robustness
const originalGet = axios.get;
axios.get = async function (url, config, retries = 3, delay = 1000) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      attempt++;
      return await originalGet.call(axios, url, config);
    } catch (err) {
      console.warn(`[Axios GET Retry] Attempt ${attempt} failed for ${url}: ${err.message}`);
      if (attempt >= retries) {
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Request Logger
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.url}`);
  const originalSend = res.send;
  res.send = function (data) {
    if (res.statusCode >= 400) {
      console.log(`[RESPONSE ERROR] ${res.statusCode} for ${req.method} ${req.url}`);
    }
    originalSend.call(this, data);
  };
  next();
});


// -------------------------------------------------------------
// DATABASE SETUP (Supabase)
// -------------------------------------------------------------
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_iptv_key';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY; // Using service role key for backend access

import WebSocket from 'ws';
globalThis.WebSocket = WebSocket;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase Environment Variables! Please set SUPABASE_URL and SUPABASE_SECRET_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  realtime: {
    transport: WebSocket,
  },
  global: {
    WebSocket,
  },
});
console.log('Connected to Supabase Database');

// Auto-create default admin if no users exist
async function initSupabase() {
  try {
    const { data, error } = await supabase.from('users').select('id').limit(1);
    if (!error && (!data || data.length === 0)) {
      const hash = bcrypt.hashSync('admin', 10);
      const { error: insertErr } = await supabase.from('users').insert([{
        username: 'admin',
        password: hash,
        role: 'admin'
      }]);
      if (!insertErr) {
        console.log('Created default admin user: admin / admin');
      }
    }
  } catch (err) {
    console.error('Supabase init error:', err);
  }
}
initSupabase();

// In-memory store for session tokens, cookies, and resolved load.php paths
const sessionStore = new Map();

// Helper to emulate MAG Set-Top Box headers
function getMagHeaders(mac, token = '') {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
    'X-User-Agent': 'MAG250',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cookie': `mac=${mac}; stb_lang=en; timezone=GMT;`
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

// Normalize and auto-detect load.php path
async function detectLoadPhp(portalUrl, mac) {
  let cleanUrl = portalUrl.replace(/\/+$/, ''); // Strip trailing slashes
  
  // Potential Stalker load.php paths
  const pathsToTry = [
    '/server/load.php',
    '/stalker_portal/server/load.php',
    '/portal.php',
    '/stalker_portal/server/portal.php',
    '/load.php'
  ];

  // If the user already provided load.php, use it directly
  if (cleanUrl.endsWith('.php')) {
    try {
      const res = await axios.get(`${cleanUrl}?type=stb&action=handshake&JsHttpRequest=1-xml`, {
        headers: getMagHeaders(mac),
        timeout: 5000
      });
      if (res.data) return cleanUrl;
    } catch (e) {
      console.log(`Direct check failed for: ${cleanUrl}`);
    }
  }

  // Attempt to strip /c/ if they entered a standard portal portal URL
  if (cleanUrl.endsWith('/c')) {
    cleanUrl = cleanUrl.slice(0, -2);
  }

  for (const p of pathsToTry) {
    const testUrl = `${cleanUrl}${p}`;
    console.log(`Probing: ${testUrl}`);
    try {
      const res = await axios.get(`${testUrl}?type=stb&action=handshake&JsHttpRequest=1-xml`, {
        headers: getMagHeaders(mac),
        timeout: 4000
      });
      // A valid Stalker response typically returns JSON containing a "js" key
      if (res.data && (res.data.js || res.data.js === null || typeof res.data === 'object')) {
        console.log(`Success! Portal URL resolved to: ${testUrl}`);
        return testUrl;
      }
    } catch (err) {
      console.log(`Path ${p} failed: ${err.message}`);
    }
  }

  // Fallback to [portalUrl]/server/load.php
  return `${cleanUrl}/server/load.php`;
}

// -------------------------------------------------------------
// MOCK DATA GENERATOR
// Enables full app usage for testing if "http://mock.iptv" is used
// -------------------------------------------------------------
const mockData = {
  genres: [
    { id: '1', title: 'Entertainment' },
    { id: '2', title: 'Sports & Action' },
    { id: '3', title: 'News & Info' },
    { id: '4', title: 'Movies & Cinema' }
  ],
  channels: [
    { id: '1294764', name: 'HBO HD', number: '101', logo: 'https://images.unsplash.com/photo-1598899134739-24c46f58b8c0?w=120&h=120&fit=crop', cmd: 'ffmpeg http://mock.stream/hbo.ts', genre_id: '4' },
    { id: '1294765', name: 'ESPN Live', number: '102', logo: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=120&h=120&fit=crop', cmd: 'ffmpeg http://mock.stream/espn.ts', genre_id: '2' },
    { id: '1294766', name: 'CNN World', number: '103', logo: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=120&h=120&fit=crop', cmd: 'ffmpeg http://mock.stream/cnn.ts', genre_id: '3' },
    { id: '1294767', name: 'Discovery Channel', number: '104', logo: 'https://images.unsplash.com/photo-1533854775446-95c4609dae4d?w=120&h=120&fit=crop', cmd: 'ffmpeg http://mock.stream/discovery.ts', genre_id: '3' },
    { id: '1294768', name: 'Sky Cinema', number: '105', logo: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=120&h=120&fit=crop', cmd: 'ffmpeg http://mock.stream/skycinema.ts', genre_id: '4' },
    { id: '1294769', name: 'BBC One', number: '106', logo: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=120&h=120&fit=crop', cmd: 'ffmpeg http://mock.stream/bbc1.ts', genre_id: '1' }
  ],
  vodCategories: [
    { id: '1', title: 'Action & Adventure' },
    { id: '2', title: 'Sci-Fi & Fantasy' },
    { id: '3', title: 'Comedy' }
  ],
  movies: [
    { id: '201', name: 'Interstellar Odyssey', category_id: '2', screenshot_uri: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&h=600&fit=crop', cmd: '/media/interstellar.mp4', director: 'Christopher Nolan', year: '2014', rating: '8.7', description: 'A team of explorers travel through a wormhole in space in an attempt to ensure humanity\'s survival.' },
    { id: '202', name: 'Cyber Storm', category_id: '1', screenshot_uri: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=400&h=600&fit=crop', cmd: '/media/cyber.mp4', director: 'Lana Wachowski', year: '2021', rating: '7.2', description: 'A hacker discovers a global conspiracy that threatens the structure of reality itself.' },
    { id: '203', name: 'Midnight Laughs', category_id: '3', screenshot_uri: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=400&h=600&fit=crop', cmd: '/media/laughs.mp4', director: 'Todd Phillips', year: '2019', rating: '8.4', description: 'An aspiring stand-up comedian experiences a series of hilarious mishaps on the streets of New York.' }
  ],
  seriesCategories: [
    { id: '1', title: 'Drama' },
    { id: '2', title: 'Sci-Fi & Mystery' }
  ],
  series: [
    { id: '301', name: 'Chronicles of Mars', category_id: '2', screenshot_uri: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?w=400&h=600&fit=crop', description: 'The struggles and triumphs of the first human colony established on Mars.' },
    { id: '302', name: 'Shadow Protocol', category_id: '1', screenshot_uri: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=400&h=600&fit=crop', description: 'A deep-cover agent goes rogue to expose corruption within the world\'s largest intelligence network.' }
  ],
  episodes: {
    '301': [
      { id: '3011', name: 'Red Dust Rising', season_id: '1', series_number: '1', cmd: '/series/mars_s1_e1.mp4', description: 'The crew faces an unexpected solar storm upon landing.' },
      { id: '3012', name: 'Oxygen Alert', season_id: '1', series_number: '2', cmd: '/series/mars_s1_e2.mp4', description: 'A critical systems failure threatens the colony dome life-support.' },
      { id: '3013', name: 'New Frontiers', season_id: '2', series_number: '1', cmd: '/series/mars_s2_e1.mp4', description: 'One year later, a new spacecraft arrives with unexpected visitors.' }
    ],
    '302': [
      { id: '3021', name: 'The Asset', season_id: '1', series_number: '1', cmd: '/series/shadow_s1_e1.mp4', description: 'Agent Vance is tasked with extracting an elite asset from a hostile zone.' },
      { id: '3022', name: 'Double Cross', season_id: '1', series_number: '2', cmd: '/series/shadow_s1_e2.mp4', description: 'A betrayal forces Vance to flee and assume a new identity.' }
    ]
  }
};

// Helper to clean composite Stalker IDs (like "36499:36499" or "movie_36499" to "36499")
function cleanStalkerId(id) {
  if (!id) return '';
  const str = String(id).trim();
  if (str.includes(':')) {
    const part = str.split(':')[0];
    const match = part.match(/\d+/);
    return match ? match[0] : part;
  }
  const digitsMatch = str.match(/\d+/);
  if (digitsMatch) {
    return digitsMatch[0];
  }
  return str;
}

// -------------------------------------------------------------
// AUTH & ADMIN API ENDPOINTS (Supabase)
// -------------------------------------------------------------

// Middleware for JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
};

// Login Route
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const { data: users, error } = await supabase.from('users').select('*').eq('username', username).limit(1);
  
  if (error || !users || users.length === 0) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const user = users[0];
  if (bcrypt.compareSync(password, user.password)) {
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Verify Token & Get Profiles
app.get('/api/auth/verify', authenticateToken, async (req, res) => {
  // We use * or explicitly list channels and expiry_date if they exist
  // Using * is safer in case columns are missing or added later
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', req.user.id);
    
  if (error) {
    // Fallback to minimal select if * causes issues (unlikely)
    return res.status(500).json({ error: 'DB Error' });
  }
  res.json({ user: req.user, profiles: profiles || [] });
});

// User add their own profile
app.post('/api/auth/profiles', authenticateToken, async (req, res) => {
  const { profile_name, mac, portal_url, channels, expiry_date } = req.body;
  if (!profile_name || !mac || !portal_url) return res.status(400).json({ error: 'Missing fields' });
  
  // Check for duplicate MAC for this user
  const { data: existing } = await supabase.from('profiles')
    .select('id')
    .eq('user_id', req.user.id)
    .eq('mac', mac);
    
  if (existing && existing.length > 0) {
    // If it exists, optionally update it, but for now we skip duplicate creation
    return res.json({ id: existing[0].id, skipped: true, message: 'MAC already exists' });
  }

  // Insert new profile (channels and expiry_date will be ignored by Supabase if columns don't exist yet, wait actually Supabase will throw an error if we pass undefined columns)
  // To be safe, only pass columns that exist. If the user adds them later, we can pass them.
  const insertData = {
    user_id: req.user.id,
    profile_name,
    mac,
    portal_url
  };
  
  // Only add these if the user provides them and we want to try saving them
  if (channels) insertData.channels = channels;
  if (expiry_date) insertData.expiry_date = expiry_date;

  const { data, error } = await supabase.from('profiles').insert([insertData]).select().single();

  if (error) {
    // If error is about missing columns, fallback to basic insert
    if (error.code === 'PGRST204' || error.message.includes('column')) {
      const basicData = { user_id: req.user.id, profile_name, mac, portal_url };
      const fallback = await supabase.from('profiles').insert([basicData]).select().single();
      if (fallback.error) return res.status(500).json({ error: fallback.error.message });
      return res.json({ id: fallback.data.id, profile_name, mac, portal_url });
    }
    return res.status(500).json({ error: error.message });
  }
  
  res.json({ id: data.id, profile_name, mac, portal_url });
});

// User delete their own profile
app.delete('/api/auth/profiles/:id', authenticateToken, async (req, res) => {
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
    
  if (error) return res.status(500).json({ error: 'DB Error' });
  res.json({ success: true });
});

// ------------------- ADMIN ROUTES -------------------

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  const { data: users, error } = await supabase.from('users').select('id, username, role, created_at');
  if (error) return res.status(500).json({ error: 'DB Error' });
  res.json(users);
});

app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  
  const hash = bcrypt.hashSync(password, 10);
  const { data, error } = await supabase.from('users').insert([{
    username,
    password: hash,
    role: role || 'user'
  }]).select().single();

  if (error) {
    return res.status(400).json({ error: error.code === '23505' ? 'Username taken' : 'DB Error' });
  }
  
  res.json({ id: data.id, username, role: role || 'user' });
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  
  const { error } = await supabase.from('users').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'DB Error' });
  res.json({ success: true });
});

app.get('/api/admin/profiles', authenticateToken, requireAdmin, async (req, res) => {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select(`
      id,
      profile_name,
      mac,
      portal_url,
      user_id,
      users:user_id (username)
    `);

  if (error) return res.status(500).json({ error: 'DB Error' });
  
  // Format to match the previous structure
  const formattedProfiles = profiles.map(p => ({
    id: p.id,
    profile_name: p.profile_name,
    mac: p.mac,
    portal_url: p.portal_url,
    user_id: p.user_id,
    user_name: p.users?.username
  }));
  
  res.json(formattedProfiles);
});

app.post('/api/admin/profiles', authenticateToken, requireAdmin, async (req, res) => {
  const { user_id, profile_name, mac, portal_url } = req.body;
  
  const { data, error } = await supabase.from('profiles').insert([{
    user_id,
    profile_name,
    mac,
    portal_url
  }]).select().single();

  if (error) return res.status(500).json({ error: 'DB Error' });
  res.json({ id: data.id, user_id, profile_name, mac, portal_url });
});

app.delete('/api/admin/profiles/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { error } = await supabase.from('profiles').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'DB Error' });
  res.json({ success: true });
});

app.delete('/api/admin/delete-all-profiles', authenticateToken, requireAdmin, async (req, res) => {
  const { error } = await supabase.from('profiles').delete().neq('id', 0); // Delete all
  if (error) return res.status(500).json({ error: 'DB Error' });
  res.json({ success: true });
});


// -------------------------------------------------------------
// STALKER API PROXY ENDPOINTS
// -------------------------------------------------------------

// Perform Handshake & Connect
app.post('/api/connect', async (req, res) => {
  const { portalUrl, mac } = req.body;

  if (!portalUrl || !mac) {
    return res.status(400).json({ error: 'Portal URL and MAC address are required' });
  }

  console.log(`Connection request: URL=${portalUrl}, MAC=${mac}`);

  // Check for Mock Mode
  if (portalUrl.toLowerCase().includes('mock') || portalUrl.includes('127.0.0.1') || portalUrl.includes('localhost:5000')) {
    console.log('Activating Mock Mode for simulation...');
    const sessionToken = 'SiLuLzo3o5MockToken';
    sessionStore.set(mac, {
      portalUrl: 'http://mock.iptv',
      resolvedUrl: 'http://mock.iptv',
      token: sessionToken,
      mac,
      isMock: true
    });
    return res.json({
      status: 'Connected (MOCK)',
      token: sessionToken,
      mac,
      isMock: true,
      profile: {
        sn: '1234567890',
        model: 'MAG250',
        stb_lang: 'en'
      }
    });
  }

  try {
    const resolvedUrl = await detectLoadPhp(portalUrl, mac);
    console.log(`Final Stalker load.php: ${resolvedUrl}`);

    // Send Handshake
    const handshakeUrl = `${resolvedUrl}?type=stb&action=handshake&JsHttpRequest=1-xml`;
    const handshakeRes = await axios.get(handshakeUrl, {
      headers: getMagHeaders(mac),
      timeout: 8000
    });

    console.log('Handshake response headers:', handshakeRes.headers);
    console.log('Handshake response body:', handshakeRes.data);

    let token = '';
    if (handshakeRes.data && handshakeRes.data.js) {
      token = handshakeRes.data.js.token || handshakeRes.data.js;
    }

    if (!token) {
      // Fallback in case response structure is slightly different
      token = handshakeRes.data.token || (typeof handshakeRes.data.js === 'string' ? handshakeRes.data.js : '');
    }

    if (!token) {
      return res.status(401).json({
        error: 'Failed to obtain session token from handshake. Ensure the MAC address is active.',
        details: handshakeRes.data
      });
    }

    // Call get_profile to complete authentication registration
    let profile = {};
    try {
      const profileUrl = `${resolvedUrl}?type=stb&action=get_profile&JsHttpRequest=1-xml`;
      const profileRes = await axios.get(profileUrl, {
        headers: getMagHeaders(mac, token),
        timeout: 5000
      });
      profile = profileRes.data?.js || {};
    } catch (profileErr) {
      console.log('Failed to load profile (non-critical):', profileErr.message);
    }

    // Save session context
    sessionStore.set(mac, {
      portalUrl,
      resolvedUrl,
      token,
      mac,
      isMock: false
    });

    res.json({
      status: 'Connected',
      token,
      mac,
      resolvedUrl,
      isMock: false,
      profile
    });

  } catch (error) {
    console.error('Connection Error:', error.message);
    let errorMsg = 'Failed to connect to the IPTV portal.';
    let isAuthError = false;
    
    if (error.response) {
      if (error.response.status === 401 || error.response.status === 403) {
        errorMsg = 'MAC address unauthorized or blocked by portal.';
        isAuthError = true;
      } else {
        errorMsg = `Portal returned status code ${error.response.status}.`;
      }
    } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      errorMsg = 'Connection timed out. Portal may be offline or port is closed.';
    } else if (error.code === 'ENOTFOUND') {
      errorMsg = 'Portal domain name could not be resolved (DNS error).';
    } else {
      errorMsg = error.message;
    }

    res.status(isAuthError ? 401 : 500).json({
      error: errorMsg,
      details: error.response?.data || error.message
    });
  }
});

// Get Live TV Genres
app.get('/api/genres', async (req, res) => {
  const { mac } = req.query;
  const session = sessionStore.get(mac);

  if (!session) {
    return res.status(401).json({ error: 'Session not found. Please connect first.' });
  }

  if (session.isMock) {
    return res.json({ js: mockData.genres });
  }

  try {
    const url = `${session.resolvedUrl}?type=itv&action=get_genres&JsHttpRequest=1-xml`;
    const response = await axios.get(url, {
      headers: getMagHeaders(session.mac, session.token),
      timeout: 8000
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load genres', details: err.message });
  }
});

// Get Live TV Channels
app.get('/api/channels', async (req, res) => {
  const { mac, genre, page = 1 } = req.query;
  const session = sessionStore.get(mac);

  if (!session) {
    return res.status(401).json({ error: 'Session not found. Please connect first.' });
  }

  if (session.isMock) {
    let filtered = mockData.channels;
    if (genre && genre !== '0' && genre !== 'all') {
      filtered = mockData.channels.filter(c => c.genre_id === genre);
    }
    return res.json({ js: { data: filtered, total_items: filtered.length } });
  }

  try {
    // Stalker get_ordered_list endpoint
    const genreParam = genre && genre !== '0' ? `&genre=${genre}` : '';
    const searchParam = req.query.search ? `&search=${encodeURIComponent(req.query.search)}` : '';
    const url = `${session.resolvedUrl}?type=itv&action=get_ordered_list${genreParam}${searchParam}&fav=0&sortby=number&p=${page}&JsHttpRequest=1-xml`;
    
    const response = await axios.get(url, {
      headers: getMagHeaders(session.mac, session.token),
      timeout: 10000
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load channels', details: err.message });
  }
});

// Get EPG for a Channel
app.get('/api/channels/epg', async (req, res) => {
  const { mac, channelId } = req.query;
  const session = sessionStore.get(mac);

  if (!session) return res.status(401).json({ error: 'Session not found' });
  if (session.isMock) return res.json({ js: [] }); // No mock EPG for now

  try {
    const url = `${session.resolvedUrl}?type=itv&action=get_short_epg&ch_id=${channelId}&limit=10&JsHttpRequest=1-xml`;
    const response = await axios.get(url, {
      headers: getMagHeaders(session.mac, session.token),
      timeout: 5000
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load EPG', details: err.message });
  }
});

// Get Movie Categories (VOD)
app.get('/api/vod/categories', async (req, res) => {
  const { mac } = req.query;
  const session = sessionStore.get(mac);

  if (!session) return res.status(401).json({ error: 'Session not found' });

  if (session.isMock) {
    return res.json({ js: mockData.vodCategories });
  }

  try {
    const url = `${session.resolvedUrl}?type=vod&action=get_categories&JsHttpRequest=1-xml`;
    const response = await axios.get(url, {
      headers: getMagHeaders(session.mac, session.token),
      timeout: 8000
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load VOD categories', details: err.message });
  }
});

// Get VOD Movies List
app.get('/api/vod/movies', async (req, res) => {
  const { mac, category, page = 1 } = req.query;
  const session = sessionStore.get(mac);

  if (!session) return res.status(401).json({ error: 'Session not found' });

  if (session.isMock) {
    let filtered = mockData.movies;
    if (category && category !== 'all' && category !== '0') {
      filtered = mockData.movies.filter(m => m.category_id === category);
    }
    return res.json({ js: { data: filtered, total_items: filtered.length } });
  }

  try {
    const catParam = (category && category !== '0' && category !== 'all') ? `&category=${category}` : '';
    const searchParam = req.query.search ? `&search=${encodeURIComponent(req.query.search)}` : '';
    const url = `${session.resolvedUrl}?type=vod&action=get_ordered_list${catParam}${searchParam}&fav=0&p=${page}&JsHttpRequest=1-xml`;
    const response = await axios.get(url, {
      headers: getMagHeaders(session.mac, session.token),
      timeout: 10000
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load movies', details: err.message });
  }
});

// Get Series Categories
app.get('/api/series/categories', async (req, res) => {
  const { mac } = req.query;
  const session = sessionStore.get(mac);

  if (!session) return res.status(401).json({ error: 'Session not found' });

  if (session.isMock) {
    return res.json({ js: mockData.seriesCategories });
  }

  try {
    // Try type=series first
    const url = `${session.resolvedUrl}?type=series&action=get_categories&JsHttpRequest=1-xml`;
    try {
      const response = await axios.get(url, {
        headers: getMagHeaders(session.mac, session.token),
        timeout: 8000
      });
      const cats = response.data?.js;
      if (cats && Array.isArray(cats) && cats.length > 0) {
        return res.json(response.data);
      }
    } catch (e) {
      console.log('type=series categories failed, trying type=vod fallback...');
    }

    // Fallback to VOD categories
    const fallbackUrl = `${session.resolvedUrl}?type=vod&action=get_categories&JsHttpRequest=1-xml`;
    const response = await axios.get(fallbackUrl, {
      headers: getMagHeaders(session.mac, session.token),
      timeout: 8000
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load series categories', details: err.message });
  }
});

// Get TV Series List
app.get('/api/series/list', async (req, res) => {
  const { mac, category, page = 1 } = req.query;
  const session = sessionStore.get(mac);

  if (!session) return res.status(401).json({ error: 'Session not found' });

  if (session.isMock) {
    let filtered = mockData.series;
    if (category && category !== 'all' && category !== '0') {
      filtered = mockData.series.filter(s => s.category_id === category);
    }
    return res.json({ js: { data: filtered } });
  }

  try {
    const catParam = category && category !== '0' ? `&category=${category}` : '';
    const searchParam = req.query.search ? `&search=${encodeURIComponent(req.query.search)}` : '';

    // Primary: type=series
    const seriesUrl = `${session.resolvedUrl}?type=series&action=get_ordered_list${catParam}${searchParam}&p=${page}&JsHttpRequest=1-xml`;
    try {
      const response = await axios.get(seriesUrl, {
        headers: getMagHeaders(session.mac, session.token),
        timeout: 10000
      });
      const items = response.data?.js?.data;
      if (items && Array.isArray(items) && items.length > 0) {
        // Preserve the raw ID — critical for season lookups
        const normalized = items.map(item => ({
          ...item,
          id: item.id,
          video_id: item.id
        }));
        return res.json({
          js: { ...response.data.js, data: normalized }
        });
      }
    } catch (e) {
      console.log('type=series list failed, falling back to type=vod...');
    }

    // Fallback: type=vod filtered by is_series
    const vodUrl = `${session.resolvedUrl}?type=vod&action=get_ordered_list${catParam}${searchParam}&movie_id=0&p=${page}&JsHttpRequest=1-xml`;
    const response = await axios.get(vodUrl, {
      headers: getMagHeaders(session.mac, session.token),
      timeout: 10000
    });

    if (response.data?.js?.data) {
      const filtered = response.data.js.data
        .filter(item => {
          const v = item.is_series;
          return v === 1 || v === '1' || v === true || String(v).toLowerCase() === 'true';
        })
        .map(item => ({ ...item, id: item.id, video_id: item.id }));
      return res.json({ js: { ...response.data.js, data: filtered } });
    }
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load series list', details: err.message });
  }
});

// Get TV Series Seasons
// This portal uses a 3-level hierarchy:
//   Level 1 (season_id=0):  returns "parts" — each item has series=[1,2,...,N]
//   Level 2 (season_id={partId}): returns actual seasons — name="Season N", id=actualSeasonId
//   Level 3 (season_id={actualSeasonId}): returns episodes
app.get('/api/series/seasons', async (req, res) => {
  const { mac, seriesId } = req.query;
  const session = sessionStore.get(mac);

  if (!session) return res.status(401).json({ error: 'Session not found' });

  if (session.isMock) {
    const mockEps = mockData.episodes[seriesId] || [];
    const seasonsSet = new Set(mockEps.map(ep => ep.season_id || '1'));
    const seasonsList = Array.from(seasonsSet)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .map(s => ({ id: s, name: `Season ${s}`, season_number: s }));
    return res.json({ js: seasonsList });
  }

  // Helper: detect if an item is a "part" (multi-season container) vs an actual season
  function isPart(item) {
    const s = item.series;
    // series field is an array with >1 element → it's a part
    if (Array.isArray(s) && s.length > 1) return true;
    // season_number contains commas → comma-separated season list
    if (typeof item.season_number === 'string' && item.season_number.includes(',')) return true;
    return false;
  }

  // Helper: extract a numeric season number from an item that IS an actual season
  function extractSeasonNum(item, fallback) {
    // Items that are actual seasons usually have name="Season N"
    if (item.name) {
      const m = item.name.match(/(\d+)/);
      if (m) return parseInt(m[1]);
    }
    if (item.season_number && !String(item.season_number).includes(',')) {
      return parseInt(item.season_number) || fallback;
    }
    const s = item.series;
    if (Array.isArray(s) && s.length === 1) return parseInt(s[0]) || fallback;
    if (typeof s === 'number') return s;
    return fallback;
  }

  const typesToTry = ['series', 'vod'];

  for (const contentType of typesToTry) {
    try {
      // ── Level 1: call with season_id=0 ──
      const level1Url = `${session.resolvedUrl}?type=${contentType}&action=get_ordered_list&movie_id=${encodeURIComponent(seriesId)}&season_id=0&episode_id=0&JsHttpRequest=1-xml`;
      console.log(`[Seasons L1] type=${contentType} seriesId=${seriesId}`);

      const level1Res = await axios.get(level1Url, {
        headers: getMagHeaders(session.mac, session.token),
        timeout: 10000
      });

      const l1Raw = level1Res.data;
      console.log(`[Seasons L1] Response:`, JSON.stringify(l1Raw).slice(0, 600));

      const l1Data = l1Raw?.js?.data || l1Raw?.js || [];
      const l1Items = Array.isArray(l1Data) ? l1Data : [];

      if (l1Items.length === 0) {
        console.log(`[Seasons L1] No items, trying next type...`);
        continue;
      }

      // Determine if these are "parts" (multi-season containers) or actual seasons
      const containsParts = l1Items.some(item => isPart(item));

      if (containsParts) {
        // ── Level 2: drill into each part to get actual seasons ──
        console.log(`[Seasons L2] Detected ${l1Items.length} parts, drilling into each...`);
        const allSeasons = [];
        const seenIds = new Set();

        for (const part of l1Items) {
          try {
            const level2Url = `${session.resolvedUrl}?type=${contentType}&action=get_ordered_list&movie_id=${encodeURIComponent(seriesId)}&season_id=${encodeURIComponent(part.id)}&episode_id=0&JsHttpRequest=1-xml`;
            console.log(`[Seasons L2] Fetching part id=${part.id}`);

            const level2Res = await axios.get(level2Url, {
              headers: getMagHeaders(session.mac, session.token),
              timeout: 10000
            });

            const l2Data = level2Res.data?.js?.data || level2Res.data?.js || [];
            const l2Items = Array.isArray(l2Data) ? l2Data : [];
            console.log(`[Seasons L2] Part ${part.id} returned ${l2Items.length} items. Sample:`, JSON.stringify(l2Items[0]).slice(0, 200));

            for (let idx = 0; idx < l2Items.length; idx++) {
              const s = l2Items[idx];
              const sid = String(s.id || `${part.id}_${idx}`);
              if (seenIds.has(sid)) continue;
              seenIds.add(sid);
              const seasonNum = extractSeasonNum(s, allSeasons.length + 1);
              allSeasons.push({
                id: sid,
                name: `Season ${seasonNum}`,
                season_number: String(seasonNum)
              });
            }
          } catch (err) {
            console.log(`[Seasons L2] Failed for part ${part.id}: ${err.message}`);
          }
        }

        if (allSeasons.length > 0) {
          // Sort by season number
          allSeasons.sort((a, b) => parseInt(a.season_number) - parseInt(b.season_number));
          console.log(`[Seasons] Resolved ${allSeasons.length} seasons via 3-level drill`);
          return res.json({ js: allSeasons });
        }

        // If drill-down returned nothing, fall back to treating l1Items as seasons
        console.log(`[Seasons] Drill-down empty, treating level-1 items as seasons`);
      }

      // Items ARE individual seasons (2-level portal) — map them directly
      const seasons = l1Items.map((item, idx) => {
        const seasonNum = extractSeasonNum(item, idx + 1);
        return {
          id: String(item.id || idx + 1),
          name: `Season ${seasonNum}`,
          season_number: String(seasonNum)
        };
      });

      // Deduplicate by id and sort
      const seen = new Set();
      const unique = seasons.filter(s => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      }).sort((a, b) => parseInt(a.season_number) - parseInt(b.season_number));

      console.log(`[Seasons] Resolved ${unique.length} seasons (2-level) for seriesId=${seriesId}`);
      return res.json({ js: unique });

    } catch (err) {
      console.log(`[Seasons] Failed with type=${contentType}: ${err.message}`);
    }
  }

  // Fallback
  console.log(`[Seasons] No seasons found. Returning Season 1 fallback.`);
  return res.json({ js: [{ id: '1', name: 'Season 1', season_number: '1' }] });
});

// Get Episodes for a Specific Season
// Stalker: movie_id={seriesId}&season_id={actualSeasonId} → returns actual episodes
app.get('/api/series/episodes', async (req, res) => {
  const { mac, seriesId, seasonId } = req.query;
  const session = sessionStore.get(mac);

  if (!session) return res.status(401).json({ error: 'Session not found' });

  if (session.isMock) {
    const list = mockData.episodes[seriesId] || [];
    const filtered = seasonId ? list.filter(ep => ep.season_id === seasonId) : list;
    return res.json({ js: { data: filtered } });
  }

  const typesToTry = ['series', 'vod'];

  for (const contentType of typesToTry) {
    try {
      let page = 1;
      let allEpisodes = [];
      let totalItems = 0;
      let loopProtect = 0;

      while (loopProtect < 10) {
        loopProtect++;
        const url = `${session.resolvedUrl}?type=${contentType}&action=get_ordered_list&movie_id=${encodeURIComponent(seriesId)}&season_id=${encodeURIComponent(seasonId)}&episode_id=0&p=${page}&JsHttpRequest=1-xml`;
        console.log(`[Episodes] Page ${page} (type=${contentType}) series=${seriesId} season=${seasonId}`);

        const response = await axios.get(url, {
          headers: getMagHeaders(session.mac, session.token),
          timeout: 10000
        });

        const raw = response.data;
        if (page === 1) {
          console.log(`[Episodes] Raw page 1 sample:`, JSON.stringify(raw).slice(0, 600));
        }

        const data = raw?.js?.data || raw?.js || [];
        const items = Array.isArray(data) ? data : [];

        if (items.length === 0) break;

        if (page === 1) {
          totalItems = parseInt(raw?.js?.total_items || 0);

          // Detect if items look like "parts" or "seasons" rather than actual episodes
          // Real episodes have a cmd field (even if it's a base64 stub)
          const itemsAreSeasonsOrParts = items.every(item => {
            const hasCmdContent = item.cmd && item.cmd.trim() !== '' && item.cmd !== '0';
            return !hasCmdContent;
          });

          if (itemsAreSeasonsOrParts && items.length < 30) {
            console.log(`[Episodes] Items appear to be seasons/parts, not episodes for type=${contentType}. Skipping.`);
            break;
          }
        }

        allEpisodes = [...allEpisodes, ...items];

        if (totalItems > 0 && allEpisodes.length >= totalItems) break;
        if (items.length < 14) break;
        page++;
      }

      if (allEpisodes.length > 0) {
        // If the portal returned multiple seasons/parts, filter to the requested season
        if (seasonId && seasonId !== '0') {
          const matchingSeasons = allEpisodes.filter(item => String(item.id) === String(seasonId) || String(item.season_id) === String(seasonId) || String(item.season_number) === String(seasonId));
          if (matchingSeasons.length > 0) {
            allEpisodes = matchingSeasons;
          }
        }

        // Handle expansion: if the portal returned seasons (with a `series` array) instead of individual episodes,
        // we need to expand them into individual episodes.
        let expandedEpisodes = [];
        for (const item of allEpisodes) {
          const seriesArr = item.series;
          if (Array.isArray(seriesArr) && seriesArr.length > 0 && (!item.cmd || item.cmd.trim() === '' || item.cmd === '0' || /^[A-Za-z0-9+/]+=*$/.test(item.cmd))) {
            // Expand this item into multiple episodes based on the series array
            seriesArr.forEach(epNum => {
              expandedEpisodes.push({
                ...item,
                id: `${item.id}_${epNum}`,
                name: `Episode ${epNum}`,
                series_number: String(epNum),
                cmd: item.cmd
              });
            });
          } else {
            expandedEpisodes.push(item);
          }
        }

        // Filter out any items without a cmd (those are not playable episodes)
        const playable = expandedEpisodes.filter(ep => ep.cmd && ep.cmd.trim() !== '' && ep.cmd !== '0');
        const finalList = playable.length > 0 ? playable : expandedEpisodes;
        console.log(`[Episodes] Loaded ${finalList.length} episodes (type=${contentType})`);
        return res.json({ js: { data: finalList, total_items: finalList.length } });
      }
    } catch (err) {
      console.log(`[Episodes] Failed with type=${contentType}: ${err.message}`);
    }
  }

  return res.json({ js: { data: [] } });
});

// Resolve Play Link (create_link)
app.post('/api/create_link', async (req, res) => {
  const { mac, cmd, type = 'itv', series } = req.body;
  const session = sessionStore.get(mac);

  if (!session) return res.status(401).json({ error: 'Session not found' });

  if (session.isMock) {
    const streamId = cmd.split('/').pop().replace('.ts', '').replace('.mp4', '');
    const sampleHlsStream = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
    
    const customUrl = `http://procdnnet.eu:80/play/live.php?mac=${mac}&stream=${streamId}&extension=ts&play_token=${session.token}`;
    console.log(`Mock created link: ${customUrl} (resolves to ${sampleHlsStream} internally)`);
    return res.json({
      js: {
        id: streamId,
        cmd: customUrl,
        realUrl: sampleHlsStream
      }
    });
  }

  try {
    const cleanCmd = cmd.replace(/^(ffmpeg|ffrt|direc|mpv|auto)\s+/, '').trim();

    if (cleanCmd.startsWith('http://') || cleanCmd.startsWith('https://')) {
      if (cleanCmd.includes('stream=') && !cleanCmd.includes('stream=&') && !cleanCmd.includes('stream=.')) {
        console.log(`[Create Link] Bypassing: fully formed URL with stream ID: ${cleanCmd}`);
        return res.json({ js: { cmd: cleanCmd } });
      }
    }

    let linkType = type;
    if (/^[A-Za-z0-9+/]+=*$/.test(cleanCmd) && cleanCmd.length > 20 && !cleanCmd.includes('/') && !cleanCmd.includes(':')) {
      try {
        const decoded = Buffer.from(cleanCmd, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded);
        console.log(`[Create Link] Detected base64 JSON cmd:`, parsed);
        // Force vod type for create_link since Stalker portals usually only have this action for vod/itv
        linkType = 'vod';
      } catch (_) {
      }
    }

    let url = `${session.resolvedUrl}?type=${linkType}&action=create_link&cmd=${encodeURIComponent(cmd)}&JsHttpRequest=1-xml`;
    if (series !== undefined && series !== null && series !== '') {
      url += `&series=${encodeURIComponent(series)}`;
    }
    
    console.log(`[Create Link] Calling: ${url}`);
    const response = await axios.get(url, {
      headers: getMagHeaders(session.mac, session.token),
      timeout: 10000
    });

    console.log(`[Create Link] Response:`, response.data);

    let rawCmd = response.data?.js?.cmd || response.data?.js || '';
    if (typeof rawCmd === 'string') {
      rawCmd = rawCmd.replace(/^(ffmpeg|ffrt|direc|mpv|auto)\s+/, '').trim();
    }

    // Warn if the resulting stream URL has stream=. (empty stream ID)
    if (rawCmd.includes('stream=.') || rawCmd.includes('stream=&')) {
      console.warn(`[Create Link] WARNING: Resulting URL has empty stream ID: ${rawCmd}`);
    }

    res.json({ js: { cmd: rawCmd } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve play link', details: err.message });
  }
});

// Helper to follow redirects manually while forwarding headers and supporting abort signals
async function fetchWithRedirects(targetUrl, headers, signal, depth = 0) {
  if (depth > 6) {
    throw new Error('Too many stream server redirects');
  }

  console.log(`[Stream Proxy] Fetching: ${targetUrl} (Redirect depth: ${depth})`);

  const response = await axios({
    method: 'get',
    url: targetUrl,
    headers: headers,
    responseType: 'stream',
    maxRedirects: 0,
    signal: signal, // Pass the abort signal here
    validateStatus: (status) => status >= 200 && status < 400,
    timeout: 15000
  });

  if (response.status >= 300 && response.status < 400 && response.headers.location) {
    const redirectUrl = response.headers.location;
    let absoluteUrl = redirectUrl;
    if (!redirectUrl.startsWith('http')) {
      const parsed = new URL(targetUrl);
      absoluteUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
    }
    console.log(`[Stream Proxy] Redirected to: ${absoluteUrl}`);
    return fetchWithRedirects(absoluteUrl, headers, signal, depth + 1);
  }

  return response;
}

// Stream Proxy (bypasses CORS, sets headers, proxies media content)
app.get('/api/stream-proxy', async (req, res) => {
  const { url, mac } = req.query;

  if (!url) {
    return res.status(400).send('No stream URL provided');
  }

  const decodedUrl = decodeURIComponent(url);

  // In Mock Mode, if they request the custom procdnnet.eu stream, redirect or proxy a real test stream
  if (decodedUrl.includes('procdnnet.eu') && decodedUrl.includes('SiLuLzo3o5MockToken')) {
    const testUrl = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
    return res.redirect(testUrl);
  }

  const controller = new AbortController();
  
  // Register client disconnect listener
  req.on('close', () => {
    console.log('[Stream Proxy] Client closed request. Aborting upstream connection.');
    controller.abort();
  });

  try {
    let headers = {};
    if (mac) {
      const session = sessionStore.get(mac);
      headers = {
        ...getMagHeaders(mac, session ? session.token : '')
      };
    }

    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    const response = await fetchWithRedirects(decodedUrl, headers, controller.signal);

    // Block HTML responses (usually geoblock page / ISP block page)
    const contentType = response.headers['content-type'] || '';
    if (contentType.toLowerCase().includes('text/html')) {
      console.warn(`[Stream Proxy] Geo-blocked or ISP block page detected for ${decodedUrl}. Content-Type: ${contentType}`);
      if (!res.headersSent) {
        res.status(403).send('Stream proxy error: Stream is geo-blocked, ISP-blocked, or returned HTML instead of video.');
      }
      return;
    }

    // Forward key response headers
    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    } else {
      res.setHeader('Content-Type', 'video/mp2t'); 
    }

    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }
    if (response.headers['content-range']) {
      res.setHeader('Content-Range', response.headers['content-range']);
      res.status(206); 
    }
    if (response.headers['accept-ranges']) {
      res.setHeader('Accept-Ranges', response.headers['accept-ranges']);
    }

    // Pipe stream directly to client
    response.data.pipe(res);

  } catch (err) {
    if (axios.isCancel(err)) {
      console.log('[Stream Proxy] Upstream request was successfully aborted.');
    } else {
      console.error(`Stream proxy failed for ${decodedUrl}:`, err.message);
      if (!res.headersSent) {
        const statusCode = err.response?.status || 500;
        res.status(statusCode).send(`Stream proxy error: ${err.message}`);
      }
    }
  }
});

// Production: Serve frontend client build
const clientBuildPath = path.join(__dirname, 'dist');
app.use(express.static(clientBuildPath));

app.get('*', (req, res) => {
  // If not api, send index.html
  if (!req.url.startsWith('/api/')) {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  } else {
    res.status(404).json({ error: 'API route not found' });
  }
});

app.listen(PORT, () => {
  console.log(`IPTV Proxy Backend running on port ${PORT}`);
});
