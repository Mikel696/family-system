const Payments = (() => {
  /* Portales de pago para Soacha, Cundinamarca.
     Las tarjetas de Energía/Gas/Agua corresponden a los operadores que prestan
     el servicio en Soacha. Puedes ajustar cualquier URL en "Mis Servicios". */
  const PORTALS = [
    { name:'Enel Colombia',     icon:'⚡', desc:'Energía eléctrica',        url:'https://www.enel.com.co/es/personas.html',                          color:'#F97316' },
    { name:'Vanti',             icon:'🔥', desc:'Gas natural domiciliario', url:'https://www.grupovanti.com/',                                       color:'#6366F1' },
    { name:'Acueducto Soacha',  icon:'💧', desc:'Agua y alcantarillado',    url:'https://www.google.com/search?q=pago+factura+acueducto+Soacha',     color:'#14B8A6' },
    { name:'Aseo Soacha',       icon:'🗑️', desc:'Recolección de basuras',   url:'https://www.google.com/search?q=pago+factura+aseo+Soacha',          color:'#84CC16' },
    { name:'Alcaldía de Soacha',icon:'🏛️', desc:'Impuesto predial',         url:'https://www.google.com/search?q=impuesto+predial+Soacha+en+linea',  color:'#0EA5E9' },
    { name:'Claro',             icon:'📱', desc:'Móvil · Internet · TV',    url:'https://www.claro.com.co/personas/servicios/paga-tu-factura/',      color:'#EF4444' },
    { name:'Movistar',          icon:'🔵', desc:'Móvil · Internet',         url:'https://www.movistar.co/',                                          color:'#3B82F6' },
    { name:'Tigo',              icon:'📡', desc:'Móvil · Internet',         url:'https://www.tigo.com.co/',                                          color:'#F59E0B' },
    { name:'ETB',               icon:'☎️', desc:'Internet · Telefonía',     url:'https://www.etb.com/',                                              color:'#8B5CF6' },
    { name:'WOM',               icon:'📲', desc:'Telefonía móvil',          url:'https://www.wom.co/',                                               color:'#A855F7' },
    { name:'PSE',               icon:'🏦', desc:'Pagos en línea',           url:'https://www.pse.com.co/',                                           color:'#EC4899' },
    { name:'Nequi',             icon:'💜', desc:'Billetera digital',        url:'https://www.nequi.com.co/',                                         color:'#7C3AED' },
    { name:'Daviplata',         icon:'🔴', desc:'Billetera digital',        url:'https://www.daviplata.com/',                                        color:'#DC2626' },
    { name:'Bancolombia',       icon:'🏧', desc:'Banca virtual',            url:'https://www.bancolombia.com/personas',                              color:'#F59E0B' }
  ];

  // Pending attachments for service payment modal
  let _spAttachments = [];

  function render() {
    _renderPortals();
    _renderServices();
  }

  /* ---- Portals grid (hardcoded, click = open URL directly) ---- */
  function _renderPortals() {
    document.getElementById('paymentPortals').innerHTML = `
      <div class="payment-portals-grid">
        ${PORTALS.map(p => {
          // Check if user has a custom service overriding this portal's URL
          const saved = State.getPaymentServices().find(s => s.name.toLowerCase() === p.name.toLowerCase());
          const href  = saved?.url || p.url;
          return `
          <div class="portal-card" style="border-top:3px solid ${p.color}"
            onclick="Payments.goPortal('${encodeURIComponent(href)}','${Utils.escHtml(p.name)}')">
            <div class="portal-icon">${p.icon}</div>
            <div class="portal-name">${Utils.escHtml(p.name)}</div>
            <div class="portal-desc">${Utils.escHtml(p.desc)}</div>
            ${saved ? '<div style="font-size:10px;margin-top:4px;color:var(--success)">✓ Configurado</div>' : ''}
          </div>`;
        }).join('')}
      </div>`;
  }

  /* Open URL directly, then show "¿Registrar pago?" prompt */
  function goPortal(encodedUrl, name) {
    const url = decodeURIComponent(encodedUrl);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => _promptRegister(name), 800);
  }

  function _promptRegister(name) {
    _spAttachments = [];
    App.openModal(`✅ Registrar pago — ${name}`, `
      <p style="font-size:13px;color:var(--text-m);margin-bottom:14px">
        ¿Deseas registrar el pago de <b>${Utils.escHtml(name)}</b> en tus transacciones?
      </p>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Monto pagado *</label>
          <input type="number" id="prAmount" class="form-input" placeholder="0" min="0" autofocus>
        </div>
        <div class="form-group">
          <label class="form-label">Fecha</label>
          <input type="date" id="prDate" class="form-input" value="${Utils.today()}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Comprobante / Adjunto</label>
        <div class="attachment-zone" onclick="document.getElementById('prFileInput').click()"
          ondragover="event.preventDefault()" ondrop="Payments._spOnDrop(event,'pr')">
          📎 Adjunta tu comprobante de pago (captura, PDF...)
        </div>
        <input type="file" id="prFileInput" style="display:none" multiple
          onchange="Payments._spOnFiles(this.files,'pr')">
        <div class="attachment-list" id="prAttachList"></div>
      </div>
      <div class="form-actions">
        <button class="btn-outline" onclick="App.closeModal()">No registrar</button>
        <button class="btn-primary" onclick="Payments._savePromptPayment('${Utils.escHtml(name)}')">Registrar 💾</button>
      </div>`);
  }

  async function _savePromptPayment(name) {
    const amount = parseFloat(document.getElementById('prAmount')?.value);
    const date   = document.getElementById('prDate')?.value || Utils.today();
    if (!amount) { App.toast('Ingresa el monto', 'warning'); return; }
    const attIds = [];
    for (const { file, id } of _spAttachments) { await DB.saveAttachment(id, file); attIds.push(id); }
    State.saveTransaction({
      id: Utils.uuid(), type: 'expense', description: 'Pago ' + name,
      amount, category: 'Servicios', person: 'shared',
      date, paymentMethod: 'PSE', notes: '',
      recurring: false, tags: [], attachments: attIds, voiceNotes: [],
      createdAt: new Date().toISOString()
    });
    _spAttachments = [];
    App.closeModal();
    App.toast('Pago registrado ✓', 'success');
    Alerts.check();
    _refreshUI();
  }

  /* ---- Custom services list ---- */
  function _renderServices() {
    const services = State.getPaymentServices();
    const el = document.getElementById('paymentsList');
    if (!services.length) {
      el.innerHTML = `<div class="empty-state">
        <div class="empty-icon">⚡</div>
        <h4>Sin servicios configurados</h4>
        <p>Agrega tus servicios recurrentes con nombre, monto y URL para acceder con un clic</p>
      </div>`;
      return;
    }
    el.innerHTML = services.map(s => {
      const days   = s.dueDay ? _daysUntilDay(s.dueDay) : null;
      const urgent = days !== null && days <= 5;
      return `
        <div class="payment-service-item" onclick="${s.url ? `Payments.openService('${s.id}')` : `Payments.openModal('${s.id}')`}">
          <span class="payment-service-icon">${s.icon || '💡'}</span>
          <div class="payment-service-info">
            <div class="payment-service-name">${Utils.escHtml(s.name)}</div>
            <div class="payment-service-meta">
              ${s.provider ? `${Utils.escHtml(s.provider)} · ` : ''}
              ${s.dueDay ? `Día ${s.dueDay} ` : ''}
              ${days !== null ? `<span style="color:${urgent ? 'var(--danger)' : 'var(--text-m)'}">
                ${days < 0 ? '⚠️ Vencido' : days === 0 ? '⚠️ Hoy' : urgent ? '⚡ En ' + days + 'd' : '· En ' + days + 'd'}
              </span>` : ''}
              ${s.url ? `<span style="color:var(--success);font-size:11px">· 🔗 Configurado</span>` : ''}
            </div>
          </div>
          <div class="payment-service-amount">${s.amount ? Utils.formatCurrency(s.amount) : '—'}</div>
          <div class="payment-service-actions" onclick="event.stopPropagation()">
            <button class="btn-outline btn-sm" onclick="Payments.payService('${s.id}')">Pagar</button>
            <button class="btn-icon btn-sm" onclick="Payments.openModal('${s.id}')">✏️</button>
            <button class="btn-icon btn-sm" onclick="Payments.delete('${s.id}')">🗑️</button>
          </div>
        </div>`;
    }).join('');
  }

  /* Open service URL directly (since user already saved it) */
  function openService(id) {
    const s = State.getPaymentServices().find(x => x.id === id);
    if (!s?.url) return;
    window.open(s.url, '_blank', 'noopener');
    setTimeout(() => _promptRegisterService(s), 800);
  }

  function _promptRegisterService(s) {
    _spAttachments = [];
    App.openModal(`✅ Registrar pago — ${s.name}`, `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Monto pagado *</label>
          <input type="number" id="srAmount" class="form-input" value="${s.amount || ''}" placeholder="0" min="0" autofocus>
        </div>
        <div class="form-group">
          <label class="form-label">Fecha</label>
          <input type="date" id="srDate" class="form-input" value="${Utils.today()}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Comprobante</label>
        <div class="attachment-zone" onclick="document.getElementById('srFileInput').click()"
          ondragover="event.preventDefault()" ondrop="Payments._spOnDrop(event,'sr')">
          📎 Adjunta tu comprobante (captura, PDF...)
        </div>
        <input type="file" id="srFileInput" style="display:none" multiple
          onchange="Payments._spOnFiles(this.files,'sr')">
        <div class="attachment-list" id="srAttachList"></div>
      </div>
      <div class="form-actions">
        <button class="btn-outline" onclick="App.closeModal()">No registrar</button>
        <button class="btn-primary" onclick="Payments._saveServiceRecord('${s.id}')">Registrar 💾</button>
      </div>`);
  }

  async function _saveServiceRecord(id) {
    const s      = State.getPaymentServices().find(x => x.id === id);
    const amount = parseFloat(document.getElementById('srAmount')?.value);
    const date   = document.getElementById('srDate')?.value || Utils.today();
    if (!amount) { App.toast('Ingresa el monto', 'warning'); return; }
    const attIds = [];
    for (const { file, aid } of _spAttachments) { await DB.saveAttachment(aid, file); attIds.push(aid); }
    State.saveTransaction({
      id: Utils.uuid(), type: 'expense', description: 'Pago ' + s.name,
      amount, category: s.category || 'Servicios', person: 'shared',
      date, paymentMethod: 'PSE', notes: '',
      recurring: false, tags: [], attachments: attIds, voiceNotes: [],
      createdAt: new Date().toISOString()
    });
    _spAttachments = [];
    App.closeModal();
    App.toast('Pago registrado ✓', 'success');
    Alerts.check();
    _refreshUI();
  }

  /* Refresca dashboard + lista de transacciones tras registrar un pago */
  function _refreshUI() {
    try { if (typeof Dashboard    !== 'undefined') Dashboard.render(); } catch(e) {}
    try { if (typeof Transactions !== 'undefined') Transactions.filter(); } catch(e) {}
    try { render(); } catch(e) {}
  }

  /* ---- Attachment helpers shared between prompts ---- */
  function _spOnFiles(files, prefix) {
    Array.from(files).forEach(f => {
      const id   = Utils.uuid();
      _spAttachments.push({ file: f, id });
      const list = document.getElementById(prefix + 'AttachList');
      const item = document.createElement('div');
      item.className = 'attachment-item'; item.id = prefix + 'att-' + id;
      item.innerHTML = `<span class="attachment-icon">${Utils.fileIcon(f.type)}</span>
        <div class="attachment-info">
          <div class="attachment-name">${Utils.escHtml(f.name)}</div>
          <div class="attachment-size">${Utils.fileSize(f.size)}</div>
        </div>
        <button class="attachment-remove" onclick="Payments._spRemove('${id}','${prefix}')">✕</button>`;
      list?.appendChild(item);
    });
  }
  function _spOnDrop(e, prefix) {
    e.preventDefault();
    _spOnFiles(e.dataTransfer.files, prefix);
  }
  function _spRemove(id, prefix) {
    _spAttachments = _spAttachments.filter(a => a.id !== id);
    document.getElementById(prefix + 'att-' + id)?.remove();
  }

  /* ---- Pay service (manual) ---- */
  function payService(id) {
    const s = State.getPaymentServices().find(x => x.id === id);
    if (!s) return;
    if (s.url) { openService(id); }
    else { _promptRegisterService(s); }
  }

  /* ---- Add/Edit service modal ---- */
  function openModal(id) {
    const s = id ? State.getPaymentServices().find(x => x.id === id) : null;
    const icons = ['💡','💧','🔥','📱','📡','☎️','🏠','🔒','🌐','🏦','🛡️','📺','🚰','🔋'];
    const html = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Nombre del Servicio *</label>
          <input type="text" id="psName" class="form-input"
            value="${Utils.escHtml(s?.name || '')}" placeholder="Ej: Energía, Internet, Arriendo">
        </div>
        <div class="form-group">
          <label class="form-label">Proveedor / Entidad</label>
          <input type="text" id="psProvider" class="form-input"
            value="${Utils.escHtml(s?.provider || '')}" placeholder="Ej: EPM, Claro, Banco">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Monto Aproximado (COP)</label>
          <input type="number" id="psAmount" class="form-input"
            value="${s?.amount || ''}" placeholder="0" min="0">
        </div>
        <div class="form-group">
          <label class="form-label">Día de Vencimiento (1-31)</label>
          <input type="number" id="psDueDay" class="form-input"
            value="${s?.dueDay || ''}" placeholder="Ej: 15" min="1" max="31">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">🔗 URL del Portal de Pago</label>
        <input type="url" id="psUrl" class="form-input"
          value="${Utils.escHtml(s?.url || '')}" placeholder="https://... (guardado → clic abre directamente)">
        <div style="font-size:11px;color:var(--text-m);margin-top:4px">
          Una vez guardada la URL, el clic en la tarjeta abrirá el portal directamente.
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Ícono</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px" id="psIconPicker">
          ${icons.map(ic => `
            <button class="btn-icon" style="font-size:20px;${s?.icon===ic?'border-color:var(--primary);background:rgba(139,92,246,0.15)':''}"
              onclick="Payments._setIcon(this,'${ic}')">${ic}</button>`).join('')}
        </div>
        <input type="hidden" id="psIcon" value="${s?.icon || '💡'}">
      </div>
      <div class="form-group">
        <label class="form-label">Categoría de Gasto</label>
        <select id="psCat" class="form-select">
          ${['Servicios','Electricidad','Gas','Agua','Internet','Telefono','Seguro','Arriendo','Educación','Salud','Otros']
            .map(c => `<option${s?.category===c?' selected':''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-actions">
        ${id ? `<button class="btn-danger" onclick="Payments.delete('${id}');App.closeModal()">Eliminar</button>` : ''}
        <button class="btn-outline" onclick="App.closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="Payments.save('${id || ''}')">Guardar</button>
      </div>`;
    App.openModal(id ? 'Editar Servicio' : 'Agregar Servicio', html);
  }

  function _setIcon(btn, icon) {
    document.querySelectorAll('#psIconPicker .btn-icon').forEach(b => {
      b.style.borderColor = ''; b.style.background = '';
    });
    btn.style.borderColor = 'var(--primary)';
    btn.style.background  = 'rgba(139,92,246,0.15)';
    document.getElementById('psIcon').value = icon;
  }

  function save(id) {
    const name = document.getElementById('psName')?.value.trim();
    if (!name) { App.toast('Ingresa el nombre del servicio', 'warning'); return; }
    const existing = id ? State.getPaymentServices().find(x => x.id === id) : null;
    const ps = {
      id:       id || Utils.uuid(),
      name,
      provider: document.getElementById('psProvider')?.value || '',
      amount:   parseFloat(document.getElementById('psAmount')?.value)  || 0,
      dueDay:   parseInt(document.getElementById('psDueDay')?.value)     || 0,
      url:      document.getElementById('psUrl')?.value.trim()           || '',
      icon:     document.getElementById('psIcon')?.value                 || '💡',
      category: document.getElementById('psCat')?.value                  || 'Servicios',
      createdAt: existing?.createdAt || new Date().toISOString()
    };
    State.savePaymentService(ps);
    App.closeModal();
    App.toast(id ? 'Servicio actualizado' : 'Servicio guardado — clic en la tarjeta abrirá el portal', 'success');
    render();
  }

  function _daysUntilDay(day) {
    const now = new Date();
    let due   = new Date(now.getFullYear(), now.getMonth(), day);
    if (due <= now) due.setMonth(due.getMonth() + 1);
    return Math.ceil((due - now) / 86400000);
  }

  function _delete(id) {
    if (!confirm('¿Eliminar este servicio?')) return;
    State.deletePaymentService(id);
    App.toast('Servicio eliminado', 'info');
    render();
  }

  return {
    render, goPortal, openService, payService, openModal, save, delete: _delete,
    _setIcon, _spOnFiles, _spOnDrop, _spRemove,
    _savePromptPayment, _saveServiceRecord, _promptRegister
  };
})();
