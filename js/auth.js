/* Auth — Supabase Auth real · Family System
 * Cada perfil (Miguel, Karen) es un usuario real de Supabase con su contraseña.
 * Sin login válido → no hay sesión Supabase → RLS bloquea TODO acceso a datos.
 */
const Auth = (() => {
  const SUPABASE_URL  = 'https://swbbvtcbnycrvzryzndy.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3YmJ2dGNibnljcnZ6cnl6bmR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NDE5OTQsImV4cCI6MjA5NjAxNzk5NH0.970qYgcbeavU0MjM3UCyn8pjsBShstDrEpx6u3LgsN8';
  const PROFILES = {
    miguel: { label: 'Miguel', avatar: '👨', email: 'miguel@family.local' },
    karen:  { label: 'Karen',  avatar: '👩', email: 'karen@family.local' }
  };
  const MIN_LEN = 4;
  let _selected        = null;
  let _client          = null;
  let _currentProfile  = null;   // perfil de la sesión activa (miguel | karen)

  function _emailFor(p) { return PROFILES[p] && PROFILES[p].email; }
  function _profileFromEmail(e) {
    for (const k of Object.keys(PROFILES)) if (PROFILES[k].email === e) return k;
    return null;
  }

  async function init() {
    if (typeof window.supabase === 'undefined') { setTimeout(init, 250); return; }
    _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: true, autoRefreshToken: true, storage: window.localStorage }
    });
    window.supabaseClient = _client;
    try {
      const { data: { session } } = await _client.auth.getSession();
      if (session && session.user) {
        const profile = _profileFromEmail(session.user.email);
        if (profile) { _enterApp(profile); return; }
      }
    } catch(e) { console.warn('auth getSession', e); }
    _renderPicker();
  }

  function _enterApp(profile) {
    _currentProfile = profile;
    const ls = document.getElementById('loginScreen');
    if (ls) ls.style.display = 'none';
    const app = document.getElementById('app');
    if (app) app.style.display = '';
    const fab = document.querySelector('.fab');
    if (fab) fab.style.removeProperty('display');
    if (!window.__appStarted) { window.__appStarted = true; App.init(); }
    if (typeof App !== 'undefined') App.switchUser(profile);
    if (typeof Cloud !== 'undefined') Cloud.init(_client);
    if (typeof Chat  !== 'undefined') Chat.init(_client, profile);
  }

  async function logout() {
    if (!confirm('¿Cerrar sesión?')) return;
    try { if (_client) await _client.auth.signOut(); } catch(e) {}
    location.reload();
  }

  function _screen() { return document.getElementById('loginScreen'); }

  function _renderPicker() {
    _selected = null;
    _screen().innerHTML = `
      <div class="login-box">
        <div class="login-logo">💜</div>
        <h1 class="login-title">Family System</h1>
        <p class="login-sub">Selecciona tu perfil</p>
        <div class="login-profiles">
          ${Object.entries(PROFILES).map(([key, u]) => `
            <button class="login-profile" onclick="Auth.pick('${key}')">
              <span class="login-profile-av">${u.avatar}</span>
              <span class="login-profile-name">${u.label}</span>
            </button>`).join('')}
        </div>
        <p class="login-foot">🔐 Acceso seguro · autenticación real</p>
      </div>`;
    _screen().style.display = 'flex';
  }

  function pick(profile) {
    _selected = profile;
    const p = PROFILES[profile];
    if (!p) return;
    _screen().innerHTML = `
      <div class="login-box">
        <div class="login-logo">${p.avatar}</div>
        <h1 class="login-title">Hola, ${p.label}</h1>
        <input type="password" id="loginPass" class="login-input" placeholder="Tu contraseña" autocomplete="current-password"
          onkeydown="if(event.key==='Enter')Auth.submit()">
        <div class="login-err" id="loginErr"></div>
        <button class="login-btn" onclick="Auth.submit()">Entrar</button>
        <p class="login-hint">Primera vez en cualquier dispositivo: la contraseña que escribas será la tuya (mínimo ${MIN_LEN} caracteres).</p>
        <button class="login-back" onclick="Auth._renderPicker()">← Cambiar de perfil</button>
      </div>`;
    setTimeout(() => { const i = document.getElementById('loginPass'); if (i) i.focus(); }, 120);
  }

  function _err(msg, color) {
    const el = document.getElementById('loginErr');
    if (el) {
      el.textContent = msg || '';
      el.style.color = color || '#EF4444';
    }
  }

  async function submit() {
    const profile  = _selected;
    if (!profile || !PROFILES[profile]) return;
    const password = (document.getElementById('loginPass') || {}).value || '';
    if (password.length < MIN_LEN) { _err('Mínimo ' + MIN_LEN + ' caracteres'); return; }
    if (!_client) { _err('La nube no está cargada. Recarga la página.'); return; }
    const email = _emailFor(profile);
    _err('Verificando…', '#9B8FC4');
    let res = await _client.auth.signInWithPassword({ email, password });
    if (res.error) {
      // Si no existe, lo creamos (primer ingreso global de ese perfil)
      if (/invalid|credentials|email not confirmed/i.test(res.error.message || '')) {
        const su = await _client.auth.signUp({ email, password });
        if (su.error) { _err('No se pudo crear: ' + su.error.message); return; }
        if (!su.data || !su.data.session) {
          const re = await _client.auth.signInWithPassword({ email, password });
          if (re.error) { _err('Contraseña incorrecta'); return; }
        }
        _enterApp(profile);
      } else {
        _err(res.error.message);
      }
      return;
    }
    _enterApp(profile);
  }

  function currentProfile() {
    return _currentProfile || _selected;
  }

  return { init, pick, submit, logout, currentProfile, _renderPicker };
})();
