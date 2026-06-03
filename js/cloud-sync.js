/* Cloud Sync — Supabase backend · Family System
 *
 * Diseño robusto con cola persistente ("outbox"):
 *   - Cada State.set que cambia un doc lo marca como "dirty" en una cola
 *     guardada en localStorage. Si la app se cierra o se cae internet, la cola
 *     sobrevive y se procesa al recargar / al volver online.
 *   - Un único procesador (_flush) recorre la cola en serie, hace pull-merge-push
 *     y solo borra de la cola lo que subió OK.
 *   - Reintenta automáticamente en: window 'online', visibilitychange, cada 15 s,
 *     y al recibir cualquier nuevo cambio.
 *   - Si una sesión expira o el token está mal, intenta refrescarla y reintenta.
 *   - El badge de la nube refleja el estado real: pendientes, sync, OK o error.
 */
const Cloud = (() => {
  const TABLE        = 'family_data';
  const PENDING_KEY  = 'cloud_pending';
  const RETRY_MS     = 15000;          // reintento automático cada 15 s si quedan pendientes
  const DEBOUNCE_MS  = 600;            // tras un cambio, esperar 0.6 s antes del flush
  const ARRAY_DOCS   = ['transactions','savings','debts','notes','tasklists','payment_services'];

  let _client       = null;
  let _channel      = null;
  let _status       = 'disconnected';
  let _pulling      = false;
  let _processing   = false;
  let _flushTimer   = null;
  let _pending      = new Set();       // docIds pendientes de subir
  let _lastTs       = {};              // docId → updated_at remoto procesado

  /* =================== INIT =================== */
  async function init(client) {
    _client = client || window.supabaseClient;
    if (!_client) { _setError('Cliente Supabase no disponible'); return; }

    // Cargar cola persistente
    try {
      const arr = State.get(PENDING_KEY, []);
      if (Array.isArray(arr)) arr.forEach(d => _pending.add(d));
    } catch(e) {}

    if (!await _ensureSession()) return;

    try {
      _setStatus('syncing');
      await pullAll();
      // ⚠️ Ya NO seedeamos dirty inicial: causaba que un dispositivo pasivo
      // subiera su versión local pisando cambios que otro dispositivo acababa
      // de hacer. Si hay algo realmente pendiente, está en la cola persistente.
      _subscribe();
      _flush();                         // procesa cola pendiente real
      _setStatus(_pending.size ? 'syncing' : 'connected');
      State.set('drive_last_sync', new Date().toISOString());
      State.set('drive_last_error', '');
    } catch (e) {
      console.error('Cloud init', e);
      _setError('No se pudo conectar a la nube: ' + (e.message || e));
    }
  }

  /* =================== PENDING / OUTBOX =================== */
  function _markDirty(docId) {
    _pending.add(docId);
    _savePending();
    _scheduleFlush();
    _setStatus('syncing');
  }
  function _savePending() {
    try { State.set(PENDING_KEY, [..._pending]); } catch(e) {}
  }
  function _scheduleFlush() {
    clearTimeout(_flushTimer);
    _flushTimer = setTimeout(_flush, DEBOUNCE_MS);
  }

  /* Procesa la cola de pendientes. Si algo falla, deja en la cola para reintentar. */
  async function _flush() {
    if (_processing || !_client) return;
    if (_pending.size === 0) { _setStatus('connected'); return; }
    if (!await _ensureSession()) return;
    _processing = true;
    let anyFailed = false;
    try {
      // Tomar snapshot — la cola puede crecer durante el procesamiento
      const docs = [..._pending];
      for (const docId of docs) {
        const ok = await _tryPushOne(docId);
        if (ok) {
          _pending.delete(docId);
          _savePending();
        } else {
          anyFailed = true;
          break; // si uno falla, paramos y reintentamos luego
        }
      }
    } finally {
      _processing = false;
    }
    if (_pending.size === 0 && !anyFailed) {
      _setStatus('connected');
      State.set('drive_last_sync', new Date().toISOString());
      State.set('drive_last_error', '');
    }
  }

  async function _tryPushOne(docId) {
    try {
      // Pull-merge SIEMPRE: traer lo remoto y mergear ANTES de subir.
      // Esto evita pisar cambios que otros dispositivos acaban de hacer.
      await _pullDocAndMerge(docId);
      const value = _gatherDoc(docId);
      if (value === undefined) return true;   // nada que subir
      const updated_at = new Date().toISOString();
      const { data: returned, error } = await _client.from(TABLE).upsert({ id: docId, data: value, updated_at }).select().maybeSingle();
      if (error) {
        if (/row-level security|policy/i.test(error.message || '')) {
          // Sesión muerta — pedimos refresh y reintentamos una vez
          const ok = await _tryRefreshSession();
          if (ok) {
            const retry = await _client.from(TABLE).upsert({ id: docId, data: value, updated_at });
            if (retry.error) { _setError('Sesión inválida. Vuelve a iniciar sesión.'); return false; }
          } else {
            _setError('Sesión expirada. Toca "Cerrar sesión y volver a entrar".');
            return false;
          }
        } else {
          _setError('Error al guardar: ' + error.message);
          return false;
        }
      }
      _lastTs[docId] = (returned && returned.updated_at) || updated_at;
      return true;
    } catch(e) {
      console.warn('tryPushOne', docId, e);
      return false;
    }
  }

  /* =================== AUTH =================== */
  async function _ensureSession() {
    if (!_client) return false;
    try {
      const { data: { session } } = await _client.auth.getSession();
      if (!session || !session.user) {
        // Intento de refresh antes de declarar muerta la sesión
        const refreshed = await _tryRefreshSession();
        if (!refreshed) {
          _setError('Sesión expirada — toca "Cerrar sesión y volver a entrar".');
          return false;
        }
      }
      return true;
    } catch (e) {
      _setError('No se pudo verificar la sesión: ' + (e.message || e));
      return false;
    }
  }

  async function _tryRefreshSession() {
    try {
      const { data, error } = await _client.auth.refreshSession();
      return !error && data && data.session;
    } catch(e) { return false; }
  }

  /* =================== PULL =================== */
  async function pullAll() {
    if (!_client) return;
    const { data, error } = await _client.from(TABLE).select('id, data, updated_at');
    if (error) { _setError('Error al leer: ' + error.message); return; }
    if (!data) return;
    _pulling = true;
    try { data.forEach(row => _applyDoc(row.id, row.data, row.updated_at)); }
    finally { _pulling = false; }
  }

  async function _pullDocAndMerge(docId) {
    if (!_client) return;
    try {
      const { data: rows } = await _client.from(TABLE).select('data, updated_at').eq('id', docId).limit(1);
      if (!rows || rows.length === 0) return;
      const row = rows[0];
      // ⚠️ Ya NO skipeamos por _lastTs: siempre mergeamos lo remoto
      // (es barato y evita pisar cambios de otros dispositivos).
      _pulling = true;
      try { _applyDoc(docId, row.data, row.updated_at); }
      finally { _pulling = false; }
    } catch(e) { console.warn('pullDocAndMerge', e); }
  }

  function _applyDoc(id, data, ts) {
    _lastTs[id] = ts;
    if (id === 'profiles') {
      const s = State.getSettings();
      s.profiles = Object.assign({}, s.profiles || {}, data || {});
      State.saveSettings(s);
      if (typeof App !== 'undefined' && App.refreshUserUI) App.refreshUserUI();
      return;
    }
    if (id === 'dismissed_alerts') {
      const merged = [...new Set([...(State.get('dismissed_alerts', []) || []), ...(Array.isArray(data) ? data : [])])];
      State.set('dismissed_alerts', merged);
      return;
    }
    if (id.indexOf('budget_') === 0) {
      State.set(id, data);
      return;
    }
    if (Array.isArray(data) && ARRAY_DOCS.indexOf(id) !== -1) {
      // Merge RAW (con _deleted incluido) — los renders ya filtran los borrados.
      const local = State.get(id, []);
      State.set(id, _mergeById(local, data));
      return;
    }
  }

  function _ts(x) { return Date.parse((x && (x.updatedAt || x.createdAt)) || '') || 0; }
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

  function _gatherDoc(id) {
    // ⚠️ Usamos State.get RAW (no los getters) para incluir items con _deleted=true
    // y propagar los borrados a otros dispositivos.
    if (id === 'transactions')     return State.get('transactions',    []);
    if (id === 'savings')          return State.get('savings',         []);
    if (id === 'debts')            return State.get('debts',           []);
    if (id === 'notes')            return State.get('notes',           []);
    if (id === 'tasklists')        return State.get('tasklists',       []);
    if (id === 'payment_services') return State.get('payment_services',[]);
    if (id === 'profiles')         return State.getSettings().profiles || {};
    if (id === 'dismissed_alerts') return State.get('dismissed_alerts', []);
    if (id.indexOf('budget_') === 0) return State.get(id, []);
    return undefined;
  }

  /* =================== REALTIME =================== */
  function _subscribe() {
    if (!_client) return;
    if (_channel) { try { _channel.unsubscribe(); } catch(e){} }
    _channel = _client.channel('family_data_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, payload => {
        try {
          const row = payload.new || payload.old;
          if (!row || !row.id) return;
          if (_lastTs[row.id] === row.updated_at) return;  // mi propia escritura
          _pulling = true;
          try { _applyDoc(row.id, row.data, row.updated_at); }
          finally { _pulling = false; }
          _refreshCurrent();
        } catch (e) { console.error('realtime', e); }
      })
      .subscribe(status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // Intento de reconexión en próximo flush/visibility
          console.warn('realtime channel:', status);
        }
      });
  }

  /* =================== UI / status =================== */
  function _setStatus(s) {
    _status = s;
    const el = document.getElementById('driveSyncDot');
    if (el) {
      const colors = { disconnected:'#6B7280', connected:'#10B981', syncing:'#F59E0B', error:'#EF4444' };
      el.style.background = colors[s] || '#6B7280';
    }
    const lbl = document.getElementById('driveSyncLabel');
    if (lbl) {
      const labels = {
        disconnected:'Conectando…',
        connected:'Sincronizado',
        syncing: _pending.size > 0 ? ('Subiendo ' + _pending.size + '…') : 'Sincronizando…',
        error:'⚠️ Reconectar'
      };
      lbl.textContent = labels[s] || s;
    }
  }

  let _lastErrorAt = 0;
  function _setError(msg) {
    console.error('Cloud error:', msg);
    State.set('drive_last_error', msg);
    _setStatus('error');
    const now = Date.now();
    if (typeof App !== 'undefined' && (now - _lastErrorAt) > 8000) {
      _lastErrorAt = now;
      App.toast('⚠️ ' + msg, 'error', 5000);
    }
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
      if (typeof App !== 'undefined' && App.refreshUserUI) App.refreshUserUI();
    } catch(e) { console.error('refresh', e); }
  }

  /* =================== TRIGGERS DE REINTENTO =================== */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && _client) {
      pullAll().then(() => { _refreshCurrent(); _flush(); });
    }
  });
  window.addEventListener('online', () => {
    if (_client) _flush();
  });
  // Reintento periódico mientras haya pendientes
  setInterval(() => { if (_client && _pending.size > 0) _flush(); }, RETRY_MS);
  // Best-effort al cerrar pestaña (no garantizado pero ayuda)
  window.addEventListener('beforeunload', () => {
    if (_pending.size > 0) {
      try { State.set(PENDING_KEY, [..._pending]); } catch(e) {}
    }
  });

  /* =================== INTERCEPTOR STATE.set =================== */
  const _origSet = State.set.bind(State);
  const _SKIP = ['drive_connected','drive_client_id','drive_last_sync','drive_last_error','current_user','auth_users','auth_session','chat_last_read','cloud_pending'];
  State.set = function(key, value) {
    _origSet(key, value);
    if (_pulling) return;
    if (_SKIP.indexOf(key) !== -1) return;
    let docId = null;
    if (ARRAY_DOCS.indexOf(key) !== -1) docId = key;
    else if (key === 'settings')          docId = 'profiles';
    else if (key === 'dismissed_alerts')  docId = 'dismissed_alerts';
    else if (key.indexOf('budget_') === 0) docId = key;
    if (docId) _markDirty(docId);
  };

  /* =================== API PÚBLICA =================== */
  function isConnected() { return !!_client; }
  function getStatus()   { return _status; }
  function getLastError(){ return State.get('drive_last_error', ''); }
  function pendingCount(){ return _pending.size; }

  async function manualPush() {
    if (!_client) { App.toast('Aún conectándose…', 'info'); return; }
    // Marca TODO como dirty para forzar resubida
    ['transactions','savings','debts','notes','tasklists','payment_services','profiles'].forEach(d => _pending.add(d));
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf('karen_budget_') === 0) _pending.add(k.slice(6));
    }
    _savePending();
    _setStatus('syncing');
    await _flush();
    App.toast('Sincronizado ✓', 'success');
  }
  async function manualPull() {
    if (!_client) { App.toast('Aún conectándose…', 'info'); return; }
    await pullAll();
    _refreshCurrent();
    App.toast('🔄 Datos actualizados desde la nube', 'success');
  }

  return {
    init,
    push: manualPush,
    pull: manualPull,
    isConnected, getStatus, getLastError, pendingCount,
    _setStatus,
    connect:    () => init(),
    disconnect: () => App.toast('La nube se conecta automáticamente', 'info')
  };
})();

window.DriveSync = Cloud;
