// Shared helpers for CleanRoute frontend pages.

const CATEGORY_LABELS = {
  'organic': '🍃 Organic / kitchen',
  'recyclable': '🧴 Recyclable',
  'e-waste': '🔌 E-waste',
  'hazardous': '⚠️ Hazardous',
  'bulky': '🛋️ Bulky / furniture',
  'general': '🗑️ General',
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function categoryLabel(cat) {
  return CATEGORY_LABELS[cat] || cat;
}

function showToast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display = 'none'; }, 2600);
}

function renderTicket(r, opts = {}) {
  const timeline = (r.history || []).slice().reverse().map((h) => `
    <div class="timeline-item">
      <span class="dot"></span>
      <span><strong>${escapeHtml(h.status)}</strong> — ${fmtDateTime(h.at)}${h.note ? ' · ' + escapeHtml(h.note) : ''}</span>
    </div>
  `).join('');

  return `
    <div class="ticket">
      <div class="ticket-main">
        <div class="ticket-title">
          <h3>${escapeHtml(r.name)}</h3>
          <span class="badge cat">${escapeHtml(categoryLabel(r.category))}</span>
        </div>
        <div class="ticket-meta">
          <div>📍 ${escapeHtml(r.address)}${r.city ? ', ' + escapeHtml(r.city) : ''}${r.pincode ? ' – ' + escapeHtml(r.pincode) : ''}</div>
          ${r.landmark ? `<div>🧭 Near ${escapeHtml(r.landmark)}</div>` : ''}
          <div>📅 Preferred: ${fmtDate(r.preferredDate)}${r.preferredSlot ? ' · ' + escapeHtml(r.preferredSlot) : ''}</div>
          ${r.scheduledDate ? `<div>✅ Scheduled: ${fmtDate(r.scheduledDate)}</div>` : ''}
          ${r.quantity ? `<div>⚖️ Quantity: ${escapeHtml(r.quantity)}</div>` : ''}
          ${r.description ? `<div>📝 ${escapeHtml(r.description)}</div>` : ''}
          ${r.adminNotes ? `<div>💬 Note from collection team: ${escapeHtml(r.adminNotes)}</div>` : ''}
        </div>
        ${opts.showTimeline !== false ? `<div class="timeline">${timeline}</div>` : ''}
      </div>
      <div class="ticket-stub">
        <div>
          <div class="ticket-id mono">${escapeHtml(r.id)}</div>
          <div class="ticket-id">${escapeHtml(r.phone)}</div>
        </div>
        <span class="badge status-${escapeHtml(r.status)}">${escapeHtml(r.status)}</span>
      </div>
    </div>
  `;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let data;
  try { data = await res.json(); } catch (e) { data = {}; }
  if (!res.ok || data.ok === false) {
    const err = new Error((data.errors && data.errors.join(' ')) || 'Request failed');
    err.details = data.errors || [];
    throw err;
  }
  return data;
}
