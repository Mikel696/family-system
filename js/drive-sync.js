/* Google Drive Sync — OAuth2 + Drive REST API v3 · Family System
 * Setup: Google Cloud Console → OAuth 2.0 Client ID (Web application)
 * Authorized JavaScript origins: your app URL (e.g. http://localhost:3457)
 * Scope `drive` lets the app find and keep ONE shared document on your Drive.
 */
const DriveSync = (() => {
  const FILENAME = 'family-system-data.json';
  const SCOPE    = 'https://www.googleapis.com/auth/drive';
  let _token   = null;
  let _fileId  = null;
  let _timer   = null;
  let _client  = null;
  let _status  = 'disconnected';
  let _pulling = false;   // true while applying remote data (suppresses re-sync)

  /* ---- Init ---- */
  function init() {
    const clientId = State.get('drive_client_id', '');
    if (!clientId) return;
    if (typeof google === 'undefined' || !google.accounts) { console.warn('GIS not loaded'); return; }
    try {
      _client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: async resp => {
          if (resp.error) { _setStatus('error'); App.toast('Error al conectar con Google: ' + resp.error, 'error'); return; }
          _token = resp.access_token;
          State.set('drive_connected', true);
          App.toast('✅ Conectado a Google Drive', 'success');
          _setStatus('syncing');
          await pull();      // bring remote in (merged, never destructive)
          await push();      // write the merged result back
          _setStatus('connected');
          _refreshSettingsUI();
        }
      });
      // Auto-reconnect silently if previously connected
      if (State.get('drive_connected') && _client) {
        _client.requestAccessToken({ prompt: '' });
      }
    } catch(e) { console.error('DriveSync init error', e); }
  }

  /* ---- Public API ---- */
  function connect() {
    const clientId = State.get('drive_client_id', '');
    if (!clientId) { App.toast('Ingresa tu Client ID de Google en Ajustes primero', 'warning'); return; }
    if (!_client) init();
    if (!_client) { App.toast('Recarga la página e intenta de nuevo', 'error'); return; }
    _client.requestAccessToken({ prompt: 'select_account' });
  }

  function disconnect() {
    if (_token && typeof google !== 'undefined') {
      google.accounts.oauth2.revoke(_token, () => {});
    }
    _token = null; _fileId = null;
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

  /* ---- Payload build ---- */
  function _gatherBudgets() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf('karen_budget_') === 0) {
        try { out[k.slice(6)] = JSON.parse(localStorage.getItem(k)); } catch(e) {}
      }
    }
    return out; // keys look like 'budget_2026-05'
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

  /* ---- Merge (last-write-wins by timestamp, never destructive) ---- */
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
      const body = JSON.stringify(_buildPayload(), null, 2);
      const r = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${_fileId}?uploadType=media`,
        { method: 'PATCH', headers: { Authorization: 'Bearer ' + _token, 'Content-Type': 'application/json' }, body }
      );
      if (r.status === 401) { _token = null; _setStatus('error'); return; }
      if (!r.ok) { console.error('Drive push HTTP', r.status); _setStatus('error'); return; }
      State.set('drive_last_sync', new Date().toISOString());
      _setStatus('connected');
      _updateSyncTime();
    } catch(e) { console.error('Drive push', e); _setStatus('error'); }
  }

  async function pull() {
    if (!_token) return;
    try {
      if (!_fileId) await _findOrCreate();
      if (!_fileId) return;
      const r = await fetch(
        `https://www.googleapis.com/drive/v3/files/${_fileId}?alt=media`,
        { headers: { Authorization: 'Bearer ' + _token } }
      );
      if (r.status === 401) { _token = null; _setStatus('error'); return; }
      if (!r.ok) return;
      const text = await r.text();
      if (!text || !text.trim()) return; // brand-new empty file — nothing to merge
      let data;
      try { data = JSON.parse(text); }
      catch(e) { console.warn('Drive file is not valid JSON, skipping merge'); return; }
      _applyRemote(data);
      State.set('drive_last_sync', new Date().toISOString());
      _updateSyncTime();
      _refreshCurrent();
    } catch(e) { console.error('Drive pull', e); }
  }

  /* ---- Find or create the data file ---- */
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
      // Create the file already populated — it is never left empty
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

  /* ---- UI helpers ---- */
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

  function _refreshCurrent() {
    try { if (typeof Dashboard !== 'undefined') Dashboard.render(); } catch(e) {}
    try { if (typeof Alerts   !== 'undefined') Alerts.check();    } catch(e) {}
  }

  function isConnected() { return !!_token; }
  function getStatus()   { return _status; }

  /* Intercept State.set for auto-sync */
  const _origSet = State.set.bind(State);
  const _SKIP = ['drive_connected','drive_client_id','drive_last_sync','current_user','dismissed_alerts','auth_users','auth_session'];
  State.set = function(key, value) {
    _origSet(key, value);
    if (_pulling) return;                       // don't echo remote data back up
    if (_token && _SKIP.indexOf(key) === -1) scheduleSync();
  };

  return { init, connect, disconnect, push, pull, scheduleSync, isConnected, getStatus, _setStatus };
})();
