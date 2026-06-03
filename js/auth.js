/* Auth — Candado de acceso local · Family System
 * Sin emails. Solo perfil + contraseña por dispositivo.
 * La contraseña nunca sale del equipo (hash PBKDF2-SHA256).
 */
const Auth = (() => {
  const PROFILES = {
    miguel: { label: 'Miguel', avatar: '👨' },
    karen:  { label: 'Karen',  avatar: '👩' }
  };
  const SESSION_HOURS = 24;
  const MIN_LEN = 4;
  let _selected = null;

  function _users()      { return State.get('auth_users', {}); }
  function _saveUsers(u) { State.set('auth_users', u); }
  function _session()    { return State.get('auth_session', null); }

  /* Migración silenciosa: usuarios viejos por email → keys de perfil */
  function _migrate() {
    const u = _users();
    const oldEmails = {
      'miguelbarros2416@gmail.com':  'miguel',
      'avendanozabaletak@gmail.com': 'karen'
    };
    let changed = false;
    Object.keys(oldEmails).forEach(email => {
      const profile = oldEmails[email];
      if (u[email] && !u[profile]) {
        u[profile] = { profile, salt: u[email].salt, hash: u[email].hash, createdAt: u[email].createdAt };
        delete u[email];
        changed = true;
      }
    });
    const s = _session();
    if (s && s.email && oldEmails[s.email]) {
      State.set('auth_session', { profile: oldEmails[s.email], ts: s.ts });
    }
    if (changed) _saveUsers(u);
  }

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

  function _sessionValid() {
    const s = _session();
    if (!s || !s.profile || !s.ts || !PROFILES[s.profile]) return false;
    return (Date.now() - s.ts) < SESSION_HOURS * 3600 * 1000;
  }

  function init() {
    _migrate();
    if (_sessionValid()) _enterApp(_session().profile);
    else _renderPicker();
  }

  function _enterApp(profile) {
    const ls = document.getElementById('loginScreen');
    if (ls) ls.style.display = 'none';
    const app = document.getElementById('app');
    if (app) app.style.display = '';
    const bn = document.querySelector('.bottom-nav');
    if (bn) bn.style.removeProperty('display');
    const fab = document.querySelector('.fab');
    if (fab) fab.style.removeProperty('display');
    if (!window.__appStarted) { window.__appStarted = true; App.init(); }
    if (PROFILES[profile] && typeof App !== 'undefined') App.switchUser(profile);
  }

  function logout() {
    if (!confirm('¿Cerrar sesión? Tendrás que ingresar tu contraseña de nuevo.')) return;
    State.set('auth_session', null);
    location.reload();
  }

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
          ${Object.entries(PROFILES).map(([key, u]) => `
            <button class="login-profile" onclick="Auth.pick('${key}')">
              <span class="login-profile-av">${u.avatar}</span>
              <span class="login-profile-name">${u.label}</span>
              <span class="login-profile-state">${users[key] ? '🔒 Con contraseña' : '✨ Primer ingreso'}</span>
            </button>`).join('')}
        </div>
        <p class="login-foot">🔐 Acceso protegido en este dispositivo</p>
      </div>`;
    _screen().style.display = 'flex';
  }

  function pick(profile) {
    _selected = profile;
    const p = PROFILES[profile];
    if (!p) return;
    const exists = !!_users()[profile];
    _screen().innerHTML = `
      <div class="login-box">
        <div class="login-logo">${p.avatar}</div>
        <h1 class="login-title">Hola, ${p.label}</h1>
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
    const profile = _selected;
    if (!profile || !PROFILES[profile]) return;
    const pass = (document.getElementById('loginPass') || {}).value || '';
    const users = _users();
    const rec   = users[profile];
    try {
      if (rec) {
        const h = await _hash(pass, rec.salt);
        if (h === rec.hash) _grant(profile);
        else _err('Contraseña incorrecta');
      } else {
        const pass2 = (document.getElementById('loginPass2') || {}).value || '';
        if (pass.length < MIN_LEN) { _err('La contraseña debe tener al menos ' + MIN_LEN + ' caracteres'); return; }
        if (pass !== pass2)        { _err('Las contraseñas no coinciden'); return; }
        const salt = _randHex(16);
        const hash = await _hash(pass, salt);
        users[profile] = { profile, salt, hash, createdAt: new Date().toISOString() };
        _saveUsers(users);
        _grant(profile);
      }
    } catch (e) {
      console.error('Auth submit', e);
      _err('Ocurrió un error. Intenta de nuevo.');
    }
  }

  function _grant(profile) {
    State.set('auth_session', { profile, ts: Date.now() });
    _enterApp(profile);
  }

  function currentProfile() { return _sessionValid() ? _session().profile : null; }

  return { init, pick, submit, logout, currentProfile, _renderPicker };
})();
