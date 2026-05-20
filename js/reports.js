const Reports = (() => {
  let _charts = {};

  function render() {
    const period = document.getElementById('reportPeriod')?.value || 'month';
    const { txs, months } = _getData(period);
    _destroyAll();
    _renderIncomeExpense(txs, months);
    _renderCategories(txs);
    _renderSavingsTrend(months);
    _renderPersons(txs);
    _renderNetWorth(months);
    _renderTable(txs, months);
  }

  function _getData(period) {
    const now    = new Date();
    const months = [];
    let n = 1;
    if (period === '3months') n = 3;
    else if (period === '6months') n = 6;
    else if (period === 'year') n = 12;

    for (let i = n-1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      months.push(Utils.monthKey(d));
    }

    const allTxs = State.getTransactions();
    const txs = allTxs.filter(t => months.some(m => t.date?.startsWith(m)));
    return { txs, months };
  }

  function _destroyAll() {
    Object.values(_charts).forEach(c => { try { c.destroy(); } catch {} });
    _charts = {};
  }

  function _chartOpts(type = 'bar') {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const textColor = isDark ? '#9B8FC4' : '#5B4FA0';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    const opts = {
      responsive: true,
      plugins: { legend: { labels: { color: textColor, boxWidth: 12, font: { size: 11 } } } }
    };
    if (type !== 'doughnut' && type !== 'pie') {
      opts.scales = {
        x: { ticks: { color: textColor }, grid: { color: gridColor } },
        y: { ticks: { color: textColor, callback: v => '$'+(v>=1000000?(v/1000000).toFixed(1)+'M':v>=1000?(v/1000).toFixed(0)+'K':v) }, grid: { color: gridColor } }
      };
    }
    return opts;
  }

  function _renderIncomeExpense(txs, months) {
    const labels   = months.map(m => Utils.monthLabel(m).split(' ')[0].substring(0,3));
    const incomes  = months.map(m => txs.filter(t=>t.type==='income' &&t.date?.startsWith(m)).reduce((s,t)=>s+t.amount,0));
    const expenses = months.map(m => txs.filter(t=>t.type==='expense'&&t.date?.startsWith(m)).reduce((s,t)=>s+t.amount,0));
    _charts.ie = new Chart(document.getElementById('reportIncomeExpense').getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: [
        { label:'Ingresos', data:incomes,  backgroundColor:'rgba(16,185,129,0.75)', borderRadius:4 },
        { label:'Gastos',   data:expenses, backgroundColor:'rgba(239,68,68,0.75)',  borderRadius:4 }
      ]},
      options: _chartOpts('bar')
    });
  }

  function _renderCategories(txs) {
    const catMap = {};
    txs.filter(t=>t.type==='expense').forEach(t => { catMap[t.category]=(catMap[t.category]||0)+t.amount; });
    const sorted = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,8);
    _charts.cat = new Chart(document.getElementById('reportCategories').getContext('2d'), {
      type: 'doughnut',
      data: { labels:sorted.map(([k])=>k), datasets:[{ data:sorted.map(([,v])=>v), backgroundColor:Utils.COLORS, borderWidth:0 }] },
      options: { ...(_chartOpts('doughnut')), plugins:{ legend:{ position:'right', labels:{ color:'#9B8FC4', boxWidth:12, font:{size:11} } } } }
    });
  }

  function _renderSavingsTrend(months) {
    const goals = State.getSavings();
    const data  = months.map((m,i) => {
      // Approximate cumulative savings by contributions up to this month
      return goals.reduce((s,g) => {
        const contrib = (g.contributions||[]).filter(c => c.date <= m+'-31').reduce((a,c)=>a+c.amount,0);
        return s + contrib;
      }, 0);
    });
    _charts.sav = new Chart(document.getElementById('reportSavings').getContext('2d'), {
      type: 'line',
      data: {
        labels: months.map(m => Utils.monthLabel(m).split(' ')[0].substring(0,3)),
        datasets:[{ label:'Ahorros Acumulados', data, borderColor:'#8B5CF6', backgroundColor:'rgba(139,92,246,0.1)', fill:true, tension:0.4, pointBackgroundColor:'#8B5CF6' }]
      },
      options: _chartOpts('line')
    });
  }

  function _renderPersons(txs) {
    const persons = ['karen','miguel','shared'];
    const labels  = ['👩 Karen','👨 Miguel','🏠 Compartido'];
    const incomes  = persons.map(p => txs.filter(t=>t.type==='income' &&t.person===p).reduce((s,t)=>s+t.amount,0));
    const expenses = persons.map(p => txs.filter(t=>t.type==='expense'&&t.person===p).reduce((s,t)=>s+t.amount,0));
    _charts.per = new Chart(document.getElementById('reportPersons').getContext('2d'), {
      type: 'bar',
      data: { labels, datasets:[
        { label:'Ingresos', data:incomes,  backgroundColor:['rgba(236,72,153,0.7)','rgba(59,130,246,0.7)','rgba(139,92,246,0.7)'], borderRadius:4 },
        { label:'Gastos',   data:expenses, backgroundColor:['rgba(236,72,153,0.3)','rgba(59,130,246,0.3)','rgba(139,92,246,0.3)'], borderRadius:4 }
      ]},
      options: _chartOpts('bar')
    });
  }

  function _renderNetWorth(months) {
    const allTxs = State.getTransactions();
    const data   = months.map(m => {
      const inc = allTxs.filter(t=>t.type==='income' &&t.date<=m+'-31').reduce((s,t)=>s+t.amount,0);
      const exp = allTxs.filter(t=>t.type==='expense'&&t.date<=m+'-31').reduce((s,t)=>s+t.amount,0);
      const sav = State.getSavings().reduce((s,g)=>s+(g.currentAmount||0),0);
      const dbt = State.getDebts().filter(d=>d.status!=='paid').reduce((s,d)=>s+(d.remainingAmount||0),0);
      return inc - exp + sav - dbt;
    });
    _charts.nw = new Chart(document.getElementById('reportNetWorth').getContext('2d'), {
      type: 'line',
      data: {
        labels: months.map(m => Utils.monthLabel(m).split(' ')[0].substring(0,3)),
        datasets:[{ label:'Patrimonio Neto', data, borderColor:'#EC4899', backgroundColor:'rgba(236,72,153,0.1)', fill:true, tension:0.4, pointBackgroundColor:'#EC4899' }]
      },
      options: _chartOpts('line')
    });
  }

  function _renderTable(txs, months) {
    const rows = months.map(m => {
      const inc  = txs.filter(t=>t.type==='income' &&t.date?.startsWith(m)).reduce((s,t)=>s+t.amount,0);
      const exp  = txs.filter(t=>t.type==='expense'&&t.date?.startsWith(m)).reduce((s,t)=>s+t.amount,0);
      const net  = inc - exp;
      const rate = inc > 0 ? Math.round((net/inc)*100) : 0;
      return { month:Utils.monthLabel(m), inc, exp, net, rate };
    });
    document.getElementById('reportSummaryTable').innerHTML = `
      <table class="report-table">
        <thead><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th><th>Neto</th><th>Tasa Ahorro</th></tr></thead>
        <tbody>${rows.map(r=>`<tr>
          <td>${r.month}</td>
          <td class="text-success fw-700">${Utils.formatCurrency(r.inc)}</td>
          <td class="text-danger fw-700">${Utils.formatCurrency(r.exp)}</td>
          <td class="${r.net>=0?'text-success':'text-danger'} fw-700">${r.net>=0?'+':''}${Utils.formatCurrency(r.net)}</td>
          <td>${r.rate}%</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr style="border-top:2px solid var(--border2)">
          <td><b>Total</b></td>
          <td class="text-success fw-700">${Utils.formatCurrency(rows.reduce((s,r)=>s+r.inc,0))}</td>
          <td class="text-danger fw-700">${Utils.formatCurrency(rows.reduce((s,r)=>s+r.exp,0))}</td>
          <td class="fw-700">${Utils.formatCurrency(rows.reduce((s,r)=>s+r.net,0))}</td>
          <td>—</td>
        </tr></tfoot>
      </table>`;
  }

  function exportCSV() {
    const txs = State.getTransactions();
    const headers = ['Fecha','Tipo','Descripción','Categoría','Monto','Persona','Método Pago','Notas'];
    const rows    = txs.map(t => [
      t.date, t.type==='income'?'Ingreso':'Gasto', t.description, t.category,
      t.amount, Utils.personLabel(t.person), t.paymentMethod||'', t.notes||''
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `family-system-${Utils.today()}.csv`; a.click();
    URL.revokeObjectURL(url);
    App.toast('CSV exportado ✓','success');
  }

  return { render, exportCSV };
})();
