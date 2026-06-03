/* Google Drive Sync — OAuth2 + Drive REST API v3 · Family System
 * Sync automática entre dispositivos. Manejo robusto de errores y sesión.
 */
const DriveSync = (() => {
  const FILENAME   = 'family-system-data.json';
  const SCOPE      = 'https://www.googleapis.com/auth/drive';
  const POLL_MS    = 30000;   // revisa Drive cada 30 s
  const CLIENT_ID  = '996951686845-06ogvm7h3hki2khnf5s9d1n0khvebete.apps.googleusercontent.com';

  let _token         = null;
  let _fileId        = null;
  let _timer         = null;    // debounce de push
  let _pollTimer     = null;    // intervalo de pull
  let _client        = null;
  let _status        = 'disconnected';
  let _pulling       = false;
  let _isReconnecting = false;  // true mientras intentamos renovar token silenciosamente
  let _lastDocSync   = null;

  /* ---- Init ---- */
  function init() {
    if (typeof google === 'undefined' || !google.accounts) { console.warn('GIS not loaded'); return; }
    try {
      _client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: async resp => {
          if (resp.error) {
            if (_isReconnecting) {
              _setError('La sesión de Drive caducó. Toca el ícono de Drive en la parte superior para reconectar.');
            } else {
              _setStatus('error');
              App.toast('Error al conectar con Google: ' + resp.error, 'error');
            }
            _isReconnecting = false;
            return;
          }
          _isReconnecting = false;
          _token = resp.access_token;
          State.set('drive_connected', true);
          State.set('drive_last_error', '');
          _setStatus('syncing');
          await pull();
          await push();
          _startPolling();
          _setStatus('connected');
          _refreshSettingsUI();
        }
      });
      if (State.get('drive_connected') && _client) {
        _isReconnecting = true;
        _client.requestAccessToken({ prompt: '' });
      }
    } catch(e) { console.error('DriveSync init error', e); }
  }

  /* ---- API pública ---- */
  function connect() {
    _isReconnecting = false;
    if (!_client) init();
    if (!_client) { App.toast('Recarga la página e intenta de nuevo', 'error'); return; }
    _client.requestAccessToken({ prompt: 'select_account' });
  }

  function disconnect() {
    if (_token && typeof google !== 'undefined') {
      google.accounts.oauth2.revoke(_token, () => {});
    }
    _token = null; _fileId = null;
    clearInterval(_pollTimer);
    State.set('drive_connected', false);
    State.set('drive_last_error', '');
    _setStatus('disconnected');
    App.toast('Desconectado de Google Drive', 'info');
    _refreshSettingsUI();
  }

  function scheduleSync() {
    if (!_token) return;
    clearTimeout(_timer);
    _setStatus('syncing');
    _timer = setTimeout(() => push(), 2500);
  }

  function _renewToken() {
    _token = null;
    if (_client) {
      _isReconnecting = true;
      try { _client.requestAccessToken({ prompt: '' }); }
      catch(e) { _isReconnecting = false; _setError('La sesión de Drive caducó. Toca el ícono de Drive para reconectar.'); }
    } else {
      _setError('Drive desconectado.');
    }
  }

  /* ---- Payload ---- */
  function _gatherBudgets() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf('karen_budget_') === 0) {
        try { out[k.slice(6)] = JSON.parse(localStorage.getItem(k)); } catch(e) {}
      }
    }
    return out;
  }

  function _buildPayload() {
    return {
      app:      'Family System',
      version:  '2.1',
      syncedAt: new Date().toISOString(),
      device:   (navigator.userAgent || '').slice(0, 90),
      transactions:    State.getTransactions(),
      savings:         State.getSavings(),
      debts:           State.getDebts(),
      notes:           State.getNotes(),
      taskLists:       State.getTaskLists(),
      paymentServices: State.getPaymentServices(),
      budgets:         _gatherBudgets(),
      settings:        State.getSettings(),
      dismissedAlerts: State.get('dismissed_alerts', [])
    };
  }

  /* ---- Merge ---- */
  function _ts(x) {
    return Date.parse((x && (x.updatedAt || x.createdAt)) || '') || 0;
  }
  function _mergeById(local, remote) {
    const map = {};
    (Array.isArray(local)  ? local  : []).forEach(x => { if (x && x.id) map[x.id] = x; });
    (Array.isArray(remote) ? remote : []).forEach(x => {
      if (!x || !x.id) return;
      const cur = map[x.id];
      if (!cur || _ts(x) >= _ts(cur)) map[x.id] = x;
    });
    return Object.values(map);
  }

  function _applyRemote(data) {
    _pulling = true;
    try {
      State.set('transactions',     _mergeById(State.getTransactions(),    data.transactions));
      State.set('savings',          _mergeById(State.getSavings(),         data.savings));
      State.set('debts',            _mergeById(State.getDebts(),           data.debts));
      State.set('notes',            _mergeById(State.getNotes(),           data.notes));
      State.set('tasklists',        _mergeById(State.getTaskLists(),       data.taskLists));
      State.set('payment_services', _mergeById(State.getPaymentServices(), data.paymentServices));
      if (data.budgets && typeof data.budgets === 'object') {
        Object.keys(data.budgets).forEach(bk => {
          if (State.get(bk, null) === null) State.set(bk, data.budgets[bk]);
        });
      }
      // Perfiles (avatares + nombres) — se sincronizan entre dispositivos
      if (data.settings && data.settings.profiles) {
        const local = State.getSettings();
        local.profiles = Object.assign({}, local.profiles || {}, data.settings.profiles);
        State.saveSettings(local);
      }
      if (Array.isArray(data.dismissedAlerts)) {
        const merged = [...new Set([...(State.get('dismissed_alerts', []) || []), ...data.dismissedAlerts])];
        State.set('dismissed_alerts', merged);
      }
    } finally {
      _pulling = false;
    }
  }

  /* ---- Push / Pull ---- */
  async function push() {
    if (!_token) return;
    _setStatus('syncing');
    try {
      if (!_fileId) await _findOrCreate();
      if (!_fileId) { _setError('No se pudo encontrar el archivo de datos en Drive.'); return; }
      const payload = _buildPayload();
      const r = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${_fileId}?uploadType=media`,
        { method: 'PATCH', headers: { Authorization: 'Bearer ' + _token, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload, null, 2) }
      );
      if (r.status === 401) { _renewToken(); return; }
      if (!r.ok) { _setError('Error al guardar en Drive (HTTP ' + r.status + ')'); return; }
      _lastDocSync = payload.syncedAt;
      State.set('drive_last_sync', new Date().toISOString());
      State.set('drive_last_error', '');
      _setStatus('connected');
      _updateSyncTime();
    } catch(e) {
      console.error('Drive push', e);
      _setError('Sin conexión a Drive. Revisa tu internet.');
    }
  }

  async function pull(opts) {
    if (!_token) return;
    const silent = opts && opts.silent;
    try {
      if (!_fileId) await _findOrCreate();
      if (!_fileId) return;
      const r = await fetch(
        `https://www.googleapis.com/drive/v3/files/${_fileId}?alt=media`,
        { headers: { Authorization: 'Bearer ' + _token } }
      );
      if (r.status === 401) { _renewToken(); return; }
      if (!r.ok) { if (!silent) _setError('Error al leer de Drive (HTTP ' + r.status + ')'); return; }
      const text = await r.text();
      if (!text || !text.trim()) return;
      let data;
      try { data = JSON.parse(text); }
      catch(e) { console.warn('Drive file no es JSON válido'); return; }
      if (data.syncedAt && data.syncedAt === _lastDocSync) { _setStatus('connected'); return; }
      _applyRemote(data);
      _lastDocSync = data.syncedAt || _lastDocSync;
      State.set('drive_last_sync', new Date().toISOString());
      State.set('drive_last_error', '');
      _setStatus('connected');
      _updateSyncTime();
      _refreshCurrent();
      if (silent) App.toast('🔄 Datos actualizados desde Drive', 'info');
    } catch(e) {
      console.error('Drive pull', e);
      if (!silent) _setError('Sin conexión a Drive. Revisa tu internet.');
    }
  }

  function _startPolling() {
    clearInterval(_pollTimer);
    _pollTimer = setInterval(() => { if (_token) pull({ silent: true }); }, POLL_MS);
  }

  /* Cuando la app vuelve a primer plano, traer cambios inmediatamente */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && _token) pull({ silent: true });
  });

  /* ---- Archivo de datos ---- */
  async function _findOrCreate() {
    try {
      const q = encodeURIComponent(`name='${FILENAME}' and trashed=false`);
      const r = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`,
        { headers: { Authorization: 'Bearer ' + _token } }
      );
      if (r.ok) {
        const { files } = await r.json();
        if (files && files.length > 0) { _fileId = files[0].id; return; }
      }
      const boundary = '----family-system-' + Date.now();
      const metadata = { name: FILENAME, mimeType: 'application/json' };
      const multipart =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify(metadata) +
        `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
        JSON.stringify(_buildPayload(), null, 2) +
        `\r\n--${boundary}--`;
      const cr = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + _token, 'Content-Type': 'multipart/related; boundary=' + boundary },
        body: multipart
      });
      if (cr.ok) { const f = await cr.json(); _fileId = f.id; }
      else _setError('No se pudo crear el archivo en Drive.');
    } catch(e) { console.error('_findOrCreate', e); _setError('Sin conexión a Drive.'); }
  }

  /* ---- UI ---- */
  function _setStatus(s) {
    _status = s;
    const el = document.getElementById('driveSyncDot');
    if (el) {
      const colors = { disconnected:'#6B7280', connected:'#10B981', syncing:'#F59E0B', error:'#EF4444' };
      el.style.background = colors[s] || '#6B7280';
    }
    const lbl = document.getElementById('driveSyncLabel');
    if (lbl) {
      const labels = { disconnected:'No conectado', connected:'Sincronizado', syncing:'Sincronizando…', error:'⚠️ Reconectar' };
      lbl.textContent = labels[s] || s;
    }
  }

  function _setError(msg) {
    State.set('drive_last_error', msg);
    _setStatus('error');
    if (typeof App !== 'undefined') App.toast('⚠️ ' + msg, 'error', 6000);
    _refreshSettingsUI();
  }

  function _updateSyncTime() {
    const el = document.getElementById('driveLastSync');
    if (!el) return;
    const t = State.get('drive_last_sync');
    el.textContent = t ? 'Última sync: ' + Utils.formatDateTime(t) : '';
  }

  function _refreshSettingsUI() {
    if (typeof Settings !== 'undefined') Settings.render();
  }

  function _refreshCurrent() {
    try {
      const active = document.querySelector('.section.active');
      const id = active ? active.id.replace('sec-', '') : 'dashboard';
      const renders = {
        dashboard: () => Dashboard.render(),
        transactions: () => Transactions.filter(),
        savings: () => Savings.render(),
        debts: () => Debts.render(),
        budget: () => Budget.render(),
        notes: () => Notes.render(),
        tasks: () => Tasks.render(),
        calendar: () => Calendar.render(),
        payments: () => Payments.render(),
        reports: () => Reports.render(),
        settings: () => Settings.render()
      };
      if (renders[id]) renders[id]();
      if (typeof Alerts !== 'undefined') Alerts.check();
      // Refrescar UI del usuario en topbar (avatar/nombre por si cambió desde Drive)
      if (typeof App !== 'undefined' && App.refreshUserUI) App.refreshUserUI();
    } catch(e) { console.error('refresh', e); }
  }

  function isConnected() { return !!_token; }
  function getStatus()   { return _status; }
  function getLastError(){ return State.get('drive_last_error', ''); }

  /* Intercepta State.set para auto-sync */
  const _origSet = State.set.bind(State);
  const _SKIP = ['drive_connected','drive_client_id','drive_last_sync','drive_last_error','current_user','dismissed_alerts','auth_users','auth_session'];
  State.set = function(key, value) {
    _origSet(key, value);
    if (_pulling) return;
    if (_token && _SKIP.indexOf(key) === -1) scheduleSync();
  };

  return { init, connect, disconnect, push, pull, scheduleSync, isConnected, getStatus, getLastError, _setStatus };
})();
