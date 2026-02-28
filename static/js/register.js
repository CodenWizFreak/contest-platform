let contestActive = false;

async function checkStatus() {
  try {
    const r = await fetch('/api/contest_status');
    const data = await r.json();
    contestActive = data.active;

    const dot  = document.getElementById('status-dot');
    const txt  = document.getElementById('status-text');
    const btn  = document.getElementById('enter-btn');
    const wmsg = document.getElementById('waiting-msg');

    if (contestActive) {
      dot.classList.add('active');
      txt.textContent = 'Contest is LIVE';
      btn.disabled = false;
      wmsg.style.display = 'none';
    } else {
      dot.classList.remove('active');
      txt.textContent = 'Waiting for contest to start...';
      btn.disabled = true;
      wmsg.style.display = 'block';
    }
  } catch (e) {
    document.getElementById('status-text').textContent = 'Server connection error';
  }
}

async function register() {
  const name          = document.getElementById('name').value.trim();
  const college       = document.getElementById('college').value.trim();
  const system_number = document.getElementById('system_number').value.trim();
  const phone         = document.getElementById('phone').value.trim();
  const errEl         = document.getElementById('error-msg');
  errEl.style.display = 'none';

  if (!name || !college || !system_number || !phone) {
    errEl.textContent   = 'All fields are required.';
    errEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('enter-btn');
  btn.textContent = 'Boarding...';
  btn.disabled    = true;

  try {
    const r    = await fetch('/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, college, system_number, phone }),
    });
    const data = await r.json();
    if (data.success) {
      window.location.href = '/contest';
    } else {
      errEl.textContent   = data.error || 'Registration failed.';
      errEl.style.display = 'block';
      btn.textContent     = 'Enter the Ship';
      btn.disabled        = false;
    }
  } catch (e) {
    errEl.textContent   = 'Network error. Try again.';
    errEl.style.display = 'block';
    btn.textContent     = 'Enter the Ship';
    btn.disabled        = false;
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && contestActive) register();
});

checkStatus();
setInterval(checkStatus, 5000);