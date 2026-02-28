async function login() {
  const password = document.getElementById('password').value;
  const errEl    = document.getElementById('error-msg');
  errEl.style.display = 'none';

  if (!password) {
    errEl.textContent   = 'Password required.';
    errEl.style.display = 'block';
    return;
  }

  try {
    const r = await fetch('/admin/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password }),
    });
    const data = await r.json();
    if (data.success) {
      window.location.href = '/admin';
    } else {
      errEl.textContent   = data.error || 'Login failed.';
      errEl.style.display = 'block';
    }
  } catch (e) {
    errEl.textContent   = 'Network error.';
    errEl.style.display = 'block';
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter') login();
});