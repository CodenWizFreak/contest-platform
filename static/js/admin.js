const PROBLEM_NAMES = [
  '', // 1-indexed
  'Task 1: Signal Decoder',
  'Task 2: Reactor Frequency',
  'Task 3: Vent Stack',
  'Task 4: O2 Tree Scan',
  'Task 5: Sabotage Paths',
  'Task 6: Emergency Protocol',
];

// ── LOAD ALL ──────────────────────────────────────────────────────────────────
async function loadData() {
  await Promise.all([loadStatus(), loadParticipants(), loadLeaderboard()]);
}

// ── STATUS ────────────────────────────────────────────────────────────────────
async function loadStatus() {
  const r   = await fetch('/api/contest_status');
  const d   = await r.json();
  const dot = document.getElementById('s-dot');
  const txt = document.getElementById('s-text');
  const tEl = document.getElementById('s-time');

  dot.classList.toggle('live', d.active);
  txt.textContent = d.active ? 'Contest is LIVE' : 'Contest is NOT active';
  if (d.start_time) tEl.textContent = `Started: ${new Date(d.start_time).toLocaleTimeString()}`;
}

// ── PARTICIPANTS ──────────────────────────────────────────────────────────────
async function loadParticipants() {
  const r    = await fetch('/api/admin/participants');
  const data = await r.json();

  document.getElementById('stat-total').textContent     = data.length;
  document.getElementById('stat-submitted').textContent = data.filter(p => p.submitted).length;
  document.getElementById('stat-active').textContent    = data.filter(p => !p.submitted).length;

  const avg = data.length
    ? (data.reduce((a, p) => a + p.solved_count, 0) / data.length).toFixed(1)
    : '0';
  document.getElementById('stat-solved').textContent = avg;

  const tbody = document.getElementById('participants-body');
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">No participants yet.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map((p, i) => `
    <tr>
      <td class="rank-other">${i + 1}</td>
      <td>${esc(p.name)}</td>
      <td>${esc(p.college)}</td>
      <td>${esc(p.system_number)}</td>
      <td>${esc(p.phone)}</td>
      <td><span class="badge badge-green">${p.solved_count}/6</span></td>
      <td>${p.submitted
        ? '<span class="badge badge-orange">Submitted</span>'
        : '<span class="active-text">Active</span>'}</td>
      <td>
        <button class="action-btn btn-view" onclick="viewCode(${p.id}, '${esc(p.name)}')">View</button>
        ${!p.submitted ? `<button class="action-btn btn-end-p" onclick="endParticipant(${p.id}, '${esc(p.name)}')">End Test</button>` : ''}
      </td>
    </tr>
  `).join('');
}

// ── LEADERBOARD ───────────────────────────────────────────────────────────────
async function loadLeaderboard() {
  const r    = await fetch('/api/admin/leaderboard');
  const data = await r.json();
  const tbody = document.getElementById('leaderboard-body');

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No data yet.</td></tr>';
    return;
  }

  const rankClass  = i => ['rank-gold', 'rank-silver', 'rank-bronze'][i] || 'rank-other';
  const rankSymbol = i => ['🥇', '🥈', '🥉'][i] || (i + 1);

  tbody.innerHTML = data.map((p, i) => `
    <tr>
      <td class="${rankClass(i)}">${rankSymbol(i)}</td>
      <td>${esc(p.name)}</td>
      <td>${esc(p.college)}</td>
      <td>${esc(p.system_number)}</td>
      <td><span class="badge badge-green">${p.solved_count}/6</span></td>
      <td class="time-val">${formatTime(p.total_time)}</td>
      <td>${p.total_wrong > 0
        ? `<span class="badge badge-orange wrong-val">${p.total_wrong} wrong</span>`
        : '<span class="rank-other">—</span>'}</td>
    </tr>
  `).join('');
}

// ── VIEW CODE MODAL ───────────────────────────────────────────────────────────
async function viewCode(pid, name) {
  document.getElementById('modal-title').textContent = `Submissions — ${name}`;
  document.getElementById('modal-body').innerHTML    = '<div class="empty-cell">Loading...</div>';
  document.getElementById('code-modal').classList.add('open');

  const r    = await fetch(`/api/admin/participant_detail/${pid}`);
  const subs = await r.json();

  if (!subs.length) {
    document.getElementById('modal-body').innerHTML = '<div class="empty-cell">No submissions yet.</div>';
    return;
  }

  document.getElementById('modal-body').innerHTML = subs.map(s => `
    <div class="sub-card">
      <div class="sub-card-head">
        <div class="sub-card-title">${PROBLEM_NAMES[s.problem_id] || 'Problem ' + s.problem_id}</div>
        <span class="badge badge-muted">${s.language || '?'}</span>
        <span class="badge ${s.is_solved ? 'badge-green' : 'badge-red'}">${s.is_solved ? '✓ Solved' : '✗ Unsolved'}</span>
      </div>
      <div class="stats-row">
        <div class="stat-item"><span>Time taken: </span>${s.time_taken_seconds ? formatTime(s.time_taken_seconds) : '—'}</div>
        <div class="stat-item"><span>Wrong attempts: </span><span class="${s.wrong_attempts > 0 ? 'wrong' : ''}">${s.wrong_attempts || 0}</span></div>
        <div class="stat-item"><span>Total attempts: </span>${(s.wrong_attempts || 0) + (s.is_solved ? 1 : 0)}</div>
        <div class="stat-item"><span>Last saved: </span>${s.last_updated ? new Date(s.last_updated).toLocaleString() : '—'}</div>
      </div>
      <pre>${esc(s.code || '(empty)')}</pre>
    </div>
  `).join('');
}

function closeModal() {
  document.getElementById('code-modal').classList.remove('open');
}

// ── CONTEST CONTROLS ──────────────────────────────────────────────────────────
async function startContest() {
  if (!confirm('Start the contest for all participants now?')) return;
  const r = await fetch('/api/admin/start_contest', { method: 'POST' });
  const d = await r.json();
  if (d.success) { alert('Contest started! Timer begins NOW for everyone.'); loadData(); }
  else alert(d.error);
}

async function stopContest() {
  if (!confirm('Stop the contest? All participants will see an end modal.')) return;
  const r = await fetch('/api/admin/stop_contest', { method: 'POST' });
  if ((await r.json()).success) { alert('Contest stopped.'); loadData(); }
}

async function endParticipant(pid, name) {
  if (!confirm(`End test for ${name}? They will not be able to continue.`)) return;
  const r = await fetch('/api/admin/end_participant', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ participant_id: pid }),
  });
  const d = await r.json();
  if (d.success) { alert(`Test ended for ${name}.`); loadData(); }
  else alert(d.error);
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function formatTime(seconds) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s}s`;
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── INIT ──────────────────────────────────────────────────────────────────────
loadData();
setInterval(loadData, 15000);