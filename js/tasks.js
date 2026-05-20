const Tasks = (() => {
  function render() {
    const lists = State.getTaskLists();
    const el    = document.getElementById('taskLists');
    if (!lists.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><h4>Sin listas de tareas</h4><p>Crea tu primera lista para organizarte</p><button class="btn-primary" onclick="Tasks.openListModal()">+ Nueva Lista</button></div>`;
      return;
    }
    el.innerHTML = lists.map(tl => _listHtml(tl)).join('');
  }

  function _listHtml(tl) {
    const total = (tl.tasks||[]).length;
    const done  = (tl.tasks||[]).filter(t=>t.done).length;
    const pct   = total > 0 ? Math.round((done/total)*100) : 0;
    return `
      <div class="task-list-card" id="tl-${tl.id}">
        <div class="task-list-header">
          <div class="task-list-title">
            <span>${tl.icon||'📋'}</span>
            <span style="color:${tl.color||'var(--primary-l)'}">${Utils.escHtml(tl.title)}</span>
            <span class="task-progress">${done}/${total}</span>
          </div>
          <div class="task-list-actions">
            <button class="btn-icon btn-sm" onclick="Tasks.openListModal('${tl.id}')" title="Editar lista">✏️</button>
            <button class="btn-icon btn-sm" onclick="Tasks.deleteList('${tl.id}')" title="Eliminar lista">🗑️</button>
          </div>
        </div>
        ${total > 0 ? `<div style="height:4px;background:var(--bg3);border-radius:2px;margin-bottom:10px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${tl.color||'var(--primary)'};border-radius:2px;transition:width 0.4s"></div></div>` : ''}
        <div id="tasks-${tl.id}">
          ${(tl.tasks||[]).map(t => _taskHtml(tl.id, t)).join('')}
        </div>
        <div class="task-add-inline">
          <div class="task-check"></div>
          <input class="task-add-input" id="addTask-${tl.id}" placeholder="+ Agregar tarea..." onkeydown="if(event.key==='Enter') Tasks.addTask('${tl.id}')">
          <button class="btn-icon btn-sm" onclick="Tasks.addTask('${tl.id}')">↵</button>
        </div>
      </div>`;
  }

  function _taskHtml(listId, t) {
    const overdue = t.dueDate && !t.done && Utils.daysUntil(t.dueDate) < 0;
    return `
      <div class="task-item" id="task-${t.id}">
        <div class="priority-dot ${t.priority||'medium'}"></div>
        <div class="task-check ${t.done?'done':''}" onclick="Tasks.toggleTask('${listId}','${t.id}')"></div>
        <div class="task-info" style="flex:1;min-width:0">
          <div class="task-text ${t.done?'done':''}">${Utils.escHtml(t.text)}</div>
          <div class="task-meta">
            ${t.dueDate ? `<span class="task-due ${overdue?'overdue':''}">📅 ${Utils.formatDateShort(t.dueDate)}${overdue?' (Vencida)':''}</span>` : ''}
            ${t.assignedTo ? `<span class="tag ${t.assignedTo}">${Utils.personLabel(t.assignedTo)}</span>` : ''}
          </div>
        </div>
        <div class="task-item-actions">
          <button class="btn-icon btn-sm" onclick="Tasks.editTask('${listId}','${t.id}')" title="Editar">✏️</button>
          <button class="btn-icon btn-sm" onclick="Tasks.deleteTask('${listId}','${t.id}')" title="Eliminar">🗑️</button>
        </div>
      </div>`;
  }

  function addTask(listId) {
    const input = document.getElementById('addTask-' + listId);
    const text  = input?.value.trim();
    if (!text) return;
    const lists = State.getTaskLists();
    const tl    = lists.find(l=>l.id===listId);
    if (!tl) return;
    const task = {
      id: Utils.uuid(), text, done: false,
      priority: 'medium', assignedTo: App.getUser() === 'shared' ? '' : App.getUser(),
      dueDate: '', notes: '', createdAt: new Date().toISOString()
    };
    tl.tasks = [...(tl.tasks||[]), task];
    State.saveTaskList(tl);
    input.value = '';
    document.getElementById('tasks-' + listId).innerHTML = tl.tasks.map(t => _taskHtml(listId, t)).join('');
    // Refresh header
    const titleEl = document.querySelector(`#tl-${listId} .task-progress`);
    const done = tl.tasks.filter(t=>t.done).length;
    if (titleEl) titleEl.textContent = `${done}/${tl.tasks.length}`;
  }

  function toggleTask(listId, taskId) {
    const lists = State.getTaskLists();
    const tl    = lists.find(l=>l.id===listId);
    if (!tl) return;
    const task  = (tl.tasks||[]).find(t=>t.id===taskId);
    if (!task) return;
    task.done = !task.done;
    State.saveTaskList(tl);
    render();
  }

  function editTask(listId, taskId) {
    const lists = State.getTaskLists();
    const tl    = lists.find(l=>l.id===listId);
    const task  = (tl?.tasks||[]).find(t=>t.id===taskId);
    if (!task) return;
    const html = `
      <div class="form-group">
        <label class="form-label">Tarea *</label>
        <input type="text" id="etText" class="form-input" value="${Utils.escHtml(task.text)}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Prioridad</label>
          <select id="etPriority" class="form-select">
            <option value="low"    ${task.priority==='low'?'selected':''}>🟢 Baja</option>
            <option value="medium" ${(task.priority||'medium')==='medium'?'selected':''}>🟡 Media</option>
            <option value="high"   ${task.priority==='high'?'selected':''}>🔴 Alta</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Asignada a</label>
          <select id="etAssigned" class="form-select">
            <option value="">Sin asignar</option>
            <option value="karen"  ${task.assignedTo==='karen'?'selected':''}>👩 Karen</option>
            <option value="miguel" ${task.assignedTo==='miguel'?'selected':''}>👨 Miguel</option>
            <option value="shared" ${task.assignedTo==='shared'?'selected':''}>🏠 Ambos</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha Límite</label>
        <input type="date" id="etDue" class="form-input" value="${task.dueDate||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Notas</label>
        <textarea id="etNotes" class="form-textarea" placeholder="Detalles...">${Utils.escHtml(task.notes||'')}</textarea>
      </div>
      <div class="form-actions">
        <button class="btn-outline" onclick="App.closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="Tasks._saveTask('${listId}','${taskId}')">Guardar</button>
      </div>`;
    App.openModal('Editar Tarea', html);
  }

  function _saveTask(listId, taskId) {
    const text = document.getElementById('etText')?.value.trim();
    if (!text) { App.toast('La tarea no puede estar vacía','warning'); return; }
    const lists = State.getTaskLists();
    const tl    = lists.find(l=>l.id===listId);
    if (!tl) return;
    const idx = (tl.tasks||[]).findIndex(t=>t.id===taskId);
    if (idx < 0) return;
    tl.tasks[idx] = {
      ...tl.tasks[idx], text,
      priority:   document.getElementById('etPriority')?.value  || 'medium',
      assignedTo: document.getElementById('etAssigned')?.value  || '',
      dueDate:    document.getElementById('etDue')?.value        || '',
      notes:      document.getElementById('etNotes')?.value      || '',
      updatedAt:  new Date().toISOString()
    };
    State.saveTaskList(tl);
    App.closeModal();
    render();
    App.toast('Tarea actualizada','success');
  }

  function deleteTask(listId, taskId) {
    const lists = State.getTaskLists();
    const tl    = lists.find(l=>l.id===listId);
    if (!tl) return;
    tl.tasks = (tl.tasks||[]).filter(t=>t.id!==taskId);
    State.saveTaskList(tl);
    render();
  }

  function openListModal(id) {
    const tl = id ? State.getTaskLists().find(x=>x.id===id) : null;
    const icons = ['📋','✅','🏠','💼','🎯','🛒','📚','🏋️','🎁','🌟','🔧','💊'];
    const html = `
      <div class="form-group">
        <label class="form-label">Nombre de la Lista *</label>
        <input type="text" id="tlTitle" class="form-input" value="${Utils.escHtml(tl?.title||'')}" placeholder="Ej: Compras del mes">
      </div>
      <div class="form-group">
        <label class="form-label">Ícono</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${icons.map(ic=>`<button class="btn-icon" style="font-size:20px;${tl?.icon===ic?'border-color:var(--primary)':''}" onclick="Tasks._setListIcon(this,'${ic}')">${ic}</button>`).join('')}
        </div>
        <input type="hidden" id="tlIcon" value="${tl?.icon||'📋'}">
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div class="color-row">
          ${Utils.COLORS.map(c=>`<div class="color-chip${tl?.color===c?' selected':''}" style="background:${c}" onclick="Tasks._setListColor(this,'${c}')"></div>`).join('')}
          <input type="hidden" id="tlColor" value="${tl?.color||Utils.COLORS[0]}">
        </div>
      </div>
      <div class="form-actions">
        ${id?`<button class="btn-danger" onclick="Tasks.deleteList('${id}');App.closeModal()">Eliminar</button>`:''}
        <button class="btn-outline" onclick="App.closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="Tasks.saveList('${id||''}')">Guardar</button>
      </div>`;
    App.openModal(id?'Editar Lista':'Nueva Lista de Tareas', html);
  }

  function _setListIcon(btn, icon) {
    document.querySelectorAll('[onclick*="_setListIcon"]').forEach(b => b.style.borderColor = '');
    btn.style.borderColor = 'var(--primary)';
    document.getElementById('tlIcon').value = icon;
  }

  function _setListColor(el, color) {
    document.querySelectorAll('#modal .color-chip').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    document.getElementById('tlColor').value = color;
  }

  function saveList(id) {
    const title = document.getElementById('tlTitle')?.value.trim();
    if (!title) { App.toast('Ingresa un nombre','warning'); return; }
    const existing = id ? State.getTaskLists().find(x=>x.id===id) : null;
    const tl = {
      id:    id || Utils.uuid(),
      title,
      icon:  document.getElementById('tlIcon')?.value  || '📋',
      color: document.getElementById('tlColor')?.value || Utils.COLORS[0],
      tasks: existing?.tasks || [],
      createdAt: existing?.createdAt || new Date().toISOString()
    };
    State.saveTaskList(tl);
    App.closeModal();
    App.toast(id?'Lista actualizada':'Lista creada','success');
    render();
  }

  function deleteList(id) {
    if (!confirm('¿Eliminar esta lista y todas sus tareas?')) return;
    State.deleteTaskList(id);
    App.toast('Lista eliminada','info');
    render();
  }

  return { render, addTask, toggleTask, editTask, _saveTask, deleteTask, openListModal, saveList, deleteList, _setListIcon, _setListColor };
})();
