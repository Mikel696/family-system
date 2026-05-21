/* Google Drive Sync — OAuth2 + Drive REST API v3 · Family System
 * Setup: Google Cloud Console → OAuth 2.0 Client ID (Web application)
 * Authorized JavaScript origins: your app URL (e.g. https://mikel696.github.io)
 * Scope `drive` lets the app find and keep ONE shared document on your Drive.
 */
const DriveSync = (() => {
  const FILENAME   = 'family-system-data.json';
  const SCOPE      = 'https://www.googleapis.com/auth/drive';
  const POLL_MS    = 60000;   // revisa Drive cada 60 s para traer cambios de otros dispositivos
  // Client ID de OAuth 2.0 (información pública por diseño — la seguridad la da el
  // "Authorized JavaScript origin" registrado en Google Cloud). Integrado para que
  // ningún dispositivo tenga que pegarlo a mano.
  const CLIENT_ID  = '996951686845-06ogvm7h3hki2khnf5s9d1n0khvebete.apps.googleusercontent.com';
  let _token       = null;
  let _fileId      = null;
  let _timer       = null;    // debounce de push
  let _pollTimer   = null;    // intervalo de pull automático
  let _client      = null;
  let _status      = 'disconnected';
  let _pulling     = false;   // true mientras se aplican datos remotos (evita re-sync)
  let _lastDocSync = null;    // syncedAt del último documento procesado

  /* ---- Init ---- */
  function init() {
    if (typeof google === 'undefined' || !google.accounts) { console.warn('GIS not loaded'); return; }
    try {
      _client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: async resp => {
          if (resp.error) {
            _setStatus('error');
            App.toast('Error al conectar con Google: ' + resp.error, 'error');
            return;
          }
          _token = resp.access_token;
          State.set('drive_connected', true);
          _setStatus('syncing');
          await pull();          // trae lo remoto (merge, nunca destructivo)
          await push();          // sube el resultado combinado
          _startPolling();       // revisa Drive periódicamente
          _setStatus('connected');
          _refreshSettingsUI();
        }
      });
      // Reconexión silenciosa si ya estaba conectado
      if (State.get('drive_connected') && _client) {
        _client.requestAccessToken({ prompt: '' });
      }
    } catch(e) { console.error('DriveSync init error', e); }
  }

  /* ---- API pública ---- */
  function connect() {
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

  /* Renueva el token de forma silenciosa cuando expira (cada ~1 h) */
  function _renewToken() {
    _token = null;
    if (_client) { try { _client.requestAccessToken({ prompt: '' }); } catch(e) { _setStatus('error'); } }
    else _setStatus('error');
  }

  /* ---- Construcción del documento ---- */
  function _gatherBudgets() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf('karen_budget_') === 0) {
        try { out[k.slice(6)] = JSON.parse(localStorage.getItem(k)); } catch(e) {}
      }
    }
    return out; // claves tipo 'budget_2026-05'
  }

  function _buildPayload() {
    return {
      app:      'Family System',
      version:  '2.0',
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

  /* ---- Merge (gana el más reciente por timestamp, nunca destructivo) ---- */
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
      if (!_fileId) { _setStatus('error'); return; }
      const payload = _buildPayload();
      const r = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${_fileId}?uploadType=media`,
        { method: 'PATCH', headers: { Authorization: 'Bearer ' + _token, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload, null, 2) }
      );
      if (r.status === 401) { _renewToken(); return; }
      if (!r.ok) { console.error('Drive push HTTP', r.status); _setStatus('error'); return; }
      _lastDocSync = payload.syncedAt;   // lo que acabo de subir — el poll no lo re-aplica
      State.set('drive_last_sync', new Date().toISOString());
      _setStatus('connected');
      _updateSyncTime();
    } catch(e) { console.error('Drive push', e); _setStatus('error'); }
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
      if (!r.ok) return;
      const text = await r.text();
      if (!text || !text.trim()) return;          // archivo recién creado, vacío
      let data;
      try { data = JSON.parse(text); }
      catch(e) { console.warn('Drive file no es JSON válido'); return; }
      // ¿Cambió desde la última vez? Si no, no hacemos nada.
      if (data.syncedAt && data.syncedAt === _lastDocSync) { _setStatus('connected'); return; }
      _applyRemote(data);
      _lastDocSync = data.syncedAt || _lastDocSync;
      State.set('drive_last_sync', new Date().toISOString());
      _setStatus('connected');
      _updateSyncTime();
      _refreshCurrent();
      if (silent) App.toast('🔄 Cambios recibidos desde Drive', 'info');
    } catch(e) { console.error('Drive pull', e); }
  }

  /* Revisa Drive periódicamente para traer cambios hechos en otros dispositivos */
  function _startPolling() {
    clearInterval(_pollTimer);
    _pollTimer = setInterval(() => { if (_token) pull({ silent: true }); }, POLL_MS);
  }

  /* ---- Buscar o crear el archivo de datos ---- */
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
      // Crear el archivo ya con contenido — nunca queda vacío
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
      else console.error('Drive create failed', cr.status);
    } catch(e) { console.error('_findOrCreate', e); }
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
      const labels = { disconnected:'No conectado', connected:'Sincronizado', syncing:'Sincronizando…', error:'Error de conexión' };
      lbl.textContent = labels[s] || s;
    }
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

  /* Re-renderiza la sección que el usuario está viendo tras recibir cambios */
  function _refreshCurrent() {
    try {
      const active = document.querySelector('.section.active');
      const id = active ? active.id.replace('sec-', '') : 'dashboard';
      const renders = {
        dashboard:    () => Dashboard.render(),
        transactions: () => Transactions.filter(),
        savings:      () => Savings.render(),
        debts:        () => Debts.render(),
        budget:       () => Budget.render(),
        notes:        () => Notes.render(),
        tasks:        () => Tasks.render(),
        calendar:     () => Calendar.render(),
        payments:     () => Payments.render(),
        reports:      () => Reports.render(),
        settings:     () => Settings.render()
      };
      if (renders[id]) renders[id]();
      if (typeof Alerts !== 'undefined') Alerts.check();
    } catch(e) { console.error('refresh', e); }
  }

  function isConnected() { return !!_token; }
  function getStatus()   { return _status; }

  /* Intercepta State.set para auto-sync */
  const _origSet = State.set.bind(State);
  const _SKIP = ['drive_connected','drive_client_id','drive_last_sync','current_user','dismissed_alerts','auth_users','auth_session'];
  State.set = function(key, value) {
    _origSet(key, value);
    if (_pulling) return;                         // no devolver datos remotos hacia arriba
    if (_token && _SKIP.indexOf(key) === -1) scheduleSync();
  };

  return { init, connect, disconnect, push, pull, scheduleSync, isConnected, getStatus, _setStatus };
})();
