const Dashboard = (() => {
  let flowChart = null;
  let catChart  = null;

  function render() {
    const period = document.getElementById('dashPeriod')?.value || 'month';
    const txs    = _filterByPeriod(State.getTransactions(), period);
    _renderHero();
    _renderStats(txs);
    _renderPersonStats(txs);
    _renderUpcoming();
    _renderSavings();
    _renderRecent(txs);
  }

  function _renderPersonStats(txs) {
    const el = document.getElementById('dashPersonStats');
    if (!el) return;
    const settings = State.getSettings();
    const profiles = settings.profiles || {};
    const sum = (type, person) => txs
      .filter(t => t.type === type && t.person === person)
      .reduce((s, t) => s + (t.amount || 0), 0);

    const cell = (person, type) => {
      const isInc = type === 'income';
      const value = sum(type, person);
      const cls   = isInc ? 'text-success' : 'text-danger';
      const sign  = isInc ? '+ ' : '- ';
      const label = isInc ? 'Ingresos' : 'Gastos';
      return `
        <div class="ps-cell" onclick="App.navigate('transactions', { type:'${type}', person:'${person}' })">
          <div class="ps-label">${label}</div>
          <div class="ps-value ${cls}">${value ? sign : ''}${Utils.formatCurrency(value)}</div>
        </div>`;
    };
    const balanceCell = person => {
      const inc = sum('income', person);
      const exp = sum('expense', person);
      const net = inc - exp;
      const cls = net >= 0 ? 'text-success' : 'text-danger';
      return `
        <div class="ps-cell" onclick="App.navigate('transactions', { person:'${person}' })">
          <div class="ps-label">Saldo</div>
          <div class="ps-value ${cls}">${net < 0 ? '- ' : ''}${Utils.formatCurrency(Math.abs(net))}</div>
        </div>`;
    };
    const row = (person) => {
      const p = profiles[person] || { name: person, avatar: person === 'karen' ? '👩' : '👨' };
      return `
        <div class="person-stat-row ${person}">
          <div class="ps-head">
            <span class="ps-avatar">${p.avatar}</span>
            <span class="ps-name">${Utils.escHtml(p.name || person)}</span>
          </div>
          ${cell(person, 'income')}
          ${cell(person, 'expense')}
          ${balanceCell(person)}
        </div>`;
    };

    el.innerHTML = `
      <div class="person-stats-wrap">
        ${row('miguel')}
      </div>`;
  }

  function _renderHero() {
    let hero = document.getElementById('familyHero');
    const settings   = State.getSettings();
    const profiles   = settings.profiles || {};
    const miguelName = profiles.miguel?.name || 'Miguel';
    const now   = new Date();
    const hora  = now.getHours();
    const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches';
    const fechaStr = now.toLocaleDateString('es-CO', { weekday:'long', day:'numeric', month:'long' });
    const quote = (typeof Stoic !== 'undefined') ? Stoic.today() : { t: 'Disciplina hoy. Libertad mañana.', a: 'Vir Stoicus' };

    if (!hero) {
      hero = document.createElement('div');
      hero.id = 'familyHero';
      hero.className = 'stoic-hero';
      const sec = document.getElementById('sec-dashboard');
      const header = sec?.querySelector('.section-header');
      if (header) sec.insertBefore(hero, header.nextSibling);
    } else {
      hero.className = 'stoic-hero';
    }
    hero.innerHTML = `
      <div class="stoic-hero-overlay"></div>
      <div class="stoic-hero-date">${fechaStr.replace(/^\w/, c => c.toUpperCase())}</div>
      <div class="stoic-hero-content">
        <div class="stoic-hero-icon">🏛️</div>
        <div class="stoic-hero-greeting">${saludo}, ${miguelName}</div>
        <div class="stoic-hero-sub">Disciplina · Estudio · Ahorro</div>
        <div class="stoic-hero-quote">
          <span class="quote-mark">"</span>
          <span class="quote-text">${quote.t}</span>
          <small class="quote-author">— ${quote.a}</small>
        </div>
      </div>`;
  }

  function _filterByPeriod(txs, period) {
    const now = new Date();
    return txs.filter(t => {
      const d = new Date(t.date);
      if (period === 'month')     return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      if (period === 'lastmonth') { const lm = new Date(now.getFullYear(), now.getMonth()-1, 1); return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth(); }
      if (period === 'year')      return d.getFullYear() === now.getFullYear();
      return true;
    });
  }

  function _sum(txs, type) {
    return txs.filter(t => t.type === type).reduce((s,t) => s + (t.amount||0), 0);
  }

  function _renderStats(txs) {
    const income  = _sum(txs, 'income');
    const expense = _sum(txs, 'expense');
    const net     = income - expense;
    const savings = State.getSavings().reduce((s,g) => s + (g.currentAmount||0), 0);
    const debt    = State.getDebts().filter(d => d.status !== 'paid').reduce((s,d) => s + (d.remainingAmount||0), 0);
    const rate    = income > 0 ? Math.round(((income - expense) / income) * 100) : 0;

    document.getElementById('dashStats').innerHTML = `
      <div class="stat-card income" style="cursor:pointer" onclick="App.navigate('transactions', { type:'income' })">
        <div class="stat-icon">💚</div>
        <div class="stat-label">Ingresos</div>
        <div class="stat-value text-success">${Utils.formatCurrency(income)}</div>
        <div class="stat-sub">${txs.filter(t=>t.type==='income').length} registros · ver detalle ▸</div>
      </div>
      <div class="stat-card expense" style="cursor:pointer" onclick="App.navigate('transactions', { type:'expense' })">
        <div class="stat-icon">❤️</div>
        <div class="stat-label">Gastos</div>
        <div class="stat-value text-danger">${Utils.formatCurrency(expense)}</div>
        <div class="stat-sub">${txs.filter(t=>t.type==='expense').length} registros · ver detalle ▸</div>
      </div>
      <div class="stat-card net" style="cursor:pointer" onclick="App.navigate('transactions')">
        <div class="stat-icon">${net>=0?'📈':'📉'}</div>
        <div class="stat-label">Saldo Neto</div>
        <div class="stat-value ${net>=0?'text-success':'text-danger'}">${net<0?'- ':''}${Utils.formatCurrency(Math.abs(net))}</div>
        <div class="stat-sub">${rate>=0?'▲':'▼'} ${Math.abs(rate)}% · ver detalle ▸</div>
      </div>
      <div class="stat-card savings" style="cursor:pointer" onclick="App.navigate('savings')">
        <div class="stat-icon">🎯</div>
        <div class="stat-label">Ahorros</div>
        <div class="stat-value text-primary">${Utils.formatCurrency(savings)}</div>
        <div class="stat-sub">${State.getSavings().length} metas · ver detalle ▸</div>
      </div>
      <div class="stat-card debt" style="cursor:pointer" onclick="App.navigate('debts')">
        <div class="stat-icon">💳</div>
        <div class="stat-label">Deudas</div>
        <div class="stat-value text-warning">${Utils.formatCurrency(debt)}</div>
        <div class="stat-sub">${State.getDebts().filter(d=>d.status!=='paid').length} pendientes · ver detalle ▸</div>
      </div>`;
  }

  function _renderCharts(txs, period) {
    // Monthly flow (last 6 months)
    const months = _last6Months();
    const allTxs = State.getTransactions();
    const incomes  = months.map(m => allTxs.filter(t => t.type==='income'  && Utils.monthKey(t.date)===m).reduce((s,t)=>s+t.amount,0));
    const expenses = months.map(m => allTxs.filter(t => t.type==='expense' && Utils.monthKey(t.date)===m).reduce((s,t)=>s+t.amount,0));
    const labels   = months.map(m => Utils.monthLabel(m).split(' ')[0].substring(0,3));

    const flowCtx = document.getElementById('dashFlowChart').getContext('2d');
    if (flowChart) flowChart.destroy();
    flowChart = new Chart(flowCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Ingresos',  data: incomes,  backgroundColor: 'rgba(16,185,129,0.7)', borderRadius: 4 },
          { label: 'Gastos',    data: expenses, backgroundColor: 'rgba(239,68,68,0.7)',  borderRadius: 4 }
        ]
      },
      options: _chartOpts('bar')
    });

    // Category pie
    const expTxs = txs.filter(t => t.type === 'expense');
    const catMap  = {};
    expTxs.forEach(t => { catMap[t.category] = (catMap[t.category]||0) + t.amount; });
    const catLabels = Object.keys(catMap).slice(0,8);
    const catData   = catLabels.map(k => catMap[k]);

    const catCtx = document.getElementById('dashCategoryChart').getContext('2d');
    if (catChart) catChart.destroy();
    catChart = new Chart(catCtx, {
      type: 'doughnut',
      data: { labels: catLabels, datasets: [{ data: catData, backgroundColor: Utils.COLORS, borderWidth: 0 }] },
      options: { responsive: true, plugins: { legend: { position: 'right', labels: { color: '#9B8FC4', boxWidth: 12, font: { size: 11 } } } } }
    });
  }

  function _last6Months() {
    const result = [];
    const d = new Date();
    for (let i = 5; i >= 0; i--) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      result.push(Utils.monthKey(m));
    }
    return result;
  }

  function _chartOpts(type) {
    return {
      responsive: true,
      plugins: { legend: { labels: { color: '#9B8FC4', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#9B8FC4' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#9B8FC4', callback: v => '$' + (v/1000000 >= 1 ? (v/1000000).toFixed(1)+'M' : v >= 1000 ? (v/1000).toFixed(0)+'K' : v) }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    };
  }

  function _renderUpcoming() {
    const txs = State.getTransactions().filter(t => t.recurring && t.nextDue);
    const soon = txs.filter(t => { const d = Utils.daysUntil(t.nextDue); return d !== null && d <= 14 && d >= 0; })
      .sort((a,b) => new Date(a.nextDue) - new Date(b.nextDue)).slice(0,5);

    const el = document.getElementById('dashUpcoming');
    if (!soon.length) { el.innerHTML = '<div class="empty-state"><p>No hay pagos próximos</p></div>'; return; }
    el.innerHTML = soon.map(t => {
      const days = Utils.daysUntil(t.nextDue);
      const urgency = days === 0 ? 'text-danger' : days <= 3 ? 'text-warning' : 'text-muted';
      return `<div class="tx-item" style="margin-bottom:4px" onclick="App.navigate('transactions')">
        <div class="tx-icon expense">${Utils.categoryIcon(t.category)}</div>
        <div class="tx-info"><div class="tx-desc">${Utils.escHtml(t.description)}</div>
          <div class="tx-meta"><span class="${urgency}">${days===0?'Hoy':days===1?'Mañana':'En '+days+' días'}</span></div></div>
        <div class="tx-amount expense">- ${Utils.formatCurrency(t.amount)}</div>
      </div>`;
    }).join('');
  }

  function _renderSavings() {
    const goals = State.getSavings().slice(0,3);
    const el    = document.getElementById('dashSavings');
    if (!goals.length) { el.innerHTML = '<div class="empty-state"><p>Sin metas de ahorro</p></div>'; return; }
    el.innerHTML = goals.map(g => {
      const pct = g.targetAmount > 0 ? Math.min(100, Math.round((g.currentAmount/g.targetAmount)*100)) : 0;
      return `<div style="margin-bottom:12px" onclick="App.navigate('savings')" style="cursor:pointer">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:13px">
          <span>${g.icon||'🎯'} <b>${Utils.escHtml(g.name)}</b></span>
          <span style="color:var(--text-m)">${pct}%</span>
        </div>
        <div class="goal-bar"><div class="goal-bar-fill" style="width:${pct}%;background:${g.color||'#8B5CF6'}"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-m);margin-top:3px">
          <span>${Utils.formatCurrency(g.currentAmount)}</span>
          <span>${Utils.formatCurrency(g.targetAmount)}</span>
        </div>
      </div>`;
    }).join('');
  }

  function _renderRecent(txs) {
    const recent = [...txs].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,6);
    const el     = document.getElementById('dashRecent');
    if (!recent.length) { el.innerHTML = '<div class="empty-state"><p>Sin transacciones</p></div>'; return; }
    el.innerHTML = recent.map(t => `
      <div class="tx-item" onclick="Transactions.openModal('${t.id}')">
        <div class="tx-icon ${t.type}">${Utils.categoryIcon(t.category)}</div>
        <div class="tx-info"><div class="tx-desc">${Utils.escHtml(t.description)}</div>
          <div class="tx-meta"><span>${Utils.formatDateShort(t.date)}</span><span>${Utils.escHtml(t.category)}</span></div></div>
        <div class="tx-amount ${t.type}">${t.type==='expense'?'- ':'+ '}${Utils.formatCurrency(t.amount)}</div>
      </div>`).join('');
  }

  return { render };
})();
