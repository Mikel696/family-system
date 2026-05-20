const Debts = (() => {
  function render() {
    const debts = State.getDebts();
    _renderStats(debts);
    _renderList(debts);
  }

  function _renderStats(debts) {
    const active  = debts.filter(d => d.status !== 'paid');
    const total   = active.reduce((s,d) => s + (d.remainingAmount||0), 0);
    const monthly = active.reduce((s,d) => s + (d.monthlyPayment||0), 0);
    const paid    = debts.filter(d => d.status === 'paid').length;
    document.getElementById('debtsStats').innerHTML = `
      <div class="stat-card debt">
        <div class="stat-icon">💳</div>
        <div class="stat-label">Total Deuda</div>
        <div class="stat-value text-warning">${Utils.formatCurrency(total)}</div>
        <div class="stat-sub">${active.length} deudas activas</div>
      </div>
      <div class="stat-card expense">
        <div class="stat-icon">📆</div>
        <div class="stat-label">Cuota Mensual</div>
        <div class="stat-value text-danger">${Utils.formatCurrency(monthly)}</div>
        <div class="stat-sub">compromiso mensual</div>
      </div>
      <div class="stat-card income">
        <div class="stat-icon">🏆</div>
        <div class="stat-label">Deudas Pagadas</div>
        <div class="stat-value text-success">${paid}</div>
        <div class="stat-sub">deudas saldadas</div>
      </div>`;
  }

  function _renderList(debts) {
    const el = document.getElementById('debtsList');
    if (!debts.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">💳</div><h4>Sin deudas registradas</h4><p>Registra tus deudas para hacer seguimiento</p><button class="btn-primary" onclick="Debts.openModal()">+ Agregar Deuda</button></div>`;
      return;
    }
    el.innerHTML = debts.map(d => {
      const total   = d.totalAmount || 0;
      const remain  = d.remainingAmount || 0;
      const paid    = total - remain;
      const pct     = total > 0 ? Math.min(100, Math.round((paid/total)*100)) : 0;
      const days    = d.nextPaymentDate ? Utils.daysUntil(d.nextPaymentDate) : null;
      const isDone  = d.status === 'paid';
      const barColor = isDone ? '#10B981' : pct > 66 ? '#10B981' : pct > 33 ? '#F59E0B' : '#EF4444';
      return `
        <div class="debt-item">
          <div class="debt-header">
            <div class="debt-name-row">
              <span class="debt-icon">${Utils.debtTypeIcon(d.type)}</span>
              <div>
                <div class="debt-name">${Utils.escHtml(d.creditor)}</div>
                <div class="debt-type">${_typeLabel(d.type)} · ${Utils.personLabel(d.person)} ${isDone?'· <span style="color:var(--success)">✅ Saldada</span>':''}</div>
              </div>
            </div>
            <div class="debt-actions">
              ${!isDone?`<button class="btn-outline btn-sm" onclick="Debts.registerPayment('${d.id}')">💰 Pagar</button>`:''}
              <button class="btn-icon btn-sm" onclick="Debts.openModal('${d.id}')">✏️</button>
              <button class="btn-icon btn-sm" onclick="Debts.delete('${d.id}')">🗑️</button>
            </div>
          </div>
          <div class="debt-stats">
            <div class="debt-stat">
              <div class="debt-stat-label">Total</div>
              <div class="debt-stat-value">${Utils.formatCurrency(total)}</div>
            </div>
            <div class="debt-stat">
              <div class="debt-stat-label">Pagado</div>
              <div class="debt-stat-value text-success">${Utils.formatCurrency(paid)}</div>
            </div>
            <div class="debt-stat">
              <div class="debt-stat-label">Restante</div>
              <div class="debt-stat-value text-danger">${Utils.formatCurrency(remain)}</div>
            </div>
            <div class="debt-stat">
              <div class="debt-stat-label">Cuota</div>
              <div class="debt-stat-value">${Utils.formatCurrency(d.monthlyPayment||0)}</div>
            </div>
            ${d.interestRate ? `<div class="debt-stat"><div class="debt-stat-label">Interés</div><div class="debt-stat-value">${d.interestRate}% EA</div></div>` : ''}
            ${days!==null ? `<div class="debt-stat"><div class="debt-stat-label">Próx. Pago</div><div class="debt-stat-value" style="color:${days<=3?'var(--danger)':days<=7?'var(--warning)':'inherit'};font-size:13px">${days===0?'Hoy':days<0?'Vencido':days+' días'}</div></div>` : ''}
          </div>
          <div class="debt-bar">
            <div class="debt-bar-fill" style="width:${pct}%;background:${barColor}"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-m);margin-top:4px">
            <span>${pct}% pagado</span>
            ${d.endDate ? `<span>Finaliza ${Utils.formatDate(d.endDate)}</span>` : ''}
          </div>
          ${d.payments?.length ? `<div style="margin-top:10px;font-size:12px;color:var(--text-m)">Últimos pagos: ${d.payments.slice(-3).reverse().map(p=>`<span style="margin-left:8px;color:var(--success)">${Utils.formatDateShort(p.date)} +${Utils.formatCurrency(p.amount)}</span>`).join('')}</div>` : ''}
        </div>`;
    }).join('');
  }

  function _typeLabel(t) {
    return { loan:'Préstamo', credit_card:'Tarjeta Crédito', personal:'Deuda Personal', mortgage:'Hipoteca', other:'Otra' }[t] || t;
  }

  function openModal(id) {
    const d = id ? State.getDebts().find(x=>x.id===id) : null;
    const html = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Acreedor / Entidad *</label>
          <input type="text" id="dtCreditor" class="form-input" value="${Utils.escHtml(d?.creditor||'')}" placeholder="Ej: Bancolombia, Juan Pérez">
        </div>
        <div class="form-group">
          <label class="form-label">Tipo de Deuda</label>
          <select id="dtType" class="form-select">
            ${[['loan','Préstamo'],['credit_card','Tarjeta Crédito'],['personal','Deuda Personal'],['mortgage','Hipoteca'],['other','Otra']].map(([v,l])=>`<option value="${v}"${d?.type===v?' selected':''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Monto Total (COP) *</label>
          <input type="number" id="dtTotal" class="form-input" value="${d?.totalAmount||''}" placeholder="0" min="0" oninput="Debts._calcRemaining()">
        </div>
        <div class="form-group">
          <label class="form-label">Monto Pendiente</label>
          <input type="number" id="dtRemaining" class="form-input" value="${d?.remainingAmount||d?.totalAmount||''}" placeholder="0" min="0">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Cuota Mensual</label>
          <input type="number" id="dtMonthly" class="form-input" value="${d?.monthlyPayment||''}" placeholder="0" min="0">
        </div>
        <div class="form-group">
          <label class="form-label">Tasa Interés (% EA)</label>
          <input type="number" id="dtRate" class="form-input" value="${d?.interestRate||''}" placeholder="0" step="0.1" min="0">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Fecha Inicio</label>
          <input type="date" id="dtStart" class="form-input" value="${d?.startDate||Utils.today()}">
        </div>
        <div class="form-group">
          <label class="form-label">Fecha Fin (Estimada)</label>
          <input type="date" id="dtEnd" class="form-input" value="${d?.endDate||''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Próximo Pago</label>
          <input type="date" id="dtNextPayment" class="form-input" value="${d?.nextPaymentDate||''}">
        </div>
        <div class="form-group">
          <label class="form-label">Responsable</label>
          <select id="dtPerson" class="form-select">
            <option value="shared" ${(d?.person||'shared')==='shared'?'selected':''}>🏠 Compartida</option>
            <option value="karen"  ${d?.person==='karen'?'selected':''}>👩 Karen</option>
            <option value="miguel" ${d?.person==='miguel'?'selected':''}>👨 Miguel</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Estado</label>
        <select id="dtStatus" class="form-select">
          <option value="active" ${(d?.status||'active')==='active'?'selected':''}>Activa</option>
          <option value="paid"   ${d?.status==='paid'?'selected':''}>Pagada</option>
          <option value="defaulted" ${d?.status==='defaulted'?'selected':''}>En mora</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Notas</label>
        <textarea id="dtNotes" class="form-textarea" placeholder="Detalles adicionales...">${Utils.escHtml(d?.notes||'')}</textarea>
      </div>
      <div class="form-actions">
        ${id?`<button class="btn-danger" onclick="Debts.delete('${id}');App.closeModal()">Eliminar</button>`:''}
        <button class="btn-outline" onclick="App.closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="Debts.save('${id||''}')">Guardar</button>
      </div>`;
    App.openModal(id?'Editar Deuda':'Nueva Deuda', html);
  }

  function _calcRemaining() {
    const total = parseFloat(document.getElementById('dtTotal')?.value) || 0;
    const rem   = document.getElementById('dtRemaining');
    if (rem && !rem.value) rem.value = total;
  }

  function save(id) {
    const creditor = document.getElementById('dtCreditor')?.value.trim();
    const total    = parseFloat(document.getElementById('dtTotal')?.value);
    if (!creditor || !total) { App.toast('Completa acreedor y monto','warning'); return; }
    const existing = id ? State.getDebts().find(x=>x.id===id) : null;
    const d = {
      id:              id || Utils.uuid(),
      creditor,
      type:            document.getElementById('dtType')?.value     || 'loan',
      totalAmount:     total,
      remainingAmount: parseFloat(document.getElementById('dtRemaining')?.value) || total,
      monthlyPayment:  parseFloat(document.getElementById('dtMonthly')?.value)   || 0,
      interestRate:    parseFloat(document.getElementById('dtRate')?.value)       || 0,
      startDate:       document.getElementById('dtStart')?.value       || Utils.today(),
      endDate:         document.getElementById('dtEnd')?.value          || '',
      nextPaymentDate: document.getElementById('dtNextPayment')?.value  || '',
      person:          document.getElementById('dtPerson')?.value       || 'shared',
      status:          document.getElementById('dtStatus')?.value       || 'active',
      notes:           document.getElementById('dtNotes')?.value        || '',
      payments:        existing?.payments || [],
      createdAt:       existing?.createdAt || new Date().toISOString()
    };
    State.saveDebt(d);
    App.closeModal();
    App.toast(id?'Deuda actualizada':'Deuda registrada','success');
    render();
  }

  // Pending attachments for the payment modal
  let _dpAttachments = [];

  function registerPayment(id) {
    const d = State.getDebts().find(x=>x.id===id);
    if (!d) return;
    _dpAttachments = [];
    const html = `
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-size:36px">${Utils.debtTypeIcon(d.type)}</div>
        <div style="font-weight:700;font-size:16px">${Utils.escHtml(d.creditor)}</div>
        <div style="font-size:13px;color:var(--text-m);margin-top:4px">Saldo pendiente: <b>${Utils.formatCurrency(d.remainingAmount)}</b></div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Monto del Pago *</label>
          <input type="number" id="dpAmount" class="form-input" value="${d.monthlyPayment||''}" placeholder="0" min="0" autofocus>
        </div>
        <div class="form-group">
          <label class="form-label">Fecha del Pago</label>
          <input type="date" id="dpDate" class="form-input" value="${Utils.today()}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Método de Pago</label>
        <select id="dpMethod" class="form-select">
          ${['Transferencia','PSE','Efectivo','Nequi','Daviplata','Tarjeta débito','Tarjeta crédito','Otro'].map(m=>`<option>${m}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Nota / Referencia</label>
        <input type="text" id="dpNote" class="form-input" placeholder="Ej: Cuota de junio · Ref 123456">
      </div>
      <div class="form-group">
        <label class="form-label">Comprobante / Adjuntos</label>
        <div class="attachment-zone" onclick="document.getElementById('dpFileInput').click()"
          ondragover="event.preventDefault();this.classList.add('dragging')"
          ondragleave="this.classList.remove('dragging')"
          ondrop="Debts._dpOnDrop(event)">
          📎 Arrastra el comprobante de pago o haz clic (imágenes, PDF, capturas)
        </div>
        <input type="file" id="dpFileInput" style="display:none" multiple
          onchange="Debts._dpOnFiles(this.files)">
        <div class="attachment-list" id="dpAttachList"></div>
      </div>
      <div class="form-actions">
        <button class="btn-outline" onclick="App.closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="Debts._savePayment('${id}')">✅ Registrar Pago</button>
      </div>`;
    App.openModal('Registrar Pago — ' + d.creditor, html);
  }

  function _dpOnFiles(files) {
    Array.from(files).forEach(f => {
      const id = Utils.uuid();
      _dpAttachments.push({ file: f, id });
      const list = document.getElementById('dpAttachList');
      const item = document.createElement('div');
      item.className = 'attachment-item'; item.id = 'dpatt-' + id;
      item.innerHTML = `<span class="attachment-icon">${Utils.fileIcon(f.type)}</span>
        <div class="attachment-info">
          <div class="attachment-name">${Utils.escHtml(f.name)}</div>
          <div class="attachment-size">${Utils.fileSize(f.size)}</div>
        </div>
        <button class="attachment-remove" onclick="Debts._dpRemoveAttach('${id}')">✕</button>`;
      list?.appendChild(item);
    });
    document.getElementById('dpFileInput').value = '';
  }

  function _dpOnDrop(e) {
    e.preventDefault();
    e.target.closest('.attachment-zone')?.classList.remove('dragging');
    _dpOnFiles(e.dataTransfer.files);
  }

  function _dpRemoveAttach(id) {
    _dpAttachments = _dpAttachments.filter(a => a.id !== id);
    document.getElementById('dpatt-' + id)?.remove();
  }

  async function _savePayment(id) {
    const amount = parseFloat(document.getElementById('dpAmount')?.value);
    const date   = document.getElementById('dpDate')?.value || Utils.today();
    const note   = document.getElementById('dpNote')?.value || '';
    const method = document.getElementById('dpMethod')?.value || 'Transferencia';
    if (!amount || amount <= 0) { App.toast('Ingresa un monto válido', 'warning'); return; }

    // Save attachments to IndexedDB
    const attIds = [];
    for (const { file, id } of _dpAttachments) {
      await DB.saveAttachment(id, file);
      attIds.push(id);
    }

    const debts = State.getDebts();
    const d = debts.find(x => x.id === id);
    if (!d) return;
    d.payments = [...(d.payments||[]), { date, amount, note, method, attachments: attIds }];
    d.remainingAmount = Math.max(0, (d.remainingAmount||0) - amount);
    if (d.remainingAmount <= 0) d.status = 'paid';
    if (d.nextPaymentDate) {
      const nd = new Date(d.nextPaymentDate);
      nd.setMonth(nd.getMonth() + 1);
      d.nextPaymentDate = nd.toISOString().slice(0, 10);
    }
    State.saveDebt(d);
    // Register as expense transaction
    State.saveTransaction({
      id: Utils.uuid(), type: 'expense',
      description: 'Pago: ' + d.creditor,
      amount, category: 'Deuda', person: d.person || 'shared',
      date, paymentMethod: method, notes: note,
      recurring: false, tags: [], attachments: attIds, voiceNotes: [],
      createdAt: new Date().toISOString()
    });
    _dpAttachments = [];
    App.closeModal();
    App.toast('Pago registrado ✓', 'success');
    Alerts.check();
    render();
  }

  function _delete(id) {
    if (!confirm('¿Eliminar esta deuda?')) return;
    State.deleteDebt(id);
    App.toast('Deuda eliminada','info');
    render();
  }

  return { render, openModal, save, registerPayment, _savePayment, _calcRemaining, delete: _delete };
})();
