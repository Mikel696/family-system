/* localStorage state management — con soft delete para sync seguro */
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

  // Filtra items con _deleted (los borrados quedan en almacenamiento para que el sync los propague,
  // pero los renders solo ven los vivos).
  function _alive(arr) { return (Array.isArray(arr) ? arr : []).filter(x => x && !x._deleted); }
  // Marca un item como borrado con timestamp para que gane en el merge last-write-wins.
  function _markDeleted(x) {
    return Object.assign({}, x, { _deleted: true, updatedAt: new Date().toISOString() });
  }

  /* Transactions */
  function getTransactions() { return _alive(get('transactions', [])); }
  function saveTransaction(tx) {
    update('transactions', list => {
      const idx = list.findIndex(t => t.id === tx.id);
      if (idx >= 0) { list[idx] = tx; } else { list.unshift(tx); }
      return list;
    });
  }
  function deleteTransaction(id) {
    update('transactions', list => list.map(t => t.id === id ? _markDeleted(t) : t));
  }

  /* Savings */
  function getSavings() { return _alive(get('savings', [])); }
  function saveSaving(s) {
    update('savings', list => {
      const idx = list.findIndex(x => x.id === s.id);
      if (idx >= 0) { list[idx] = s; } else { list.unshift(s); }
      return list;
    });
  }
  function deleteSaving(id) {
    update('savings', list => list.map(x => x.id === id ? _markDeleted(x) : x));
  }

  /* Debts */
  function getDebts() { return _alive(get('debts', [])); }
  function saveDebt(d) {
    update('debts', list => {
      const idx = list.findIndex(x => x.id === d.id);
      if (idx >= 0) { list[idx] = d; } else { list.unshift(d); }
      return list;
    });
  }
  function deleteDebt(id) {
    update('debts', list => list.map(x => x.id === id ? _markDeleted(x) : x));
  }

  /* Budget */
  function getBudget(monthKey) { return get('budget_' + monthKey, []); }
  function saveBudget(monthKey, categories) { set('budget_' + monthKey, categories); }

  /* Notes */
  function getNotes() { return _alive(get('notes', [])); }
  function saveNote(n) {
    update('notes', list => {
      const idx = list.findIndex(x => x.id === n.id);
      if (idx >= 0) { list[idx] = n; } else { list.unshift(n); }
      return list;
    });
  }
  function deleteNote(id) {
    update('notes', list => list.map(x => x.id === id ? _markDeleted(x) : x));
  }

  /* Tasks */
  function getTaskLists() { return _alive(get('tasklists', [])); }
  function saveTaskList(tl) {
    update('tasklists', list => {
      const idx = list.findIndex(x => x.id === tl.id);
      if (idx >= 0) { list[idx] = tl; } else { list.unshift(tl); }
      return list;
    });
  }
  function deleteTaskList(id) {
    update('tasklists', list => list.map(x => x.id === id ? _markDeleted(x) : x));
  }

  /* Payment services */
  function getPaymentServices() { return _alive(get('payment_services', [])); }
  function savePaymentService(ps) {
    update('payment_services', list => {
      const idx = list.findIndex(x => x.id === ps.id);
      if (idx >= 0) { list[idx] = ps; } else { list.unshift(ps); }
      return list;
    });
  }
  function deletePaymentService(id) {
    update('payment_services', list => list.map(x => x.id === id ? _markDeleted(x) : x));
  }

  /* Settings */
  function getSettings() {
    return get('settings', {
      currency: 'COP',
      currencySymbol: '$',
      dateFormat: 'DD/MM/YYYY',
      theme: 'dark',
      notifications: true,
      profiles: {
        karen:  { name: 'Karen',  avatar: '👩', color: '#EC4899' },
        miguel: { name: 'Miguel', avatar: '👨', color: '#3B82F6' }
      }
    });
  }
  function saveSettings(s) { set('settings', s); }

  /* Current user */
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
