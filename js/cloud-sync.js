/* Cloud Sync — Supabase backend · Family System
 * Sincronización en tiempo real entre todos los dispositivos.
 * Sin OAuth, sin botones de "conectar Drive". La app se conecta sola.
 * Cada "documento" (transactions, savings, ...) se guarda como una fila
 * en la tabla family_data (columna data = JSONB).
 */
const Cloud = (() => {
  const TABLE = 'family_data';

  let _client      = null;
  let _channel     = null;
  let _status      = 'disconnected';
  let _pulling     = false;
  let _lastTs      = {};    // docId → updated_at remoto procesado
  let _pushTimers  = {};

  // Documentos cuyo valor es un array de objetos con `id`
  const ARRAY_DOCS = ['transactions','savings','debts','notes','tasklists','payment_services'];

  /* =================== INIT =================== */
  async function init(client) {
    _client = client || window.supabaseClient;
    if (!_client) { _setError('Cliente Supabase no disponible'); return; }
    if (!await _ensureSession()) return;
    try {
      _setStatus('syncing');
      await pullAll();
      await pushAll();
      _subscribe();
      _setStatus('connected');
      State.set('drive_last_sync', new Date().toISOString());
      State.set('drive_last_error', '');
    } catch (e) {
      console.error('Cloud init', e);
      _setError('No se pudo conectar a la nube: ' + (e.message || e));
    }
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
      const local = State.get(id, []);
      State.set(id, _mergeById(local, data));
      return;
    }
  }

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

  /* Verifica que haya sesión Supabase autenticada y autorizada antes de hablar con la BD */
  async function _ensureSession() {
    if (!_client) return false;
    try {
      const { data: { session } } = await _client.auth.getSession();
      if (!session || !session.user) {
        _setError('Sesión expirada — toca "Reconectar" para volver a entrar.');
        return false;
      }
      const okEmails = ['miguel@family.local', 'karen@family.local'];
      if (okEmails.indexOf(session.user.email) === -1) {
        _setError('Sesión de un usuario no autorizado (' + session.user.email + '). Cierra sesión y vuelve a entrar.');
        return false;
      }
      return true;
    } catch (e) {
      _setError('No se pudo verificar la sesión: ' + (e.message || e));
      return false;
    }
  }

  /* =================== PUSH =================== */
  async function push(docId) {
    if (!_client) return;
    if (_gatherDoc(docId) === undefined) return;
    if (!await _ensureSession()) return;     // sin sesión válida no intentamos (evita spam de errores)
    // Pull-merge antes de cada push para que dos personas escribiendo a la vez
    // no se pisen: traemos lo remoto, lo mergeamos con lo local, y subimos.
    await _pullDocAndMerge(docId);
    const value = _gatherDoc(docId);
    if (value === undefined) return;
    const updated_at = new Date().toISOString();
    const { error } = await _client.from(TABLE).upsert({ id: docId, data: value, updated_at });
    if (error) {
      // Si es error de RLS, es problema de sesión — no spameamos
      if (/row-level security|policy/i.test(error.message || '')) {
        _setError('Sesión inválida. Pulsa "Reconectar" o cierra y vuelve a entrar.');
      } else {
        _setError('Error al guardar: ' + error.message);
      }
      return;
    }
    _lastTs[docId] = updated_at;
    State.set('drive_last_sync', new Date().toISOString());
    State.set('drive_last_error', '');
    _setStatus('connected');
  }

  async function _pullDocAndMerge(docId) {
    if (!_client) return;
    try {
      const { data: rows } = await _client.from(TABLE).select('data, updated_at').eq('id', docId).limit(1);
      if (!rows || rows.length === 0) return;
      const row = rows[0];
      if (_lastTs[docId] === row.updated_at) return;
      _pulling = true;
      try { _applyDoc(docId, row.data, row.updated_at); }
      finally { _pulling = false; }
    } catch (e) { console.warn('pullDocAndMerge', e); }
  }

  function _gatherDoc(id) {
    if (id === 'transactions')     return State.getTransactions();
    if (id === 'savings')          return State.getSavings();
    if (id === 'debts')            return State.getDebts();
    if (id === 'notes')            return State.getNotes();
    if (id === 'tasklists')        return State.getTaskLists();
    if (id === 'payment_services') return State.getPaymentServices();
    if (id === 'profiles')         return State.getSettings().profiles || {};
    if (id === 'dismissed_alerts') return State.get('dismissed_alerts', []);
    if (id.indexOf('budget_') === 0) return State.get(id, []);
    return undefined;
  }

  async function pushAll() {
    const docs = [
      ...ARRAY_DOCS,
      'profiles'
    ];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf('karen_budget_') === 0) docs.push(k.slice(6));
    }
    for (const d of docs) {
      try { await push(d); } catch (e) { console.warn('pushAll', d, e); }
    }
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
          if (_lastTs[row.id] === row.updated_at) return;   // mi propia escritura
          _pulling = true;
          try { _applyDoc(row.id, row.data, row.updated_at); }
          finally { _pulling = false; }
          _refreshCurrent();
          if (typeof App !== 'undefined') App.toast('🔄 Sincronizado', 'info', 1500);
        } catch (e) { console.error('realtime', e); }
      })
      .subscribe(status => {
        if (status === 'CHANNEL_ERROR') _setError('Tiempo real perdido — reconectando…');
      });
  }

  /* =================== UI =================== */
  function _setStatus(s) {
    _status = s;
    const el = document.getElementById('driveSyncDot');
    if (el) {
      const colors = { disconnected:'#6B7280', connected:'#10B981', syncing:'#F59E0B', error:'#EF4444' };
      el.style.background = colors[s] || '#6B7280';
    }
    const lbl = document.getElementById('driveSyncLabel');
    if (lbl) {
      const labels = { disconnected:'Conectando…', connected:'Sincronizado', syncing:'Sincronizando…', error:'⚠️ Error' };
      lbl.textContent = labels[s] || s;
    }
  }

  let _lastErrorAt = 0;
  function _setError(msg) {
    console.error('Cloud error:', msg);
    State.set('drive_last_error', msg);
    _setStatus('error');
    // No spamear toasts — máximo uno cada 6 segundos
    const now = Date.now();
    if (typeof App !== 'undefined' && (now - _lastErrorAt) > 6000) {
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
      if (typeof App !== 'undefined' && App.refreshUserUI) App.refreshUserUI();
    } catch(e) { console.error('refresh', e); }
  }

  /* Al volver al primer plano: traer cambios */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && _client) {
      pullAll().then(() => _refreshCurrent());
    }
  });

  /* =================== STATE.set INTERCEPTOR =================== */
  const _origSet = State.set.bind(State);
  const _SKIP = ['drive_connected','drive_client_id','drive_last_sync','drive_last_error','current_user','auth_users','auth_session'];

  function _scheduleDocPush(docId) {
    clearTimeout(_pushTimers[docId]);
    _setStatus('syncing');
    _pushTimers[docId] = setTimeout(() => push(docId), 1500);
  }

  State.set = function(key, value) {
    _origSet(key, value);
    if (_pulling) return;
    if (!_client) return;
    if (_SKIP.indexOf(key) !== -1) return;
    let docId = null;
    if (ARRAY_DOCS.indexOf(key) !== -1) docId = key;
    else if (key === 'settings')          docId = 'profiles';
    else if (key === 'dismissed_alerts')  docId = 'dismissed_alerts';
    else if (key.indexOf('budget_') === 0) docId = key;
    if (docId) _scheduleDocPush(docId);
  };

  /* =================== API pública =================== */
  function isConnected() { return !!_client; }
  function getStatus()   { return _status; }
  function getLastError(){ return State.get('drive_last_error', ''); }

  async function manualPush() {
    if (!_client) { App.toast('Aún conectándose…', 'info'); return; }
    await pushAll();
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
    isConnected, getStatus, getLastError,
    _setStatus,
    // Compatibilidad con código viejo:
    connect:    () => init(),
    disconnect: () => App.toast('La nube se conecta automáticamente', 'info')
  };
})();

/* Alias para que el código que aún usa "DriveSync.xxx" siga funcionando */
window.DriveSync = Cloud;
