// Admin dashboard: stats, filtering, queue management, history.

document.querySelectorAll('.tabbtn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabbtn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tabpanel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'history') loadHistory();
  });
});

const STATUS_OPTIONS = ['Pending', 'Scheduled', 'Collected', 'Cancelled'];

async function loadStats() {
  try {
    const s = await api('/api/stats');
    document.getElementById('stat-grid').innerHTML = `
      <div class="stat-card"><div class="num">${s.total}</div><div class="lbl">Total requests</div></div>
      <div class="stat-card"><div class="num">${s.byStatus.Pending || 0}</div><div class="lbl">Pending</div></div>
      <div class="stat-card"><div class="num">${s.byStatus.Collected || 0}</div><div class="lbl">Collected</div></div>
      <div class="stat-card"><div class="num">${s.last7Days}</div><div class="lbl">New in last 7 days</div></div>
    `;

    const maxStatus = Math.max(1, ...Object.values(s.byStatus));
    document.getElementById('status-bars').innerHTML = Object.entries(s.byStatus).map(([k, v]) => `
      <div class="bar-row">
        <div class="bar-label">${escapeHtml(k)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(v / maxStatus) * 100}%"></div></div>
        <div class="bar-count">${v}</div>
      </div>
    `).join('');

    const maxCat = Math.max(1, ...Object.values(s.byCategory));
    document.getElementById('category-bars').innerHTML = Object.entries(s.byCategory).map(([k, v]) => `
      <div class="bar-row">
        <div class="bar-label">${escapeHtml(k)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(v / maxCat) * 100}%"></div></div>
        <div class="bar-count">${v}</div>
      </div>
    `).join('');
  } catch (e) {
    console.error(e);
  }
}

function statusSelectHtml(id, current) {
  return `<select data-id="${id}" class="status-select">` +
    STATUS_OPTIONS.map((s) => `<option value="${s}" ${s === current ? 'selected' : ''}>${s}</option>`).join('') +
    `</select>`;
}

function queueRowHtml(r) {
  return `
    <tr data-row="${r.id}">
      <td class="id-cell mono">${escapeHtml(r.id)}</td>
      <td>${escapeHtml(r.name)}<br><span class="help">${escapeHtml(r.phone)}</span></td>
      <td><span class="badge cat">${escapeHtml(categoryLabel(r.category))}</span></td>
      <td>${escapeHtml(r.address)}${r.city ? ', ' + escapeHtml(r.city) : ''}</td>
      <td>${fmtDate(r.preferredDate)}${r.preferredSlot ? '<br><span class="help">' + escapeHtml(r.preferredSlot) + '</span>' : ''}</td>
      <td><span class="badge status-${escapeHtml(r.status)}">${escapeHtml(r.status)}</span></td>
      <td>
        <div class="row-actions">
          ${statusSelectHtml(r.id, r.status)}
          <button class="apply-btn" data-id="${r.id}">Apply</button>
          <button class="details-btn" data-id="${r.id}">Details</button>
        </div>
      </td>
    </tr>
    <tr class="details-row" data-details-for="${r.id}" style="display:none;">
      <td colspan="7" style="background:var(--paper);">${renderTicket(r)}</td>
    </tr>
  `;
}

let cachedRequests = [];

async function loadQueue() {
  const search = document.getElementById('search').value.trim();
  const status = document.getElementById('filter-status').value;
  const category = document.getElementById('filter-category').value;

  const qs = new URLSearchParams();
  if (search) qs.set('search', search);
  if (status) qs.set('status', status);
  if (category) qs.set('category', category);

  try {
    const data = await api(`/api/requests?${qs.toString()}`);
    cachedRequests = data.requests;
    const body = document.getElementById('queue-body');
    const empty = document.getElementById('queue-empty');
    if (!data.requests.length) {
      body.innerHTML = '';
      empty.innerHTML = `<div class="empty-state">No requests match these filters.</div>`;
    } else {
      empty.innerHTML = '';
      body.innerHTML = data.requests.map(queueRowHtml).join('');
    }
  } catch (e) {
    console.error(e);
  }
}

document.getElementById('search').addEventListener('input', debounce(loadQueue, 300));
document.getElementById('filter-status').addEventListener('change', loadQueue);
document.getElementById('filter-category').addEventListener('change', loadQueue);
document.getElementById('refresh-btn').addEventListener('click', () => { loadQueue(); loadStats(); });

document.getElementById('queue-body').addEventListener('click', async (e) => {
  const applyBtn = e.target.closest('.apply-btn');
  const detailsBtn = e.target.closest('.details-btn');

  if (applyBtn) {
    const id = applyBtn.dataset.id;
    const select = document.querySelector(`.status-select[data-id="${CSS.escape(id)}"]`);
    const newStatus = select.value;
    applyBtn.disabled = true;
    try {
      await api(`/api/requests/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      showToast(`${id} marked ${newStatus}`);
      loadQueue();
      loadStats();
    } catch (err) {
      showToast('Update failed: ' + err.message);
    } finally {
      applyBtn.disabled = false;
    }
  }

  if (detailsBtn) {
    const id = detailsBtn.dataset.id;
    const row = document.querySelector(`.details-row[data-details-for="${CSS.escape(id)}"]`);
    if (row) row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
  }
});

async function loadHistory() {
  try {
    const data = await api('/api/requests?status=Collected');
    const list = document.getElementById('history-list');
    if (!data.requests.length) {
      list.innerHTML = `<div class="empty-state">No completed pickups yet.</div>`;
      return;
    }
    list.innerHTML = data.requests.map((r) => renderTicket(r)).join('');
  } catch (e) {
    console.error(e);
  }
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

loadStats();
loadQueue();
