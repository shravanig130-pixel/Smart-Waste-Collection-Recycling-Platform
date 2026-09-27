// Public portal: new request + tracking.

// ----- Tabs -----
document.querySelectorAll('.tabbtn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabbtn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tabpanel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
  });
});

// Deep-link support: /?track=CR-XXXX
const params = new URLSearchParams(location.search);
if (params.get('track')) {
  document.querySelector('[data-tab="track"]').click();
  document.getElementById('track-query').value = params.get('track');
  runTrack(params.get('track'));
}

// ----- Category picker -----
const categoryGrid = document.getElementById('category-grid');
const categoryInput = document.getElementById('category');
categoryGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('.category-opt');
  if (!btn) return;
  categoryGrid.querySelectorAll('.category-opt').forEach((b) => b.classList.remove('selected'));
  btn.classList.add('selected');
  categoryInput.value = btn.dataset.value;
});

// Minimum date = today
document.getElementById('preferredDate').min = new Date().toISOString().slice(0, 10);

// ----- Submit new request -----
const form = document.getElementById('request-form');
const errorBox = document.getElementById('new-error-box');
const submitBtn = document.getElementById('submit-btn');
const submitHelp = document.getElementById('submit-help');
const confirmation = document.getElementById('confirmation');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.innerHTML = '';
  confirmation.style.display = 'none';

  if (!categoryInput.value) {
    errorBox.innerHTML = `<div class="error-box">Please select a waste category.</div>`;
    window.scrollTo({ top: categoryGrid.offsetTop - 100, behavior: 'smooth' });
    return;
  }

  const payload = Object.fromEntries(new FormData(form).entries());
  submitBtn.disabled = true;
  submitHelp.textContent = 'Submitting…';

  try {
    const data = await api('/api/requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    form.reset();
    categoryGrid.querySelectorAll('.category-opt').forEach((b) => b.classList.remove('selected'));
    categoryInput.value = '';
    submitHelp.textContent = '';

    confirmation.style.display = 'block';
    confirmation.innerHTML = `
      <div class="card" style="border-color: var(--teal);">
        <h3 style="margin-bottom:8px;">Request submitted — you're on the schedule.</h3>
        <p class="help" style="margin-bottom:14px;">Save this ticket ID to track your pickup:</p>
        ${renderTicket(data.request)}
        <button class="btn secondary" onclick="document.querySelector('[data-tab=track]').click(); document.getElementById('track-query').value='${data.request.id}'; runTrack('${data.request.id}');">Track this request now</button>
      </div>
    `;
    confirmation.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    errorBox.innerHTML = `<div class="error-box">${(err.details && err.details.length ? err.details : [err.message]).map(escapeHtml).join('<br>')}</div>`;
    submitHelp.textContent = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    submitBtn.disabled = false;
  }
});

// ----- Track -----
const trackBtn = document.getElementById('track-btn');
const trackQuery = document.getElementById('track-query');
const trackErrorBox = document.getElementById('track-error-box');
const trackResults = document.getElementById('track-results');

trackBtn.addEventListener('click', () => runTrack(trackQuery.value));
trackQuery.addEventListener('keydown', (e) => { if (e.key === 'Enter') runTrack(trackQuery.value); });

async function runTrack(q) {
  trackErrorBox.innerHTML = '';
  trackResults.innerHTML = '';
  if (!q || !q.trim()) {
    trackErrorBox.innerHTML = `<div class="error-box">Enter a request ID or phone number.</div>`;
    return;
  }
  try {
    const data = await api(`/api/requests/track?query=${encodeURIComponent(q.trim())}`);
    trackResults.innerHTML = data.requests.map((r) => renderTicket(r)).join('');
  } catch (err) {
    trackErrorBox.innerHTML = `<div class="error-box">${(err.details && err.details.length ? err.details : [err.message]).map(escapeHtml).join('<br>')}</div>`;
  }
}
