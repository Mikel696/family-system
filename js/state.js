/* State — localStorage cache + Cloud bridge.
 * Cada save/delete:
 *   1) actualiza localStorage (la UI lee de aquí).
 *   2) notifica a Cloud (que sube/borra esa fila en Supabase).
 *
 * Los renders ven solo items "vivos" (sin _deleted).
 * Los borrados se eliminan del local; el sync usa flag `deleted` en la tabla.
 */
const State = (() => {
  const PREFIX = 'karen_';

  function get(key, def = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? def : JSON.parse(raw);
    } catch { return def; }
  }
  function set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch(e) { console.error('State.set', e); }
  }
  function update(key, fn, def = []) { set(key, fn(get(key, def))); }

  function _alive(arr) {
    return (Array.isArray(arr) ? arr : []).filter(x => x && !x._deleted);
  }
  function _push(cat, item)  { if (typeof Cloud !== 'undefined') Cloud.upsertItem(cat, item); }
  function _drop(cat, id)    { if (typeof Cloud !== 'undefined') Cloud.markDeleted(cat, id); }
  function _meta(id, data)   { if (typeof Cloud !== 'undefined') Cloud.upsertMeta(id, data); }

  function _saveItemInArray(key, item) {
    update(key, list => {
      const idx = list.findIndex(x => x && x.id === item.id);
      if (idx >= 0) { list[idx] = item; } else { list.unshift(item); }
      return list;
    });
  }
  function _removeFromArray(key, id) {
    update(key, list => list.filter(x => !(x && x.id === id)));
  }

  /* ====== Transactions ====== */
  function getTransactions() { return _alive(get('transactions', [])); }
  function saveTransaction(tx) {
    if (!tx || !tx.id) return;
    tx.updatedAt = new Date().toISOString();
    _saveItemInArray('transactions', tx);
    _push('transactions', tx);
  }
  function deleteTransaction(id) {
    _removeFromArray('transactions', id);
    _drop('transactions', id);
  }

  /* ====== Savings ====== */
  function getSavings() { return _alive(get('savings', [])); }
  function saveSaving(s) {
    if (!s || !s.id) return;
    s.updatedAt = new Date().toISOString();
    _saveItemInArray('savings', s);
    _push('savings', s);
  }
  function deleteSaving(id) {
    _removeFromArray('savings', id);
    _drop('savings', id);
  }

  /* ====== Debts ====== */
  function getDebts() { return _alive(get('debts', [])); }
  function saveDebt(d) {
    if (!d || !d.id) return;
    d.updatedAt = new Date().toISOString();
    _saveItemInArray('debts', d);
    _push('debts', d);
  }
  function deleteDebt(id) {
    _removeFromArray('debts', id);
    _drop('debts', id);
  }

  /* ====== Budget (un objeto por mes — meta singleton) ====== */
  function getBudget(monthKey) { return get('budget_' + monthKey, []); }
  function saveBudget(monthKey, categories) {
    set('budget_' + monthKey, categories);
    _meta('budget_' + monthKey, categories);
  }

  /* ====== Notes ====== */
  function getNotes() { return _alive(get('notes', [])); }
  function saveNote(n) {
    if (!n || !n.id) return;
    n.updatedAt = new Date().toISOString();
    _saveItemInArray('notes', n);
    _push('notes', n);
  }
  function deleteNote(id) {
    _removeFromArray('notes', id);
    _drop('notes', id);
  }

  /* ====== Task lists ====== */
  function getTaskLists() { return _alive(get('tasklists', [])); }
  function saveTaskList(tl) {
    if (!tl || !tl.id) return;
    tl.updatedAt = new Date().toISOString();
    _saveItemInArray('tasklists', tl);
    _push('tasklists', tl);
  }
  function deleteTaskList(id) {
    _removeFromArray('tasklists', id);
    _drop('tasklists', id);
  }

  /* ====== Payment services ====== */
  function getPaymentServices() { return _alive(get('payment_services', [])); }
  function savePaymentService(ps) {
    if (!ps || !ps.id) return;
    ps.updatedAt = new Date().toISOString();
    _saveItemInArray('payment_services', ps);
    _push('payment_services', ps);
  }
  function deletePaymentService(id) {
    _removeFromArray('payment_services', id);
    _drop('payment_services', id);
  }

  /* ====== Settings (profiles sí se sincronizan; el resto es local) ====== */
  function getSettings() {
    return get('settings', {
      currency: 'COP',
      currencySymbol: '$',
      dateFormat: 'DD/MM/YYYY',
      theme: 'dark',
      notifications: true,
      profiles: {
        miguel: { name: 'Miguel', avatar: '🏛️', color: '#C9A961' }
      }
    });
  }
  function saveSettings(s) {
    set('settings', s);
    if (s && s.profiles) _meta('profiles', s.profiles);
  }

  /* ====== Current user ====== */
  function getUser() { return get('current_user', 'shared'); }
  function setUser(u) { set('current_user', u); }

  return {
    get, set, update,
    getTransactions, saveTransaction, deleteTransaction,
    getSavings, saveSaving, deleteSaving,
    getDebts, saveDebt, deleteDebt,
    getBudget, saveBudget,
    getNotes, saveNote, deleteNote,
    getTaskLists, saveTaskList, deleteTaskList,
    getPaymentServices, savePaymentService, deletePaymentService,
    getSettings, saveSettings,
    getUser, setUser
  };
})();
