/* Alerts Engine — due dates, tasks, events */
const Alerts = (() => {
  let _current = [];

  function check() {
    const dismissed = State.get('dismissed_alerts', []);
    const days      = State.getSettings().notifDays || 7;
    _current = [];

    _checkDebts(days, dismissed);
    _checkRecurring(days, dismissed);
    _checkTasks(dismissed);
    _checkGoals(dismissed);

    _updateBadge();
    _fireNotifications(dismissed);
    return _current;
  }

  function _checkDebts(days, dismissed) {
    State.getDebts().filter(d => d.status !== 'paid' && d.nextPaymentDate).forEach(d => {
      const id = 'debt-' + d.id + '-' + d.nextPaymentDate;
      if (dismissed.includes(id)) return;
      const n = Utils.daysUntil(d.nextPaymentDate);
      if (n === null || n > days) return;
      _current.push({
        id, type: 'payment',
        priority: n < 0 ? 'urgent' : n <= 3 ? 'high' : 'medium',
        title: '💳 Pago: ' + d.creditor,
        body: Utils.formatCurrency(d.monthlyPayment || d.remainingAmount) + (n < 0 ? ' — ⚠️ VENCIDO' : n === 0 ? ' — Vence HOY' : ' — en ' + n + ' día(s)'),
        days: n,
        date: d.nextPaymentDate,
        section: 'debts'
      });
    });
  }

  function _checkRecurring(days, dismissed) {
    State.getTransactions().filter(t => t.recurring && t.nextDue).forEach(t => {
      const id = 'tx-' + t.id + '-' + t.nextDue;
      if (dismissed.includes(id)) return;
      const n = Utils.daysUntil(t.nextDue);
      if (n === null || n > days || n < 0) return;
      _current.push({
        id, type: 'recurring',
        priority: n === 0 ? 'high' : 'medium',
        title: '🔄 ' + t.description,
        body: Utils.formatCurrency(t.amount) + (n === 0 ? ' — Vence HOY' : ' — en ' + n + ' día(s)'),
        days: n,
        date: t.nextDue,
        section: 'transactions'
      });
    });
  }

  function _checkTasks(dismissed) {
    State.getTaskLists().forEach(tl => {
      (tl.tasks || []).filter(t => !t.done && t.dueDate).forEach(t => {
        const id = 'task-' + t.id + '-' + t.dueDate;
        if (dismissed.includes(id)) return;
        const n = Utils.daysUntil(t.dueDate);
        if (n === null || n > 3) return;
        _current.push({
          id, type: 'task',
          priority: n < 0 ? 'urgent' : n === 0 ? 'high' : 'medium',
          title: '✅ ' + t.text,
          body: 'Lista: ' + tl.title + (n < 0 ? ' — VENCIDA hace ' + Math.abs(n) + 'd' : n === 0 ? ' — Vence HOY' : ' — en ' + n + ' día(s)'),
          days: n,
          date: t.dueDate,
          section: 'tasks'
        });
      });
    });
  }

  function _checkGoals(dismissed) {
    State.getSavings().filter(g => g.deadline && g.currentAmount < g.targetAmount).forEach(g => {
      const id = 'goal-' + g.id + '-' + g.deadline;
      if (dismissed.includes(id)) return;
      const n = Utils.daysUntil(g.deadline);
      if (n === null || n > 30) return;
      const remaining = g.targetAmount - g.currentAmount;
      _current.push({
        id, type: 'goal',
        priority: n < 0 ? 'urgent' : n <= 7 ? 'high' : 'medium',
        title: '🎯 Meta: ' + g.name,
        body: 'Faltan ' + Utils.formatCurrency(remaining) + (n < 0 ? ' — Plazo vencido' : n === 0 ? ' — Vence HOY' : ' — en ' + n + ' día(s)'),
        days: n,
        date: g.deadline,
        section: 'savings'
      });
    });
  }

  function _updateBadge() {
    const badge = document.getElementById('alertBadge');
    if (!badge) return;
    const urgent = _current.filter(a => a.priority === 'urgent' || a.priority === 'high').length;
    badge.textContent = urgent || _current.length;
    badge.style.display = _current.length > 0 ? 'flex' : 'none';
  }

  function _fireNotifications(dismissed) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const settings = State.getSettings();
    if (!settings.notifications) return;
    _current
      .filter(a => (a.priority === 'urgent' || a.priority === 'high') && !dismissed.includes(a.id))
      .slice(0, 3)
      .forEach(a => {
        new Notification('Family System · ' + a.title, {
          body: a.body,
          icon: './icons/icon-192.png',
          badge: './icons/icon-72.png',
          tag: a.id
        });
      });
  }

  function showPanel() {
    check();
    const sorted = [..._current].sort((a, b) => {
      const order = { urgent: 0, high: 1, medium: 2 };
      return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
    });

    if (!sorted.length) {
      App.toast('🎉 ¡Sin alertas pendientes!', 'success');
      return;
    }

    const html = `
      <div style="display:flex;flex-direction:column;gap:8px;max-height:60vh;overflow-y:auto;padding-right:4px">
        ${sorted.map(a => `
          <div class="alert-item alert-${a.priority}" onclick="App.navigate('${a.section}');App.closeModal()">
            <div class="alert-dot alert-dot-${a.priority}"></div>
            <div class="alert-content">
              <div class="alert-title">${Utils.escHtml(a.title)}</div>
              <div class="alert-body">${Utils.escHtml(a.body)}</div>
              <div class="alert-date">${Utils.formatDate(a.date)}</div>
            </div>
            <button class="alert-dismiss" onclick="event.stopPropagation();Alerts.dismiss('${a.id}')" title="Descartar">✕</button>
          </div>`).join('')}
      </div>
      <div class="form-actions">
        <button class="btn-outline" onclick="Alerts.dismissAll()">Descartar todas</button>
        <button class="btn-primary" onclick="App.closeModal()">Cerrar</button>
      </div>`;
    App.openModal(`🔔 Alertas (${sorted.length})`, html);
  }

  function dismiss(id) {
    State.update('dismissed_alerts', list => [...new Set([...(list||[]), id])], []);
    _current = _current.filter(a => a.id !== id);
    _updateBadge();
    showPanel();
  }

  function dismissAll() {
    State.update('dismissed_alerts', () => _current.map(a => a.id), []);
    _current = [];
    _updateBadge();
    App.closeModal();
  }

  // Run on load + every hour
  setTimeout(check, 2000);
  setInterval(check, 3600000);

  return { check, showPanel, dismiss, dismissAll };
})();
