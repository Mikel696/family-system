/* helper: perfil real del usuario logueado (siempre 'karen' o 'miguel') */
function _myProfile() {
  const p = (typeof Auth !== 'undefined' && Auth.currentProfile && Auth.currentProfile()) ||
            (typeof App  !== 'undefined' && App.getUser && App.getUser());
  return (p === 'karen' || p === 'miguel') ? p : 'miguel';
}

const Transactions = (() => {
  let _pendingAttachments = []; // { file, id } before save
  let _pendingVoices      = []; // { id, duration }
  let _editId             = null;

  function filter() {
    const search  = (document.getElementById('txSearch')?.value || '').toLowerCase();
    const type    = document.getElementById('txType')?.value  || '';
    const cat     = document.getElementById('txCategory')?.value || '';
    const person  = document.getElementById('txPerson')?.value || '';
    const month   = document.getElementById('txMonth')?.value  || '';
    let txs = State.getTransactions();

    if (type)   txs = txs.filter(t => t.type === type);
    if (cat)    txs = txs.filter(t => t.category === cat);
    if (person) txs = txs.filter(t => t.person === person);
    if (month)  txs = txs.filter(t => t.date && t.date.startsWith(month));
    if (search) txs = txs.filter(t => (t.description||'').toLowerCase().includes(search) || (t.category||'').toLowerCase().includes(search) || (t.notes||'').toLowerCase().includes(search));

    txs.sort((a,b) => new Date(b.date)-new Date(a.date));
    _populateCategoryFilter();
    _renderSummary(txs);
    _renderList(txs);
  }

  function _populateCategoryFilter() {
    const all  = State.getTransactions();
    const cats = [...new Set(all.map(t => t.category))].sort();
    const sel  = document.getElementById('txCategory');
    const cur  = sel?.value || '';
    if (!sel) return;
    sel.innerHTML = `<option value="">Categoría</option>` + cats.map(c => `<option${c===cur?' selected':''}>${Utils.escHtml(c)}</option>`).join('');
  }

  function _renderSummary(txs) {
    const income  = txs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
    const expense = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
    const net     = income - expense;
    document.getElementById('txSummary').innerHTML = `
      <div class="tx-sum-item income"><span>📈 Ingresos</span><span class="amount">+ ${Utils.formatCurrency(income)}</span></div>
      <div class="tx-sum-item expense"><span>📉 Gastos</span><span class="amount">- ${Utils.formatCurrency(expense)}</span></div>
      <div class="tx-sum-item net"><span>${net>=0?'💚':'❤️'} Neto</span><span class="amount ${net>=0?'amount-positive':'amount-negative'}">${net>=0?'+ ':'- '}${Utils.formatCurrency(Math.abs(net))}</span></div>`;
  }

  function _renderList(txs) {
    const el = document.getElementById('txList');
    if (!txs.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">💸</div><h4>Sin transacciones</h4><p>Registra tus ingresos y gastos</p><button class="btn-primary" onclick="Transactions.openModal()">+ Nueva transacción</button></div>`;
      return;
    }

    // Group by date
    const groups = {};
    txs.forEach(t => { const key = t.date || 'Sin fecha'; (groups[key] = groups[key]||[]).push(t); });
    const html = Object.entries(groups).sort((a,b) => b[0].localeCompare(a[0])).map(([date, list]) => `
      <div style="margin-bottom:4px">
        <div style="font-size:12px;font-weight:600;color:var(--text-m);padding:8px 4px">${Utils.formatDate(date)}</div>
        ${list.map(t => _txHtml(t)).join('')}
      </div>`).join('');
    el.innerHTML = html;
  }

  function _txHtml(t) {
    const attach = t.attachments?.length ? `<span class="attach-chip">📎 ${t.attachments.length}</span>` : '';
    const voice  = t.voiceNotes?.length  ? `<span class="attach-chip">🎙️ ${t.voiceNotes.length}</span>` : '';
    const recur  = t.recurring ? `<span class="tag">🔄 Recurrente</span>` : '';
    return `<div class="tx-item" onclick="Transactions.openModal('${t.id}')">
      <div class="tx-icon ${t.type}">${Utils.categoryIcon(t.category)}</div>
      <div class="tx-info">
        <div class="tx-desc tx-desc-editable" id="txdesc-${t.id}"
          ondblclick="event.stopPropagation();Transactions.startInlineEdit('${t.id}')"
          title="Doble clic para renombrar">${Utils.escHtml(t.description)}</div>
        <div class="tx-meta">
          <span class="tag ${t.person}">${Utils.personLabel(t.person)}</span>
          <span class="tag">${Utils.escHtml(t.category)}</span>
          ${recur}${attach}${voice}
          ${t.notes ? '<span class="attach-chip">📝</span>' : ''}
        </div>
      </div>
      <div class="tx-amount ${t.type}">${t.type==='expense'?'- ':'+ '}${Utils.formatCurrency(t.amount)}</div>
      <div class="tx-actions">
        <button class="btn-icon btn-sm" onclick="event.stopPropagation();Transactions.startInlineEdit('${t.id}')" title="Renombrar">✏️</button>
        <button class="btn-icon btn-sm" onclick="event.stopPropagation();Transactions.openModal('${t.id}')" title="Editar todo">⚙️</button>
        <button class="btn-icon btn-sm" onclick="event.stopPropagation();Transactions.delete('${t.id}')" title="Eliminar">🗑️</button>
      </div>
    </div>`;
  }

  function startInlineEdit(id) {
    const el = document.getElementById('txdesc-' + id);
    if (!el) return;
    const current = el.textContent.trim();
    el.classList.add('editing');
    el.innerHTML = `<input class="inline-edit-input" value="${Utils.escHtml(current)}"
      onblur="Transactions.saveInlineEdit('${id}',this.value)"
      onkeydown="if(event.key==='Enter'){this.blur()}if(event.key==='Escape'){Transactions.cancelInlineEdit('${id}','${Utils.escHtml(current)}')}">`;
    const input = el.querySelector('input');
    input.focus();
    input.select();
  }

  function saveInlineEdit(id, value) {
    const desc = value.trim();
    if (!desc) { cancelInlineEdit(id, '?'); return; }
    const tx = State.getTransactions().find(t => t.id === id);
    if (!tx) return;
    tx.description = desc;
    tx.updatedAt   = new Date().toISOString();
    State.saveTransaction(tx);
    const el = document.getElementById('txdesc-' + id);
    if (el) { el.classList.remove('editing'); el.textContent = desc; }
    App.toast('Nombre actualizado', 'success');
  }

  function cancelInlineEdit(id, original) {
    const el = document.getElementById('txdesc-' + id);
    if (el) { el.classList.remove('editing'); el.textContent = original; }
  }

  function openModal(id) {
    _editId = id || null;
    _pendingAttachments = [];
    _pendingVoices      = [];
    const tx = id ? State.getTransactions().find(t => t.id === id) : null;
    const cats = Utils.TX_CATEGORIES;

    // 🔒 Protección de ownership: si el item pertenece al otro perfil, solo lectura + sugerencia
    if (tx && tx.person && tx.person !== 'shared') {
      const me = (typeof Auth !== 'undefined' && Auth.currentProfile && Auth.currentProfile()) || App.getUser();
      if (me && me !== 'shared' && tx.person !== me) {
        const owner = tx.person === 'karen' ? '👩 Karen' : '👨 Miguel';
        App.openModal('🔒 Transacción de ' + owner, `
          <p style="color:var(--text-m);font-size:13px;margin-bottom:14px">
            Esta transacción es de <b>${owner}</b>. Solo el dueño puede editarla.
            Tú puedes enviarle una <b>sugerencia</b> por el chat 💬.
          </p>
          <div class="card" style="background:var(--bg3);padding:14px;margin-bottom:14px">
            <div style="font-weight:700;font-size:15px">${Utils.escHtml(tx.description)}</div>
            <div style="color:var(--text-m);font-size:12px;margin-top:4px">${Utils.formatDate(tx.date)} · ${Utils.escHtml(tx.category||'')}</div>
            <div style="font-size:18px;font-weight:700;color:${tx.type==='income'?'var(--success)':'var(--danger)'};margin-top:6px">
              ${tx.type==='income'?'+':'-'} ${Utils.formatCurrency(tx.amount)}
            </div>
          </div>
          <div class="form-actions">
            <button class="btn-outline" onclick="App.closeModal()">Cerrar</button>
            <button class="btn-primary" onclick="App.closeModal();Chat.sendSuggestion('transaction','${tx.id}')">💡 Sugerir cambio</button>
          </div>`);
        return;
      }
    }

    const html = `
      <div class="radio-group" style="margin-bottom:16px">
        <label class="radio-chip ${!tx||tx.type==='income'?'checked':''}" id="txTypeIncome" onclick="Transactions._setType('income')"><span>📈 Ingreso</span></label>
        <label class="radio-chip ${tx&&tx.type==='expense'?'checked':''}" id="txTypeExpense" onclick="Transactions._setType('expense')"><span>📉 Gasto</span></label>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Descripción *</label>
          <input type="text" id="txDesc" class="form-input" value="${Utils.escHtml(tx?.description||'')}" placeholder="¿En qué?">
        </div>
        <div class="form-group">
          <label class="form-label">Monto (COP) *</label>
          <input type="number" id="txAmount" class="form-input" value="${tx?.amount||''}" placeholder="0" min="0">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Categoría</label>
          <select id="txCat" class="form-select"></select>
        </div>
        <div class="form-group">
          <label class="form-label">Persona</label>
          <select id="txPerson2" class="form-select">
            <option value="karen"  ${(tx?.person || _myProfile())==='karen' ?'selected':''}>👩 Karen</option>
            <option value="miguel" ${(tx?.person || _myProfile())==='miguel'?'selected':''}>👨 Miguel</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Fecha</label>
          <input type="date" id="txDate" class="form-input" value="${tx?.date||Utils.today()}">
        </div>
        <div class="form-group">
          <label class="form-label">Método de pago</label>
          <select id="txMethod" class="form-select">
            ${['Efectivo','Transferencia','Tarjeta débito','Tarjeta crédito','PSE','Nequi','Daviplata','Otro'].map(m=>`<option ${tx?.paymentMethod===m?'selected':''}>${m}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Notas</label>
        <textarea id="txNotes" class="form-textarea" placeholder="Notas adicionales...">${Utils.escHtml(tx?.notes||'')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label" style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="txRecurring" ${tx?.recurring?'checked':''} onchange="Transactions._toggleRecurring()"> Pago recurrente
        </label>
      </div>
      <div id="txRecurringOpts" style="${tx?.recurring?'':'display:none'}">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Frecuencia</label>
            <select id="txRecurInterval" class="form-select">
              <option value="weekly"  ${tx?.recurringInterval==='weekly'?'selected':''}>Semanal</option>
              <option value="monthly" ${tx?.recurringInterval==='monthly'||!tx?.recurringInterval?'selected':''}>Mensual</option>
              <option value="yearly"  ${tx?.recurringInterval==='yearly'?'selected':''}>Anual</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Próximo vencimiento</label>
            <input type="date" id="txNextDue" class="form-input" value="${tx?.nextDue||''}">
          </div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Adjuntos</label>
        <div class="attachment-zone" id="txDropzone" onclick="document.getElementById('txFileInput').click()" ondragover="event.preventDefault();this.classList.add('dragging')" ondragleave="this.classList.remove('dragging')" ondrop="Transactions._onDrop(event)">
          📎 Arrastra archivos o haz clic para adjuntar
        </div>
        <input type="file" id="txFileInput" style="display:none" multiple onchange="Transactions._onFiles(this.files)">
        <div class="attachment-list" id="txAttachList">${(tx?.attachments||[]).map(aid => `<div class="attachment-item" id="att-${aid}"><span class="attachment-icon">📄</span><div class="attachment-info"><div class="attachment-name">Adjunto</div></div><button class="btn-icon btn-sm" onclick="DB.openAttachment('${aid}')">👁️</button></div>`).join('')}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Notas de voz</label>
        <button class="btn-outline" onclick="Transactions._startVoice()">🎙️ Grabar nota de voz</button>
        <div id="txVoiceList">${(tx?.voiceNotes||[]).map(v => `<div class="voice-player"><span>🎙️</span><span style="font-size:12px;color:var(--text-m)">${Utils.formatDateTime(v.savedAt||'')}</span></div>`).join('')}</div>
      </div>
      <div class="form-actions">
        ${id ? `<button class="btn-danger" onclick="Transactions.delete('${id}');App.closeModal()">Eliminar</button>` : ''}
        <button class="btn-outline" onclick="App.closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="Transactions.save()">Guardar</button>
      </div>`;
    App.openModal(id ? 'Editar Transacción' : 'Nueva Transacción', html, { large: true });
    _setType(tx?.type || 'income');
    if (tx?.category) setTimeout(() => { document.getElementById('txCat').value = tx.category; }, 50);
    // Render existing voice players
    if (tx?.voiceNotes?.length) {
      tx.voiceNotes.forEach(v => Voice.renderPlayer(v.id, v.duration, 'txVoiceList'));
    }
  }

  let _txType = 'income';
  function _setType(t) {
    _txType = t;
    document.getElementById('txTypeIncome')?.classList.toggle('checked', t==='income');
    document.getElementById('txTypeExpense')?.classList.toggle('checked', t==='expense');
    const cats = Utils.TX_CATEGORIES[t] || [];
    const sel  = document.getElementById('txCat');
    if (!sel) return;
    const curCat = _editId ? State.getTransactions().find(x=>x.id===_editId)?.category : '';
    sel.innerHTML = cats.map(c => `<option${c===curCat?' selected':''}>${c}</option>`).join('');
  }

  function _toggleRecurring() {
    const show = document.getElementById('txRecurring')?.checked;
    document.getElementById('txRecurringOpts').style.display = show ? '' : 'none';
  }

  function _onFiles(files) {
    Array.from(files).forEach(f => {
      const id = Utils.uuid();
      _pendingAttachments.push({ file: f, id });
      const list = document.getElementById('txAttachList');
      const item = document.createElement('div');
      item.className = 'attachment-item'; item.id = 'att-' + id;
      item.innerHTML = `<span class="attachment-icon">${Utils.fileIcon(f.type)}</span>
        <div class="attachment-info"><div class="attachment-name">${Utils.escHtml(f.name)}</div><div class="attachment-size">${Utils.fileSize(f.size)}</div></div>
        <button class="attachment-remove" onclick="Transactions._removeAttach('${id}')">✕</button>`;
      list?.appendChild(item);
    });
    document.getElementById('txDropzone').classList.remove('dragging');
  }

  function _onDrop(e) {
    e.preventDefault();
    _onFiles(e.dataTransfer.files);
  }

  function _removeAttach(id) {
    _pendingAttachments = _pendingAttachments.filter(a => a.id !== id);
    document.getElementById('att-' + id)?.remove();
  }

  function _startVoice() {
    App.closeModal();
    setTimeout(() => {
      Voice.start((id, duration) => {
        _pendingVoices.push({ id, duration, savedAt: new Date().toISOString() });
        openModal(_editId);
      });
    }, 200);
  }

  async function save() {
    const desc   = document.getElementById('txDesc')?.value.trim();
    const amount = parseFloat(document.getElementById('txAmount')?.value);
    if (!desc || !amount) { App.toast('Completa descripción y monto', 'warning'); return; }

    // Save attachments to IndexedDB
    const attIds = [];
    for (const { file, id } of _pendingAttachments) {
      await DB.saveAttachment(id, file);
      attIds.push(id);
    }

    const existing = _editId ? State.getTransactions().find(t=>t.id===_editId) : null;
    const tx = {
      id:               _editId || Utils.uuid(),
      type:             _txType,
      description:      desc,
      amount,
      category:         document.getElementById('txCat')?.value      || 'Otros',
      person:           document.getElementById('txPerson2')?.value  || _myProfile(),
      date:             document.getElementById('txDate')?.value      || Utils.today(),
      paymentMethod:    document.getElementById('txMethod')?.value    || 'Efectivo',
      notes:            document.getElementById('txNotes')?.value     || '',
      recurring:        document.getElementById('txRecurring')?.checked || false,
      recurringInterval: document.getElementById('txRecurInterval')?.value || 'monthly',
      nextDue:          document.getElementById('txNextDue')?.value   || '',
      attachments:      [...(existing?.attachments||[]), ...attIds],
      voiceNotes:       [...(existing?.voiceNotes||[]), ..._pendingVoices],
      tags:             existing?.tags || [],
      createdAt:        existing?.createdAt || new Date().toISOString(),
      updatedAt:        new Date().toISOString()
    };
    State.saveTransaction(tx);
    App.closeModal();
    App.toast(_editId ? 'Transacción actualizada' : 'Transacción guardada', 'success');
    filter();
    Dashboard.render();
  }

  function _delete(id) {
    if (!confirm('¿Eliminar esta transacción?')) return;
    State.deleteTransaction(id);
    App.toast('Transacción eliminada', 'info');
    filter();
  }

  return { filter, openModal, save, delete: _delete, _setType, _toggleRecurring, _onFiles, _onDrop, _removeAttach, _startVoice };
})();
