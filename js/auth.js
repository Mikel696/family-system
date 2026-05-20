/* Auth — Candado de acceso local (correo + contraseña) · Family System
 * App sin servidor: la validación ocurre en el dispositivo. La contraseña
 * NUNCA se guarda en texto; solo un hash PBKDF2-SHA256 en este equipo.
 */
const Auth = (() => {
  // Usuarios autorizados → perfil interno de la app
  const AUTHORIZED = {
    'miguelbarros2416@gmail.com':  { profile: 'miguel', label: 'Miguel', avatar: '👨' },
    'avendanozabaletak@gmail.com': { profile: 'karen',  label: 'Karen',  avatar: '👩' }
  };
  const SESSION_HOURS = 24;
  const MIN_LEN = 6;
  let _selected = null;

  /* ---- almacenamiento ---- */
  function _users()      { return State.get('auth_users', {}); }
  function _saveUsers(u) { State.set('auth_users', u); }
  function _session()    { return State.get('auth_session', null); }

  /* ---- criptografía ---- */
  function _randHex(n) {
    const a = new Uint8Array(n); crypto.getRandomValues(a);
    return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  async function _hash(password, saltHex) {
    const enc  = new TextEncoder();
    const salt = Uint8Array.from(saltHex.match(/../g).map(h => parseInt(h, 16)));
    const km   = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, km, 256);
    return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /* ---- sesión ---- */
  function _sessionValid() {
    const s = _session();
    if (!s || !s.email || !s.ts || !AUTHORIZED[s.email]) return false;
    return (Date.now() - s.ts) < SESSION_HOURS * 3600 * 1000;
  }

  /* ---- ciclo de vida ---- */
  function init() {
    if (_sessionValid()) _enterApp(_session().email);
    else _renderPicker();
  }

  function _enterApp(email) {
    const ls = document.getElementById('loginScreen');
    if (ls) ls.style.display = 'none';
    const app = document.getElementById('app');
    if (app) app.style.display = '';
    const bn  = document.querySelector('.bottom-nav');
    if (bn) bn.style.removeProperty('display');
    const fab = document.querySelector('.fab');
    if (fab) fab.style.removeProperty('display');
    if (!window.__appStarted) { window.__appStarted = true; App.init(); }
    const u = AUTHORIZED[email];
    if (u && typeof App !== 'undefined') App.switchUser(u.profile);
  }

  function logout() {
    if (!confirm('¿Cerrar sesión? Tendrás que ingresar tu contraseña de nuevo.')) return;
    State.set('auth_session', null);
    location.reload();
  }

  /* ---- pantalla ---- */
  function _screen() { return document.getElementById('loginScreen'); }

  function _renderPicker() {
    _selected = null;
    const users = _users();
    _screen().innerHTML = `
      <div class="login-box">
        <div class="login-logo">💜</div>
        <h1 class="login-title">Family System</h1>
        <p class="login-sub">Selecciona tu perfil para continuar</p>
        <div class="login-profiles">
          ${Object.entries(AUTHORIZED).map(([email, u]) => `
            <button class="login-profile" onclick="Auth.pick('${email}')">
              <span class="login-profile-av">${u.avatar}</span>
              <span class="login-profile-name">${u.label}</span>
              <span class="login-profile-state">${users[email] ? '🔒 Con contraseña' : '✨ Primer ingreso'}</span>
            </button>`).join('')}
        </div>
        <p class="login-foot">🔐 El acceso está protegido en este dispositivo</p>
      </div>`;
    _screen().style.display = 'flex';
  }

  function pick(email) {
    _selected = email;
    const u = AUTHORIZED[email];
    if (!u) return;
    const exists = !!_users()[email];
    _screen().innerHTML = `
      <div class="login-box">
        <div class="login-logo">${u.avatar}</div>
        <h1 class="login-title">Hola, ${u.label}</h1>
        <p class="login-sub">${email}</p>
        ${exists ? `
          <input type="password" id="loginPass" class="login-input" placeholder="Tu contraseña"
            onkeydown="if(event.key==='Enter')Auth.submit()">
          <div class="login-err" id="loginErr"></div>
          <button class="login-btn" onclick="Auth.submit()">Entrar</button>
        ` : `
          <p class="login-hint">Primer ingreso — crea tu contraseña (mínimo ${MIN_LEN} caracteres)</p>
          <input type="password" id="loginPass" class="login-input" placeholder="Crea una contraseña">
          <input type="password" id="loginPass2" class="login-input" placeholder="Repite la contraseña"
            onkeydown="if(event.key==='Enter')Auth.submit()">
          <div class="login-err" id="loginErr"></div>
          <button class="login-btn" onclick="Auth.submit()">Crear y entrar</button>
        `}
        <button class="login-back" onclick="Auth._renderPicker()">← Cambiar de perfil</button>
      </div>`;
    setTimeout(() => { const i = document.getElementById('loginPass'); if (i) i.focus(); }, 120);
  }

  function _err(msg) {
    const el = document.getElementById('loginErr');
    if (el) el.textContent = msg || '';
  }

  async function submit() {
    const email = _selected;
    if (!email || !AUTHORIZED[email]) return;
    const pass  = (document.getElementById('loginPass') || {}).value || '';
    const users = _users();
    const rec   = users[email];

    try {
      if (rec) {
        const h = await _hash(pass, rec.salt);
        if (h === rec.hash) _grant(email);
        else _err('Contraseña incorrecta');
      } else {
        const pass2 = (document.getElementById('loginPass2') || {}).value || '';
        if (pass.length < MIN_LEN) { _err('La contraseña debe tener al menos ' + MIN_LEN + ' caracteres'); return; }
        if (pass !== pass2)        { _err('Las contraseñas no coinciden'); return; }
        const salt = _randHex(16);
        const hash = await _hash(pass, salt);
        users[email] = { profile: AUTHORIZED[email].profile, salt, hash, createdAt: new Date().toISOString() };
        _saveUsers(users);
        _grant(email);
      }
    } catch (e) {
      console.error('Auth submit', e);
      _err('Ocurrió un error. Intenta de nuevo.');
    }
  }

  function _grant(email) {
    State.set('auth_session', { email, ts: Date.now() });
    _enterApp(email);
  }

  function currentEmail() { return _sessionValid() ? _session().email : null; }

  return { init, pick, submit, logout, currentEmail, _renderPicker };
})();
