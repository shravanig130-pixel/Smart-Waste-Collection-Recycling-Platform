// CleanRoute — Waste Collection Request Platform
// Zero-dependency Node.js server (built-in http/fs/url only).
// This keeps the container build fast and reproducible on Cloud Run —
// no npm install step, no native deps, no lockfile drift.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 8080;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'requests.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- Storage ----------
// NOTE: Cloud Run containers have an ephemeral, single-instance filesystem —
// perfect for this MVP/demo, but data will not survive a redeploy or scale
// past one instance. For production, swap this module for Firestore or
// Cloud SQL; every call below is already isolated behind readAll/writeAll.

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}

function readAll() {
  ensureStore();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    console.error('Failed to read data file, resetting.', e);
    return [];
  }
}

function writeAll(list) {
  ensureStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf8');
}

// ---------- Helpers ----------

const CATEGORIES = ['organic', 'recyclable', 'e-waste', 'hazardous', 'bulky', 'general'];
const STATUSES = ['Pending', 'Scheduled', 'Collected', 'Cancelled'];
const SLOTS = ['morning', 'afternoon', 'evening'];

function makeId() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `CR-${stamp}-${rand}`;
}

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1e6) { // 1MB guard
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function clean(str, max = 500) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, max);
}

function isValidPhone(p) {
  return /^[0-9+\-\s()]{6,20}$/.test(p || '');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
  const fullPath = path.join(PUBLIC_DIR, filePath);

  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(fullPath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not found');
      }
      res.writeHead(500);
      return res.end('Server error');
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// ---------- Validation ----------

function validateRequestPayload(body) {
  const errors = [];
  const name = clean(body.name, 100);
  const phone = clean(body.phone, 20);
  const email = clean(body.email, 150);
  const category = clean(body.category, 30).toLowerCase();
  const description = clean(body.description, 500);
  const quantity = clean(body.quantity, 60);
  const address = clean(body.address, 250);
  const city = clean(body.city, 80);
  const pincode = clean(body.pincode, 12);
  const landmark = clean(body.landmark, 150);
  const preferredDate = clean(body.preferredDate, 20);
  const preferredSlot = clean(body.preferredSlot, 20).toLowerCase();

  if (!name) errors.push('Name is required.');
  if (!phone || !isValidPhone(phone)) errors.push('A valid phone number is required.');
  if (!CATEGORIES.includes(category)) errors.push('A valid waste category is required.');
  if (!address) errors.push('Pickup address is required.');
  if (!city) errors.push('City is required.');
  if (!preferredDate) errors.push('Preferred pickup date is required.');
  if (preferredSlot && !SLOTS.includes(preferredSlot)) errors.push('Invalid time slot.');

  // Preferred date should not be in the past
  if (preferredDate) {
    const d = new Date(preferredDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (isNaN(d.getTime())) {
      errors.push('Preferred date is invalid.');
    } else if (d < today) {
      errors.push('Preferred date cannot be in the past.');
    }
  }

  return {
    errors,
    value: {
      name, phone, email, category, description, quantity,
      address, city, pincode, landmark, preferredDate, preferredSlot,
    },
  };
}

// ---------- Route handlers ----------

function handleCreateRequest(req, res) {
  readBody(req).then((body) => {
    const { errors, value } = validateRequestPayload(body);
    if (errors.length) return sendJSON(res, 400, { ok: false, errors });

    const now = new Date().toISOString();
    const record = {
      id: makeId(),
      ...value,
      status: 'Pending',
      scheduledDate: '',
      adminNotes: '',
      createdAt: now,
      updatedAt: now,
      history: [{ status: 'Pending', at: now, note: 'Request submitted.' }],
    };

    const all = readAll();
    all.unshift(record);
    writeAll(all);

    sendJSON(res, 201, { ok: true, request: record });
  }).catch((e) => sendJSON(res, 400, { ok: false, errors: [e.message] }));
}

function handleListRequests(req, res, query) {
  let all = readAll();

  const status = query.get('status');
  const category = query.get('category');
  const search = (query.get('search') || '').trim().toLowerCase();
  const from = query.get('from');
  const to = query.get('to');

  if (status && STATUSES.includes(status)) {
    all = all.filter((r) => r.status === status);
  }
  if (category && CATEGORIES.includes(category)) {
    all = all.filter((r) => r.category === category);
  }
  if (search) {
    all = all.filter((r) =>
      r.id.toLowerCase().includes(search) ||
      r.name.toLowerCase().includes(search) ||
      r.phone.toLowerCase().includes(search) ||
      (r.city || '').toLowerCase().includes(search) ||
      (r.address || '').toLowerCase().includes(search)
    );
  }
  if (from) {
    all = all.filter((r) => r.preferredDate && r.preferredDate >= from);
  }
  if (to) {
    all = all.filter((r) => r.preferredDate && r.preferredDate <= to);
  }

  sendJSON(res, 200, { ok: true, count: all.length, requests: all });
}

function handleTrack(req, res, query) {
  const q = (query.get('query') || '').trim().toLowerCase();
  if (!q) return sendJSON(res, 400, { ok: false, errors: ['Provide a request ID or phone number.'] });

  const all = readAll();
  const matches = all.filter((r) =>
    r.id.toLowerCase() === q || r.phone.replace(/\s+/g, '') === q.replace(/\s+/g, '')
  );

  if (!matches.length) return sendJSON(res, 404, { ok: false, errors: ['No matching request found.'] });
  sendJSON(res, 200, { ok: true, requests: matches });
}

function handleGetOne(req, res, id) {
  const all = readAll();
  const found = all.find((r) => r.id === id);
  if (!found) return sendJSON(res, 404, { ok: false, errors: ['Request not found.'] });
  sendJSON(res, 200, { ok: true, request: found });
}

function handleUpdateStatus(req, res, id) {
  readBody(req).then((body) => {
    const status = clean(body.status, 20);
    const scheduledDate = clean(body.scheduledDate, 20);
    const adminNotes = clean(body.adminNotes, 500);

    if (status && !STATUSES.includes(status)) {
      return sendJSON(res, 400, { ok: false, errors: ['Invalid status value.'] });
    }

    const all = readAll();
    const idx = all.findIndex((r) => r.id === id);
    if (idx === -1) return sendJSON(res, 404, { ok: false, errors: ['Request not found.'] });

    const now = new Date().toISOString();
    const record = all[idx];

    if (status && status !== record.status) {
      record.status = status;
      record.history = record.history || [];
      record.history.push({ status, at: now, note: adminNotes || `Status updated to ${status}.` });
    }
    if (scheduledDate) record.scheduledDate = scheduledDate;
    if (adminNotes) record.adminNotes = adminNotes;
    record.updatedAt = now;

    all[idx] = record;
    writeAll(all);
    sendJSON(res, 200, { ok: true, request: record });
  }).catch((e) => sendJSON(res, 400, { ok: false, errors: [e.message] }));
}

function handleDelete(req, res, id) {
  const all = readAll();
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return sendJSON(res, 404, { ok: false, errors: ['Request not found.'] });
  const [removed] = all.splice(idx, 1);
  writeAll(all);
  sendJSON(res, 200, { ok: true, request: removed });
}

function handleStats(req, res) {
  const all = readAll();
  const byStatus = {};
  STATUSES.forEach((s) => (byStatus[s] = 0));
  const byCategory = {};
  CATEGORIES.forEach((c) => (byCategory[c] = 0));

  let last7 = 0;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  all.forEach((r) => {
    if (byStatus[r.status] !== undefined) byStatus[r.status]++;
    if (byCategory[r.category] !== undefined) byCategory[r.category]++;
    if (new Date(r.createdAt).getTime() >= sevenDaysAgo) last7++;
  });

  sendJSON(res, 200, {
    ok: true,
    total: all.length,
    byStatus,
    byCategory,
    last7Days: last7,
  });
}

// ---------- Router ----------

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsed.pathname;
  const query = parsed.searchParams;

  // CORS (harmless for same-origin deploy, useful if frontend is split later)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    if (pathname === '/api/health') {
      return sendJSON(res, 200, { ok: true, service: 'cleanroute', time: new Date().toISOString() });
    }

    if (pathname === '/api/requests' && req.method === 'POST') {
      return handleCreateRequest(req, res);
    }
    if (pathname === '/api/requests' && req.method === 'GET') {
      return handleListRequests(req, res, query);
    }
    if (pathname === '/api/requests/track' && req.method === 'GET') {
      return handleTrack(req, res, query);
    }
    if (pathname === '/api/stats' && req.method === 'GET') {
      return handleStats(req, res);
    }

    const singleMatch = pathname.match(/^\/api\/requests\/([A-Za-z0-9\-]+)$/);
    if (singleMatch && req.method === 'GET') {
      return handleGetOne(req, res, singleMatch[1]);
    }
    if (singleMatch && req.method === 'PATCH') {
      return handleUpdateStatus(req, res, singleMatch[1]);
    }
    if (singleMatch && req.method === 'DELETE') {
      return handleDelete(req, res, singleMatch[1]);
    }

    if (pathname.startsWith('/api/')) {
      return sendJSON(res, 404, { ok: false, errors: ['Unknown endpoint.'] });
    }

    // Static frontend
    return serveStatic(req, res, pathname);
  } catch (e) {
    console.error(e);
    sendJSON(res, 500, { ok: false, errors: ['Internal server error.'] });
  }
});

ensureStore();
server.listen(PORT, () => {
  console.log(`CleanRoute server listening on port ${PORT}`);
});
