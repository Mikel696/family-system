const Savings = (() => {
  function render() {
    const goals = State.getSavings();
    _renderStats(goals);
    _renderGoals(goals);
  }

  function _renderStats(goals) {
    const total   = goals.reduce((s,g) => s + (g.currentAmount||0), 0);
    const target  = goals.reduce((s,g) => s + (g.targetAmount||0), 0);
    const done    = goals.filter(g => g.currentAmount >= g.targetAmount).length;
    const overall = target > 0 ? Math.round((total/target)*100) : 0;
    document.getElementById('savingsStats').innerHTML = `
      <div class="stat-card savings">
        <div class="stat-icon">💰</div>
        <div class="stat-label">Ahorro Total</div>
        <div class="stat-value text-primary">${Utils.formatCurrency(total)}</div>
        <div class="stat-sub">de ${Utils.formatCurrency(target)} objetivo</div>
      </div>
      <div class="stat-card income">
        <div class="stat-icon">📊</div>
        <div class="stat-label">Progreso Global</div>
        <div class="stat-value text-success">${overall}%</div>
        <div class="stat-sub">${goals.length} metas activas</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🏆</div>
        <div class="stat-label">Metas Cumplidas</div>
        <div class="stat-value">${done}</div>
        <div class="stat-sub">de ${goals.length} metas</div>
      </div>`;
  }

  function _renderGoals(goals) {
    const el = document.getElementById('savingsList');
    if (!goals.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">🎯</div><h4>Sin metas de ahorro</h4><p>Crea tu primera meta y empieza a ahorrar</p><button class="btn-primary" onclick="Savings.openModal()">+ Crear Meta</button></div>`;
      return;
    }
    el.innerHTML = goals.map(g => {
      const pct  = g.targetAmount > 0 ? Math.min(100, Math.round((g.currentAmount/g.targetAmount)*100)) : 0;
      const days = g.deadline ? Utils.daysUntil(g.deadline) : null;
      const done = g.currentAmount >= g.targetAmount;
      return `
        <div class="goal-card" style="--goal-color:${g.color||'#8B5CF6'}">
          <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${g.color||'#8B5CF6'}"></div>
          <div class="goal-header">
            <div>
              <div class="goal-icon">${g.icon||'🎯'}</div>
              <div class="goal-name">${Utils.escHtml(g.name)}</div>
              ${g.description ? `<div style="font-size:12px;color:var(--text-m)">${Utils.escHtml(g.description)}</div>` : ''}
            </div>
            <div class="goal-actions">
              <button class="btn-icon btn-sm" onclick="Savings.addContribution('${g.id}')" title="Abonar">💰</button>
              <button class="btn-icon btn-sm" onclick="Savings.openModal('${g.id}')" title="Editar">✏️</button>
              <button class="btn-icon btn-sm" onclick="Savings.delete('${g.id}')" title="Eliminar">🗑️</button>
            </div>
          </div>
          <div class="goal-amounts">
            <div>
              <div style="font-size:11px;color:var(--text-m)">Ahorrado</div>
              <div class="goal-current" style="color:${g.color||'#8B5CF6'}">${Utils.formatCurrency(g.currentAmount||0)}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:11px;color:var(--text-m)">Objetivo</div>
              <div class="goal-target">${Utils.formatCurrency(g.targetAmount||0)}</div>
            </div>
          </div>
          <div class="goal-bar">
            <div class="goal-bar-fill" style="width:${pct}%;background:${done?'#10B981':g.color||'#8B5CF6'}"></div>
          </div>
          <div class="goal-meta">
            <span class="goal-pct">${done?'✅ Meta cumplida':pct+'% completado'}</span>
            ${days!==null ? `<span style="color:${days<0?'var(--danger)':days<=30?'var(--warning)':'var(--text-m)'}">${days<0?'Vencido hace '+Math.abs(days)+'d':days===0?'Vence hoy':'Faltan '+days+' días'}</span>` : ''}
          </div>
          ${g.contributions?.length ? `<div class="divider"></div><div style="font-size:12px;color:var(--text-m)">Últimas contribuciones:</div>
            ${g.contributions.slice(-3).reverse().map(c=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border)"><span>${Utils.formatDateShort(c.date)} — ${Utils.escHtml(c.note||'Abono')}</span><span style="color:var(--success);font-weight:600">+${Utils.formatCurrency(c.amount)}</span></div>`).join('')}` : ''}
        </div>`;
    }).join('');
  }

  function openModal(id) {
    const g = id ? State.getSavings().find(x=>x.id===id) : null;
    const icons = ['🎯','🏠','🚗','✈️','💍','📱','💻','🎓','👶','🐾','🎁','💊','🔧','🌴','🏦'];
    const html = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Nombre de la Meta *</label>
          <input type="text" id="savName" class="form-input" value="${Utils.escHtml(g?.name||'')}" placeholder="Ej: Viaje a Cartagena">
        </div>
        <div class="form-group">
          <label class="form-label">Descripción</label>
          <input type="text" id="savDesc" class="form-input" value="${Utils.escHtml(g?.description||'')}" placeholder="Opcional">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Monto Objetivo (COP) *</label>
          <input type="number" id="savTarget" class="form-input" value="${g?.targetAmount||''}" placeholder="0" min="0">
        </div>
        <div class="form-group">
          <label class="form-label">Ahorrado Actualmente</label>
          <input type="number" id="savCurrent" class="form-input" value="${g?.currentAmount||0}" placeholder="0" min="0">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha Límite</label>
        <input type="date" id="savDeadline" class="form-input" value="${g?.deadline||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Ícono</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${icons.map(ic=>`<button class="btn-icon" style="font-size:20px;${g?.icon===ic?'border-color:var(--primary);background:rgba(139,92,246,0.15)':''}" onclick="Savings._setIcon(this,'${ic}')" data-icon="${ic}">${ic}</button>`).join('')}
        </div>
        <input type="hidden" id="savIcon" value="${g?.icon||'🎯'}">
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div class="color-row">
          ${Utils.COLORS.map(c=>`<div class="color-chip${g?.color===c?' selected':''}" style="background:${c}" onclick="Savings._setColor(this,'${c}')" data-color="${c}"></div>`).join('')}
          <input type="hidden" id="savColor" value="${g?.color||Utils.COLORS[0]}">
        </div>
      </div>
      <div class="form-actions">
        ${id?`<button class="btn-danger" onclick="Savings.delete('${id}');App.closeModal()">Eliminar</button>`:''}
        <button class="btn-outline" onclick="App.closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="Savings.save('${id||''}')">Guardar</button>
      </div>`;
    App.openModal(id?'Editar Meta':'Nueva Meta de Ahorro', html);
  }

  function _setIcon(btn, icon) {
    document.querySelectorAll('[data-icon]').forEach(b => b.style.borderColor = '');
    btn.style.borderColor = 'var(--primary)';
    btn.style.background  = 'rgba(139,92,246,0.15)';
    document.getElementById('savIcon').value = icon;
  }

  function _setColor(el, color) {
    document.querySelectorAll('.color-chip').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    document.getElementById('savColor').value = color;
  }

  function save(id) {
    const name   = document.getElementById('savName')?.value.trim();
    const target = parseFloat(document.getElementById('savTarget')?.value);
    if (!name || !target) { App.toast('Completa nombre y objetivo', 'warning'); return; }
    const existing = id ? State.getSavings().find(x=>x.id===id) : null;
    const g = {
      id:            id || Utils.uuid(),
      name,
      description:   document.getElementById('savDesc')?.value || '',
      targetAmount:  target,
      currentAmount: parseFloat(document.getElementById('savCurrent')?.value)||0,
      deadline:      document.getElementById('savDeadline')?.value || '',
      icon:          document.getElementById('savIcon')?.value || '🎯',
      color:         document.getElementById('savColor')?.value || Utils.COLORS[0],
      contributions: existing?.contributions || [],
      createdAt:     existing?.createdAt || new Date().toISOString()
    };
    State.saveSaving(g);
    App.closeModal();
    App.toast(id?'Meta actualizada':'Meta creada','success');
    render();
  }

  function addContribution(id) {
    const g = State.getSavings().find(x=>x.id===id);
    if (!g) return;
    const html = `
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-size:32px">${g.icon||'🎯'}</div>
        <div style="font-weight:700;font-size:16px">${Utils.escHtml(g.name)}</div>
        <div style="font-size:13px;color:var(--text-m)">${Utils.formatCurrency(g.currentAmount)} / ${Utils.formatCurrency(g.targetAmount)}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Monto a Abonar (COP) *</label>
        <input type="number" id="contribAmount" class="form-input" placeholder="0" min="0" autofocus>
      </div>
      <div class="form-group">
        <label class="form-label">Nota</label>
        <input type="text" id="contribNote" class="form-input" placeholder="Ej: Quincena de mayo">
      </div>
      <div class="form-actions">
        <button class="btn-outline" onclick="App.closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="Savings._saveContrib('${id}')">Abonar 💰</button>
      </div>`;
    App.openModal('Abonar a Meta', html);
  }

  function _saveContrib(id) {
    const amount = parseFloat(document.getElementById('contribAmount')?.value);
    const note   = document.getElementById('contribNote')?.value || '';
    if (!amount || amount <= 0) { App.toast('Ingresa un monto válido','warning'); return; }
    const goals = State.getSavings();
    const g = goals.find(x=>x.id===id);
    if (!g) return;
    g.contributions = [...(g.contributions||[]), { date: Utils.today(), amount, note }];
    g.currentAmount = (g.currentAmount||0) + amount;
    State.saveSaving(g);
    App.closeModal();
    App.toast('Abono registrado ✓','success');
    render();
  }

  function _delete(id) {
    if (!confirm('¿Eliminar esta meta?')) return;
    State.deleteSaving(id);
    App.toast('Meta eliminada','info');
    render();
  }

  return { render, openModal, save, addContribution, _saveContrib, _setIcon, _setColor, delete: _delete };
})();
