'use strict';

// ── STATE ─────────────────────────────────────────────────────────────────────
let problems       = [];
let solvedSet      = new Set();
let currentProblem = null;
let editor         = null;
let codeStore      = {};          // { "problemId_lang": code }
let contestStart   = null;
let contestDuration = 3600;
let timerInterval  = null;
let tabViolations  = 0;
let autosaveInterval = null;
let currentTab     = 'testcases';
let lastRunResults = [];
let timesUpShown   = false;
let endBtnShown    = false;

// Active-time tracking
let activeTime     = {};          // { pid: accumulatedSeconds }
let problemOpenedAt = null;       // Date.now() when current problem was focused

// ── MONACO INIT ───────────────────────────────────────────────────────────────
require.config({
  paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' },
});

require(['vs/editor/editor.main'], function () {

  monaco.editor.defineTheme('skeld', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment',  foreground: '3d5a7a', fontStyle: 'italic' },
      { token: 'keyword',  foreground: '00f5ff' },
      { token: 'string',   foreground: '00e676' },
      { token: 'number',   foreground: 'ffd700' },
      { token: 'type',     foreground: 'ff6b35' },
      { token: 'function', foreground: '82aaff' },
    ],
    colors: {
      'editor.background':                  '#0a0a10',
      'editor.foreground':                  '#c8d8e8',
      'editor.lineHighlightBackground':     '#14141f',
      'editorLineNumber.foreground':        '#2a3a4a',
      'editorLineNumber.activeForeground':  '#00f5ff',
      'editor.selectionBackground':         '#1e3a5f',
      'editor.inactiveSelectionBackground': '#0f2040',
      'editorCursor.foreground':            '#00f5ff',
      'editorGutter.background':            '#0a0a10',
      'editorIndentGuide.background':       '#1a1a2a',
      'editorIndentGuide.activeBackground': '#00f5ff22',
      'scrollbarSlider.background':         '#1e1e32aa',
      'scrollbarSlider.hoverBackground':    '#252535aa',
      'editorSuggestWidget.background':     '#12121f',
      'editorSuggestWidget.border':         '#1e1e32',
      'editorSuggestWidget.selectedBackground': '#1a2a3a',
    },
  });

  editor = monaco.editor.create(document.getElementById('monaco-editor'), {
    value:                '// Select a task to begin.',
    language:             'python',
    theme:                'skeld',
    fontSize:             14,
    lineHeight:           22,
    fontFamily:           "'Cascadia Code', 'Fira Code', 'Share Tech Mono', monospace",
    minimap:              { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout:      true,
    tabSize:              4,
    wordWrap:             'on',
    cursorBlinking:       'phase',
    smoothScrolling:      true,
    renderLineHighlight:  'line',
    padding:              { top: 12, bottom: 12 },
  });

  editor.onDidChangeModelContent(() => {
    if (currentProblem) {
      codeStore[`${currentProblem.id}_${getLang()}`] = editor.getValue();
    }
  });

  loadData();

  // Poll contest status every 5 s
  setInterval(async () => {
    try {
      const d = await fetchJSON('/api/contest_status');
      const shouldEnd = (!d.active || d.force_ended) && !timesUpShown;
      if (shouldEnd) {
        timesUpShown = true;
        clearInterval(timerInterval);
        pauseCurrentClock();
        const modal = document.getElementById('timesup-modal');
        modal.querySelector('p').textContent = d.force_ended
          ? 'Your test has been ended by the administrator. Your code has been auto-saved. Please submit and exit.'
          : 'The contest has been stopped by the administrator. Please submit and exit.';
        modal.classList.add('open');
      }
      if (d.active && d.start_time && !contestStart) {
        contestStart    = new Date(d.start_time);
        contestDuration = d.duration;
        startTimer();
      }
    } catch (e) { /* ignore */ }
  }, 5000);
});

// ── DATA LOADING ──────────────────────────────────────────────────────────────
async function loadData() {
  const [problems_data, solved_ids, cs] = await Promise.all([
    fetchJSON('/api/problems'),
    fetchJSON('/api/solved'),
    fetchJSON('/api/contest_status'),
  ]);

  problems = problems_data;
  solved_ids.forEach(id => solvedSet.add(id));

  if (cs.start_time) {
    contestStart    = new Date(cs.start_time);
    contestDuration = cs.duration;
    startTimer();
  }

  renderSidebar();
  autosaveInterval = setInterval(autosave, 30000);
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
function renderSidebar() {
  const list = document.getElementById('problem-list');
  list.innerHTML = '';
  problems.forEach(p => {
    const el = document.createElement('div');
    el.className = 'problem-item' + (solvedSet.has(p.id) ? ' solved' : '');
    el.id        = `prob-item-${p.id}`;
    el.onclick   = () => selectProblem(p.id);
    el.innerHTML = `
      <div class="problem-num">${p.id}.</div>
      <div class="problem-info">
        <div class="problem-title-short">${p.title.replace(/^Task \d+: /, '')}</div>
        <div class="problem-sub">${p.subtitle}</div>
      </div>
      <div class="tick ${solvedSet.has(p.id) ? 'visible' : ''}" id="tick-${p.id}">✓</div>
    `;
    list.appendChild(el);
  });
}

// ── ACTIVE-TIME CLOCK ─────────────────────────────────────────────────────────
function pauseCurrentClock() {
  if (currentProblem && problemOpenedAt !== null) {
    const elapsed = (Date.now() - problemOpenedAt) / 1000;
    activeTime[currentProblem.id] = (activeTime[currentProblem.id] || 0) + elapsed;
    problemOpenedAt = null;
  }
}

function resumeClock() {
  problemOpenedAt = Date.now();
}

function getActiveSeconds(pid) {
  const base = activeTime[pid] || 0;
  if (currentProblem && currentProblem.id === pid && problemOpenedAt !== null) {
    return base + (Date.now() - problemOpenedAt) / 1000;
  }
  return base;
}

// ── PROBLEM SELECTION ─────────────────────────────────────────────────────────
function selectProblem(pid) {
  if (solvedSet.has(pid)) {
    showOutput('<div class="out-line success">✅ You have already solved this problem. Move on to the next task!</div>');
    return;
  }

  pauseCurrentClock();

  if (currentProblem && editor) {
    codeStore[`${currentProblem.id}_${getLang()}`] = editor.getValue();
  }

  currentProblem = problems.find(p => p.id === pid);
  if (!currentProblem) return;

  resumeClock();

  document.querySelectorAll('.problem-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`prob-item-${pid}`).classList.add('active');

  renderProblem();
  loadCodeIntoEditor();

  document.getElementById('run-btn').disabled    = false;
  document.getElementById('submit-btn').disabled = false;

  clearOutput();
}

// ── PROBLEM RENDERING ─────────────────────────────────────────────────────────
function renderProblem() {
  const p     = currentProblem;
  const panel = document.getElementById('problem-panel');

  const tcHtml = p.visible_test_cases.map((tc, i) => `
    <div class="tc-sample">
      <div class="tc-sample-label">SAMPLE ${i + 1}</div>
      <div class="tc-sample-input">Input: ${escHtml(tc.input)}</div>
      <div class="tc-sample-expect">Expected: ${escHtml(tc.expected.replace(/RESULT:/g, ''))}</div>
      ${tc.explanation ? `<div class="tc-sample-expl">${escHtml(tc.explanation)}</div>` : ''}
    </div>
  `).join('');

  panel.innerHTML = `
    <h2>${p.title}</h2>
    <div class="prob-subtitle">${p.subtitle}</div>
    <div class="prob-meta">
      ${p.constraints ? `<div class="meta-chip chip-complexity">${p.constraints}</div>` : ''}
    </div>
    <div class="prob-desc">${p.description}</div>
    <div class="io-section">
      <div class="io-label">Input Format</div>
      <div class="io-text">${escHtml(p.input_format)}</div>
    </div>
    <div class="io-section">
      <div class="io-label">Output Format</div>
      <div class="io-text">${escHtml(p.output_format)}</div>
    </div>
    <div class="io-section">
      <div class="io-label">Sample Test Cases</div>
      ${tcHtml}
    </div>
    <div class="prob-notice">
      ⚠ Write the function body only. The hidden driver code will call your function with test inputs.
    </div>
  `;
}

// ── EDITOR ────────────────────────────────────────────────────────────────────
function getLang() {
  return document.getElementById('lang-select').value;
}

function getMonacoLang(lang) {
  return { python: 'python', cpp: 'cpp', c: 'c', java: 'java' }[lang] || 'plaintext';
}

function loadCodeIntoEditor() {
  const lang = getLang();
  const key  = `${currentProblem.id}_${lang}`;
  if (!codeStore[key]) codeStore[key] = currentProblem.boilerplate[lang] || '';
  monaco.editor.setModelLanguage(editor.getModel(), getMonacoLang(lang));
  editor.setValue(codeStore[key]);
  editor.focus();
}

function onLanguageChange() {
  if (!currentProblem) return;
  loadCodeIntoEditor();
  clearOutput();
}

// ── RUN ───────────────────────────────────────────────────────────────────────
async function runCode() {
  if (!currentProblem || !editor) return;
  setRunning(true, false);
  showOutput('<div class="out-line"><span class="spinner"></span>Running visible test cases...</div>');
  try {
    const data = await postJSON('/api/run', {
      problem_id: currentProblem.id,
      language:   getLang(),
      code:       editor.getValue(),
    });
    lastRunResults = data.results || [];
    renderTestCaseResults(lastRunResults, false);
    switchTab('testcases');
  } catch (e) {
    showOutput(`<div class="out-line error">Network error: ${e.message}</div>`);
  }
  setRunning(false, false);
}

// ── SUBMIT ────────────────────────────────────────────────────────────────────
async function submitCode() {
  if (!currentProblem || !editor) return;
  setRunning(true, true);
  showOutput('<div class="out-line"><span class="spinner"></span>Running all test cases (including hidden)...</div>');
  try {
    const data = await postJSON('/api/submit', {
      problem_id:     currentProblem.id,
      language:       getLang(),
      code:           editor.getValue(),
      active_seconds: getActiveSeconds(currentProblem.id),
    });

    if (data.all_passed) {
      solvedSet.add(currentProblem.id);
      document.getElementById(`prob-item-${currentProblem.id}`).classList.add('solved');
      const tick = document.getElementById(`tick-${currentProblem.id}`);
      if (tick) tick.classList.add('visible');
    }

    renderTestCaseResults(data.results, true, data.all_passed);
    switchTab('testcases');
  } catch (e) {
    showOutput(`<div class="out-line error">Network error: ${e.message}</div>`);
  }
  setRunning(false, true);
}

// ── RENDER RESULTS ────────────────────────────────────────────────────────────
function renderTestCaseResults(results, isSubmit, allPassed) {
  let html = '';

  if (isSubmit && allPassed !== undefined) {
    const cls = allPassed ? 'success' : 'error';
    const msg = allPassed
      ? '✅ ALL TEST CASES PASSED! Question marked as solved.'
      : '❌ Some test cases failed. Keep trying!';
    html += `<div class="out-line ${cls}" style="margin-bottom:10px;font-size:13px;padding:6px 0;border-bottom:1px solid var(--border2);">${msg}</div>`;
  }

  const visibleCount = currentProblem?.visible_test_cases?.length || 0;

  results.forEach((tc, i) => {
    const hidden  = isSubmit && i >= visibleCount;
    const gotCls  = tc.passed ? 'tc-got-pass' : 'tc-got-fail';
    html += `
      <div class="tc-result">
        <div class="tc-status">${tc.passed ? '✅' : '❌'}</div>
        <div class="tc-details">
          <div class="tc-label">Test Case ${i + 1}${hidden ? ' (hidden)' : ''}</div>
          <div class="tc-vals">
            <div class="tc-val"><span>Expected:</span> ${escHtml(tc.expected.replace(/RESULT:/g, ''))}</div>
            <div class="tc-val"><span>Got:</span> <span class="${gotCls}">${escHtml(tc.got || '(no output)')}</span></div>
          </div>
          ${tc.explanation ? `<div class="tc-explain">${escHtml(tc.explanation)}</div>` : ''}
        </div>
      </div>`;
  });

  document.getElementById('output-content').innerHTML = html || '<div class="out-line info">No results.</div>';
  currentTab = 'testcases';
  document.getElementById('tab-testcases').classList.add('active');
  document.getElementById('tab-raw').classList.remove('active');
}

function setRunning(running, isSubmit) {
  document.getElementById('run-btn').disabled    = running;
  document.getElementById('submit-btn').disabled = running;
  if (running) {
    document.getElementById(isSubmit ? 'submit-btn' : 'run-btn').textContent =
      isSubmit ? '⏳ Judging...' : '⏳ Running...';
  } else {
    document.getElementById('run-btn').textContent    = '▶ Run';
    document.getElementById('submit-btn').textContent = '✓ Submit';
  }
}

// ── OUTPUT PANEL ──────────────────────────────────────────────────────────────
function showOutput(html) {
  document.getElementById('output-content').innerHTML = html;
}

function clearOutput() {
  showOutput('<div class="out-line info">// Run your code to see output here.</div>');
}

function switchTab(tab) {
  currentTab = tab;
  document.getElementById('tab-testcases').classList.toggle('active', tab === 'testcases');
  document.getElementById('tab-raw').classList.toggle('active',       tab === 'raw');
}

// ── TIMER ─────────────────────────────────────────────────────────────────────
function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
}

function updateTimer() {
  if (!contestStart) return;
  const remaining = Math.max(0, contestDuration - (Date.now() - contestStart) / 1000);
  const mins      = Math.floor(remaining / 60);
  const secs      = Math.floor(remaining % 60);
  const el        = document.getElementById('timer');
  el.textContent  = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  el.classList.remove('warning', 'critical');
  if (remaining < 300)      el.classList.add('critical');
  else if (remaining < 600) el.classList.add('warning');

  if (remaining <= 600 && !endBtnShown) {
    endBtnShown = true;
    document.getElementById('end-btn').classList.add('visible');
  }

  if (remaining <= 0 && !timesUpShown) {
    timesUpShown = true;
    clearInterval(timerInterval);
    document.getElementById('timesup-modal').classList.add('open');
  }
}

// ── END TEST ──────────────────────────────────────────────────────────────────
function showEndModal()  { document.getElementById('end-modal').classList.add('open'); }
function closeEndModal() { document.getElementById('end-modal').classList.remove('open'); }

async function confirmEnd() {
  await autosave();
  const data = await postJSON('/api/end_test', {});
  if (data.success) window.location.href = '/ended';
}

async function forceEnd() {
  await autosave();
  await postJSON('/api/end_test', {});
  window.location.href = '/ended';
}

// ── AUTO-SAVE ─────────────────────────────────────────────────────────────────
async function autosave() {
  if (!currentProblem || !editor) return;
  const el = document.getElementById('autosave-txt');
  el.textContent = 'Saving...';
  try {
    await postJSON('/api/save_code', {
      problem_id: currentProblem.id,
      language:   getLang(),
      code:       editor.getValue(),
    });
    el.textContent = `Saved ${new Date().toLocaleTimeString()}`;
  } catch (e) {
    el.textContent = 'Save failed!';
  }
}

// ── TAB-SWITCH PREVENTION ─────────────────────────────────────────────────────
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseCurrentClock();
    handleViolation();
  } else {
    if (currentProblem && !solvedSet.has(currentProblem.id)) resumeClock();
  }
});

window.addEventListener('blur',  () => { pauseCurrentClock(); handleViolation(); });
window.addEventListener('focus', () => {
  if (currentProblem && !solvedSet.has(currentProblem.id)) resumeClock();
});

document.addEventListener('click', requestFullscreen, { once: true });

function requestFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen)       el.requestFullscreen().catch(() => {});
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) handleViolation();
});

document.addEventListener('keydown', e => {
  if (
    (e.ctrlKey && ['t', 'w', 'n', 'Tab'].includes(e.key)) ||
    (e.altKey  && e.key === 'Tab') ||
    e.key === 'F12'
  ) {
    e.preventDefault();
    handleViolation();
  }
});

function handleViolation() {
  if (timesUpShown) return;
  tabViolations++;
  document.getElementById('warn-count').textContent = `Violation count: ${tabViolations}`;
  document.getElementById('tab-warning').classList.add('show');
  setTimeout(() => { try { window.focus(); requestFullscreen(); } catch (e) {} }, 100);
}

function dismissWarning() {
  document.getElementById('tab-warning').classList.remove('show');
  try { window.focus(); requestFullscreen(); } catch (e) {}
  if (editor) editor.focus();
}

document.addEventListener('contextmenu', e => e.preventDefault());

// ── RESIZE HANDLE ─────────────────────────────────────────────────────────────
(function initResize() {
  const handle      = document.getElementById('resize-handle');
  const outputPanel = document.getElementById('output-panel');
  let dragging = false, startY = 0, startH = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    startY   = e.clientY;
    startH   = outputPanel.offsetHeight;
    document.body.style.cursor = 'row-resize';
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const newH = Math.max(80, Math.min(400, startH + startY - e.clientY));
    outputPanel.style.height = `${newH}px`;
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
    document.body.style.cursor = '';
  });
})();

// ── UTILS ─────────────────────────────────────────────────────────────────────
async function fetchJSON(url) {
  const r = await fetch(url);
  return r.json();
}

async function postJSON(url, body) {
  const r = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  return r.json();
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}