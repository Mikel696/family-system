/* Cloud Sync — Supabase backend · Family System
 *
 * ARQUITECTURA v24 (un item = una fila):
 *   - Tabla `items`(id uuid pk, category text, data jsonb, deleted bool, updated_at)
 *     Cada transacción, ahorro, deuda, etc. es UNA fila individual.
 *   - Al guardar localmente, State.save<X> llama Cloud.upsertItem(category, item).
 *   - Al borrar localmente, State.delete<X> llama Cloud.markDeleted(category, id).
 *   - Realtime escucha INSERT/UPDATE/DELETE sobre `items` y actualiza el localStorage
 *     fila por fila, sin pisar nada.
 *   - Profiles / dismissed_alerts / budgets siguen en la tabla family_data como
 *     "documentos singleton" (objetos sin id propio).
 *
 *   No hay merge de arrays gigantes → no hay race conditions.
 */
const Cloud = (() => {
  const ITEMS_TABLE = 'items';
  const META_TABLE  = 'family_data';
  const PENDING_KEY = 'cloud_pending_v2';
  const RETRY_MS    = 15000;
  const ARRAY_CATS  = ['transactions','savings','debts','notes','tasklists','payment_services'];

  let _client      = null;
  let _channels    = [];
  let _status      = 'disconnected';
  let _pulling     = false;
  let _processing  = false;
  // Cola persistente: cada entrada es { op:'upsert'|'delete', cat, id, data?, ts }
  let _outbox      = [];

  /* =================== INIT =================== */
  async function init(client) {
    _client = client || window.supabaseClient;
    if (!_client) { _setError('Cliente Supabase no disponible'); return; }

    // Cargar cola persistente
    try {
      const arr = State.get(PENDING_KEY, []);
      if (Array.isArray(arr)) _outbox = arr;
    } catch(e) {}

    if (!await _ensureSession()) return;

    try {
      _setStatus('syncing');
      await loadAllItems();
      await loadMeta();        // profiles + dismissed_alerts + budgets
      _subscribe();
      _flushOutbox();          // procesa cambios pendientes locales
      _setStatus(_outbox.length ? 'syncing' : 'connected');
      State.set('drive_last_sync', new Date().toISOString());
      State.set('drive_last_error', '');
    } catch (e) {
      console.error('Cloud init', e);
      _setError('No se pudo conectar a la nube: ' + (e.message || e));
    }
  }

  /* =================== LOAD ALL ITEMS (al iniciar) =================== */
  async function loadAllItems() {
    if (!_client) return;
    const { data, error } = await _client.from(ITEMS_TABLE).select('id, category, data, deleted, updated_at');
    if (error) { _setError('Error al leer items: ' + error.message); return; }
    if (!data) return;
    // Agrupar por categoría. Items con deleted=true NO se incluyen en el local
    // (los renders nunca los ven, y al volver a aparecer arriba se reinsertan).
    const byCat = {};
    for (const cat of ARRAY_CATS) byCat[cat] = [];
    for (const row of data) {
      if (!ARRAY_CATS.includes(row.category)) continue;
      if (row.deleted) continue;
      const item = row.data || {};
      item.id = row.id;            // garantiza id consistente
      item.updatedAt = row.updated_at;
      byCat[row.category].push(item);
    }
    _pulling = true;
    try { for (const cat of ARRAY_CATS) State.set(cat, byCat[cat]); }
    finally { _pulling = false; }
  }

  /* =================== LOAD META SINGLETONS =================== */
  async function loadMeta() {
    if (!_client) return;
    try {
      const { data } = await _client.from(META_TABLE).select('id, data').in('id', ['profiles','dismissed_alerts']);
      if (!data) return;
      _pulling = true;
      try {
        for (const row of data) {
          if (row.id === 'profiles' && row.data && typeof row.data === 'object') {
            const s = State.getSettings();
            s.profiles = Object.assign({}, s.profiles || {}, row.data);
            State.saveSettings(s);
            if (typeof App !== 'undefined' && App.refreshUserUI) App.refreshUserUI();
          } else if (row.id === 'dismissed_alerts' && Array.isArray(row.data)) {
            const merged = [...new Set([...(State.get('dismissed_alerts', []) || []), ...row.data])];
            State.set('dismissed_alerts', merged);
          }
        }
      } finally { _pulling = false; }
    } catch(e) { console.warn('loadMeta', e); }
  }

  /* =================== UPSERT / DELETE PÚBLICOS =================== */
  /* Llamados desde state.js cada vez que se guarda o borra un item. */
  function upsertItem(category, item) {
    if (!item || !item.id || !ARRAY_CATS.includes(category)) return;
    _enqueue({ op: 'upsert', cat: category, id: item.id, data: item, ts: Date.now() });
  }
  function markDeleted(category, id) {
    if (!id || !ARRAY_CATS.includes(category)) return;
    _enqueue({ op: 'delete', cat: category, id, ts: Date.now() });
  }
  function upsertMeta(id, data) {
    _enqueue({ op: 'meta', id, data, ts: Date.now() });
  }

  function _enqueue(entry) {
    if (_pulling) return;                 // no echo cambios remotos
    _outbox.push(entry);
    _persistOutbox();
    _setStatus('syncing');
    _scheduleFlush();
  }
  function _persistOutbox() {
    try { State.set(PENDING_KEY, _outbox); } catch(e) {}
  }

  let _flushTimer = null;
  function _scheduleFlush() {
    clearTimeout(_flushTimer);
    _flushTimer = setTimeout(_flushOutbox, 400);
  }

  /* =================== FLUSH OUTBOX =================== */
  async function _flushOutbox() {
    if (_processing || !_client) return;
    if (_outbox.length === 0) { _setStatus('connected'); return; }
    if (!await _ensureSession()) return;
    _processing = true;
    let firstFailure = null;
    try {
      while (_outbox.length > 0) {
        const entry = _outbox[0];
        let ok = false;
        try {
          if (entry.op === 'upsert') ok = await _doUpsert(entry);
          else if (entry.op === 'delete') ok = await _doDelete(entry);
          else if (entry.op === 'meta')   ok = await _doMeta(entry);
          else ok = true;                 // entradas desconocidas se descartan
        } catch(e) { console.warn('outbox op', entry, e); ok = false; }
        if (ok) {
          _outbox.shift();
          _persistOutbox();
        } else {
          firstFailure = entry; break;
        }
      }
    } finally { _processing = false; }
    if (!firstFailure) {
      _setStatus('connected');
      State.set('drive_last_sync', new Date().toISOString());
      State.set('drive_last_error', '');
    }
  }

  async function _doUpsert(entry) {
    const updated_at = new Date().toISOString();
    const { error } = await _client.from(ITEMS_TABLE).upsert({
      id: entry.id, category: entry.cat, data: entry.data, deleted: false, updated_at
    });
    if (error) {
      if (/row-level security|policy/i.test(error.message || '')) {
        const ok = await _tryRefreshSession();
        if (!ok) { _setError('Sesión expirada. Cierra sesión y vuelve a entrar.'); return false; }
        const retry = await _client.from(ITEMS_TABLE).upsert({ id: entry.id, category: entry.cat, data: entry.data, deleted: false, updated_at });
        if (retry.error) { _setError('Error al guardar: ' + retry.error.message); return false; }
      } else { _setError('Error al guardar: ' + error.message); return false; }
    }
    return true;
  }

  async function _doDelete(entry) {
    const { error } = await _client.from(ITEMS_TABLE)
      .update({ deleted: true, updated_at: new Date().toISOString() })
      .eq('id', entry.id);
    if (error) { _setError('Error al borrar: ' + error.message); return false; }
    return true;
  }

  async function _doMeta(entry) {
    const updated_at = new Date().toISOString();
    const { error } = await _client.from(META_TABLE).upsert({ id: entry.id, data: entry.data, updated_at });
    if (error) { _setError('Error al guardar ' + entry.id + ': ' + error.message); return false; }
    return true;
  }

  /* =================== AUTH =================== */
  async function _ensureSession() {
    if (!_client) return false;
    try {
      const { data: { session } } = await _client.auth.getSession();
      if (!session || !session.user) {
        const refreshed = await _tryRefreshSession();
        if (!refreshed) { _setError('Sesión expirada — cierra sesión y vuelve a entrar.'); return false; }
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

  /* =================== REALTIME =================== */
  function _subscribe() {
    if (!_client) return;
    _channels.forEach(ch => { try { ch.unsubscribe(); } catch(e){} });
    _channels = [];

    // Items: insert, update (incluyendo soft-delete), delete físico
    const itemsCh = _client.channel('items_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: ITEMS_TABLE }, payload => {
        _applyItemEvent(payload);
      })
      .subscribe();
    _channels.push(itemsCh);

    // Meta: profiles y dismissed_alerts en family_data
    const metaCh = _client.channel('meta_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: META_TABLE }, payload => {
        const row = payload.new || payload.old;
        if (!row || !row.id) return;
        _applyMetaEvent(row.id, row.data);
      })
      .subscribe();
    _channels.push(metaCh);
  }

  function _applyItemEvent(payload) {
    const ev  = payload.eventType;          // INSERT | UPDATE | DELETE
    const row = payload.new || payload.old;
    if (!row || !row.category) return;
    if (!ARRAY_CATS.includes(row.category)) return;
    const list = State.get(row.category, []) || [];
    const idx  = list.findIndex(x => x && x.id === row.id);
    _pulling = true;
    try {
      if (ev === 'DELETE' || (row.deleted === true)) {
        // Quitar del local
        if (idx >= 0) { list.splice(idx, 1); State.set(row.category, list); }
      } else {
        const item = row.data || {};
        item.id = row.id;
        item.updatedAt = row.updated_at;
        if (idx >= 0) list[idx] = item; else list.unshift(item);
        State.set(row.category, list);
      }
    } finally { _pulling = false; }
    _refreshCurrent();
  }

  function _applyMetaEvent(id, data) {
    _pulling = true;
    try {
      if (id === 'profiles' && data && typeof data === 'object') {
        const s = State.getSettings();
        s.profiles = Object.assign({}, s.profiles || {}, data);
        State.saveSettings(s);
        if (typeof App !== 'undefined' && App.refreshUserUI) App.refreshUserUI();
      } else if (id === 'dismissed_alerts' && Array.isArray(data)) {
        State.set('dismissed_alerts', data);
      }
    } finally { _pulling = false; }
    _refreshCurrent();
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
      const labels = {
        disconnected:'Conectando…',
        connected:'Sincronizado',
        syncing: _outbox.length > 0 ? ('Subiendo ' + _outbox.length + '…') : 'Sincronizando…',
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
      loadAllItems().then(() => loadMeta()).then(() => { _refreshCurrent(); _flushOutbox(); });
    }
  });
  window.addEventListener('online', () => { if (_client) _flushOutbox(); });
  setInterval(() => { if (_client && _outbox.length > 0) _flushOutbox(); }, RETRY_MS);
  window.addEventListener('beforeunload', () => {
    if (_outbox.length > 0) { try { State.set(PENDING_KEY, _outbox); } catch(e) {} }
  });

  /* =================== API PÚBLICA =================== */
  function isConnected() { return !!_client; }
  function getStatus()   { return _status; }
  function getLastError(){ return State.get('drive_last_error', ''); }
  function pendingCount(){ return _outbox.length; }

  async function manualPush() {
    if (!_client) { App.toast('Aún conectándose…', 'info'); return; }
    await _flushOutbox();
    App.toast('Sincronizado ✓', 'success');
  }
  async function manualPull() {
    if (!_client) { App.toast('Aún conectándose…', 'info'); return; }
    await loadAllItems();
    await loadMeta();
    _refreshCurrent();
    App.toast('🔄 Datos actualizados desde la nube', 'success');
  }

  return {
    init,
    upsertItem, markDeleted, upsertMeta,
    push: manualPush, pull: manualPull,
    isConnected, getStatus, getLastError, pendingCount,
    _setStatus,
    connect:    () => init(),
    disconnect: () => App.toast('La nube se conecta automáticamente', 'info')
  };
})();

window.DriveSync = Cloud;
