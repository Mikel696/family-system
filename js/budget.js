const Budget = (() => {
  const DEFAULT_CATS = [
    { name:'Arriendo',      icon:'🏠', limit: 0 },
    { name:'Mercado',       icon:'🛒', limit: 0 },
    { name:'Transporte',    icon:'🚌', limit: 0 },
    { name:'Servicios',     icon:'💡', limit: 0 },
    { name:'Salud',         icon:'💊', limit: 0 },
    { name:'Entretenimiento',icon:'🎬',limit: 0 },
    { name:'Ropa',          icon:'👗', limit: 0 },
    { name:'Restaurante',   icon:'🍽️', limit: 0 },
    { name:'Educación',     icon:'📚', limit: 0 },
    { name:'Otros',         icon:'📦', limit: 0 }
  ];

  function render() {
    const month = document.getElementById('budgetMonth')?.value || Utils.monthKey();
    let cats     = State.getBudget(month);
    if (!cats.length) cats = DEFAULT_CATS.map(c => ({ ...c, id: Utils.uuid() }));
    const txs    = State.getTransactions().filter(t => t.type==='expense' && t.date?.startsWith(month));

    // Attach spent amounts
    cats = cats.map(c => {
      const spent = txs.filter(t => t.category === c.name).reduce((s,t) => s+t.amount, 0);
      return { ...c, spent };
    });

    _renderStats(cats, txs);
    _renderCategories(cats, month);
  }

  function _renderStats(cats, txs) {
    const totalLimit = cats.reduce((s,c) => s + (c.limit||0), 0);
    const totalSpent = cats.reduce((s,c) => s + (c.spent||0), 0);
    const remaining  = totalLimit - totalSpent;
    const pct        = totalLimit > 0 ? Math.min(100, Math.round((totalSpent/totalLimit)*100)) : 0;
    document.getElementById('budgetStats').innerHTML = `
      <div class="stat-card">
        <div class="stat-icon">📊</div>
        <div class="stat-label">Presupuesto Total</div>
        <div class="stat-value">${Utils.formatCurrency(totalLimit)}</div>
      </div>
      <div class="stat-card expense">
        <div class="stat-icon">💸</div>
        <div class="stat-label">Gastado</div>
        <div class="stat-value text-danger">${Utils.formatCurrency(totalSpent)}</div>
        <div class="stat-sub">${pct}% del presupuesto</div>
      </div>
      <div class="stat-card ${remaining>=0?'income':'expense'}">
        <div class="stat-icon">${remaining>=0?'✅':'⚠️'}</div>
        <div class="stat-label">Disponible</div>
        <div class="stat-value ${remaining>=0?'text-success':'text-danger'}">${Utils.formatCurrency(Math.abs(remaining))}</div>
        <div class="stat-sub">${remaining<0?'Excedido por':''}</div>
      </div>`;
  }

  function _renderCategories(cats, month) {
    const el = document.getElementById('budgetList');
    el.innerHTML = cats.map(c => {
      const pct    = c.limit > 0 ? Math.min(120, Math.round((c.spent/c.limit)*100)) : 0;
      const over   = c.limit > 0 && c.spent > c.limit;
      const color  = over ? 'var(--danger)' : pct > 75 ? 'var(--warning)' : 'var(--success)';
      return `
        <div class="budget-category">
          <div class="budget-cat-header">
            <div class="budget-cat-name">
              ${c.icon} ${Utils.escHtml(c.name)}
              ${over ? '<span class="tag" style="background:rgba(239,68,68,0.15);color:var(--danger-l)">⚠️ Excedido</span>' : ''}
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <div class="budget-cat-amounts">
                <span class="budget-cat-spent" style="color:${color}">${Utils.formatCurrency(c.spent)}</span>
                <span class="budget-cat-limit">/ ${c.limit > 0 ? Utils.formatCurrency(c.limit) : 'Sin límite'}</span>
              </div>
              <button class="btn-icon btn-sm" onclick="Budget.editCategory('${month}','${c.id}')">✏️</button>
              <button class="btn-icon btn-sm" onclick="Budget.deleteCategory('${month}','${c.id}')">🗑️</button>
            </div>
          </div>
          ${c.limit > 0 ? `<div class="budget-bar"><div class="budget-bar-fill ${over?'over':''}" style="width:${Math.min(100,pct)}%;background:${over?'':color}"></div></div>` : ''}
        </div>`;
    }).join('');
  }

  function openModal(id, monthArg) {
    const month = monthArg || document.getElementById('budgetMonth')?.value || Utils.monthKey();
    const cats  = State.getBudget(month);
    const cat   = id ? cats.find(c=>c.id===id) : null;
    const allCatNames = [...new Set([...Utils.TX_CATEGORIES.expense, ...(cats.map(c=>c.name))])];
    const html = `
      <div class="form-group">
        <label class="form-label">Categoría *</label>
        <select id="bcCat" class="form-select">
          ${allCatNames.map(n=>`<option${cat?.name===n?' selected':''}>${n}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Ícono</label>
        <input type="text" id="bcIcon" class="form-input" value="${cat?.icon||''}" placeholder="Ej: 🏠 (emoji)">
      </div>
      <div class="form-group">
        <label class="form-label">Límite Mensual (COP)</label>
        <input type="number" id="bcLimit" class="form-input" value="${cat?.limit||''}" placeholder="0 = sin límite" min="0">
      </div>
      <div class="form-actions">
        <button class="btn-outline" onclick="App.closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="Budget.saveCategory('${month}','${id||''}')">Guardar</button>
      </div>`;
    App.openModal(id?'Editar Categoría':'Nueva Categoría de Presupuesto', html);
  }

  function saveCategory(month, id) {
    const name  = document.getElementById('bcCat')?.value;
    const icon  = document.getElementById('bcIcon')?.value || Utils.categoryIcon(name);
    const limit = parseFloat(document.getElementById('bcLimit')?.value) || 0;
    if (!name) { App.toast('Selecciona una categoría','warning'); return; }
    let cats = State.getBudget(month);
    if (!cats.length) cats = DEFAULT_CATS.map(c => ({ ...c, id: Utils.uuid() }));
    if (id) {
      const idx = cats.findIndex(c=>c.id===id);
      if (idx >= 0) cats[idx] = { ...cats[idx], name, icon, limit };
    } else {
      if (!cats.find(c=>c.name===name)) cats.push({ id: Utils.uuid(), name, icon, limit });
      else { App.toast('Esa categoría ya existe','warning'); return; }
    }
    State.saveBudget(month, cats);
    App.closeModal();
    render();
    App.toast('Categoría guardada','success');
  }

  function editCategory(month, id) { openModal(id, month); }

  function deleteCategory(month, id) {
    let cats = State.getBudget(month);
    cats = cats.filter(c => c.id !== id);
    State.saveBudget(month, cats);
    render();
    App.toast('Categoría eliminada','info');
  }

  return { render, openModal, saveCategory, editCategory, deleteCategory };
})();
