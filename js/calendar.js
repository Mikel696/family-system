const Calendar = (() => {
  let _year  = new Date().getFullYear();
  let _month = new Date().getMonth();

  function render() {
    _renderLabel();
    _renderGrid();
    _renderEventsList();
  }

  function _renderLabel() {
    const d = new Date(_year, _month, 1);
    document.getElementById('calMonthLabel').textContent =
      d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
       .replace(/^\w/, c => c.toUpperCase());
  }

  function _getEvents() {
    const events = [];
    const txs    = State.getTransactions();

    // Recurring transactions
    txs.filter(t => t.recurring && t.nextDue).forEach(t => {
      const d = new Date(t.nextDue);
      if (d.getFullYear() === _year && d.getMonth() === _month) {
        events.push({ date: d.getDate(), label: t.description, color: t.type==='expense'?'#EF4444':'#10B981', type: 'recurring', obj: t });
      }
    });

    // All transactions this month
    txs.filter(t => {
      if (!t.date) return false;
      const d = new Date(t.date);
      return d.getFullYear() === _year && d.getMonth() === _month;
    }).forEach(t => {
      const d = new Date(t.date);
      events.push({ date: d.getDate(), label: t.description, color: t.type==='expense'?'#EF4444':'#10B981', type: 'transaction', obj: t });
    });

    // Debt payments
    State.getDebts().filter(d => d.nextPaymentDate && d.status !== 'paid').forEach(d => {
      const dt = new Date(d.nextPaymentDate);
      if (dt.getFullYear() === _year && dt.getMonth() === _month) {
        events.push({ date: dt.getDate(), label: '💳 ' + d.creditor, color: '#F59E0B', type: 'debt', obj: d });
      }
    });

    // Saving goal deadlines
    State.getSavings().filter(g => g.deadline).forEach(g => {
      const dt = new Date(g.deadline);
      if (dt.getFullYear() === _year && dt.getMonth() === _month) {
        events.push({ date: dt.getDate(), label: '🎯 Meta: ' + g.name, color: g.color||'#8B5CF6', type: 'goal', obj: g });
      }
    });

    return events;
  }

  function _renderGrid() {
    const firstDay  = new Date(_year, _month, 1).getDay();
    const daysInMonth = new Date(_year, _month+1, 0).getDate();
    const prevDays  = new Date(_year, _month, 0).getDate();
    const today     = new Date();
    const events    = _getEvents();

    // Build event map
    const eventMap = {};
    events.forEach(e => { (eventMap[e.date] = eventMap[e.date]||[]).push(e); });

    const weekdays = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
    let html = `<div class="cal-grid-wrap">
      <div class="cal-weekdays">${weekdays.map(d=>`<div class="cal-weekday">${d}</div>`).join('')}</div>
      <div class="cal-days">`;

    // Prev month days
    for (let i = firstDay - 1; i >= 0; i--) {
      html += `<div class="cal-day other-month"><div class="cal-day-num">${prevDays - i}</div></div>`;
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = today.getFullYear()===_year && today.getMonth()===_month && today.getDate()===d;
      const evs = eventMap[d] || [];
      html += `<div class="cal-day${isToday?' today':''}" onclick="Calendar.showDay(${d})">
        <div class="cal-day-num">${d}</div>
        ${evs.slice(0,3).map(e => `<div class="cal-event-pill" style="background:${e.color}22;color:${e.color};font-weight:600">${Utils.escHtml(e.label.substring(0,12))}</div>`).join('')}
        ${evs.length > 3 ? `<div style="font-size:10px;color:var(--text-m)">+${evs.length-3} más</div>` : ''}
      </div>`;
    }

    // Next month filler
    const remaining = 42 - firstDay - daysInMonth;
    for (let d = 1; d <= remaining; d++) {
      html += `<div class="cal-day other-month"><div class="cal-day-num">${d}</div></div>`;
    }

    html += '</div></div>';
    document.getElementById('calendarGrid').innerHTML = html;
  }

  function _renderEventsList() {
    const events = _getEvents().sort((a,b) => a.date - b.date);
    const el     = document.getElementById('calEventsList');
    if (!events.length) {
      el.innerHTML = '<div class="text-muted text-center" style="padding:16px">No hay eventos este mes</div>';
      return;
    }
    el.innerHTML = events.map(e => `
      <div class="tx-item">
        <div class="tx-icon" style="background:${e.color}22;font-size:18px">${_typeIcon(e.type)}</div>
        <div class="tx-info">
          <div class="tx-desc">${Utils.escHtml(e.label)}</div>
          <div class="tx-meta"><span>Día ${e.date}</span><span class="tag">${_typeLabel(e.type)}</span></div>
        </div>
        ${e.obj?.amount ? `<div class="tx-amount" style="color:${e.color}">${Utils.formatCurrency(e.obj.amount)}</div>` : ''}
      </div>`).join('');
  }

  function showDay(day) {
    const events = _getEvents().filter(e => e.date === day);
    if (!events.length) return;
    const d = new Date(_year, _month, day);
    App.openModal(`📅 ${d.toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long'})}`,
      events.map(e => `
        <div class="tx-item" style="margin-bottom:6px">
          <div class="tx-icon" style="background:${e.color}22">${_typeIcon(e.type)}</div>
          <div class="tx-info">
            <div class="tx-desc">${Utils.escHtml(e.label)}</div>
            <div class="tx-meta"><span class="tag">${_typeLabel(e.type)}</span></div>
          </div>
          ${e.obj?.amount ? `<div style="font-weight:700;color:${e.color}">${Utils.formatCurrency(e.obj.amount)}</div>` : ''}
        </div>`).join('') +
      `<div class="form-actions"><button class="btn-outline" onclick="App.closeModal()">Cerrar</button></div>`
    );
  }

  function _typeIcon(t) { return { transaction:'💸', recurring:'🔄', debt:'💳', goal:'🎯' }[t]||'📅'; }
  function _typeLabel(t) { return { transaction:'Transacción', recurring:'Pago recurrente', debt:'Cuota deuda', goal:'Meta ahorro' }[t]||t; }

  function prevMonth() { _month--; if (_month < 0) { _month = 11; _year--; } render(); }
  function nextMonth() { _month++; if (_month > 11) { _month = 0; _year++; } render(); }

  return { render, prevMonth, nextMonth, showDay };
})();
