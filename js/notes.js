const Notes = (() => {
  let _editId = null;
  let _pendingAttachments = [];
  let _pendingVoices      = [];
  let _activeTag = '';

  function render() {
    const notes = State.getNotes().sort((a,b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.updatedAt||b.createdAt) - new Date(a.updatedAt||a.createdAt);
    });
    _renderTagsFilter(notes);
    _renderNotes(notes);
  }

  function _renderTagsFilter(notes) {
    const allTags = [...new Set(notes.flatMap(n => n.tags||[]))].sort();
    document.getElementById('notesTagsFilter').innerHTML = [
      `<span class="tag-filter${!_activeTag?' active':''}" onclick="Notes._setTag('')">Todas</span>`,
      ...allTags.map(t => `<span class="tag-filter${_activeTag===t?' active':''}" onclick="Notes._setTag('${Utils.escHtml(t)}')">${Utils.escHtml(t)}</span>`)
    ].join('');
  }

  function _setTag(t) {
    _activeTag = t;
    render();
  }

  function filter() {
    const search = (document.getElementById('notesSearch')?.value || '').toLowerCase();
    const notes  = State.getNotes().filter(n => {
      if (_activeTag && !(n.tags||[]).includes(_activeTag)) return false;
      if (!search) return true;
      return (n.title||'').toLowerCase().includes(search) || Utils.stripHtml(n.content||'').toLowerCase().includes(search);
    }).sort((a,b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.updatedAt||b.createdAt) - new Date(a.updatedAt||a.createdAt);
    });
    _renderTagsFilter(State.getNotes());
    _renderNotes(notes);
  }

  function _renderNotes(notes) {
    const el = document.getElementById('notesList');
    if (!notes.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">📝</div><h4>Sin notas</h4><p>Crea tu primera nota</p><button class="btn-primary" onclick="Notes.openModal()">+ Nueva Nota</button></div>`;
      return;
    }
    el.innerHTML = notes.map(n => {
      const preview = Utils.stripHtml(n.content||'').substring(0, 150);
      const attachCount = (n.attachments||[]).length;
      const voiceCount  = (n.voiceNotes||[]).length;
      const linkCount   = (n.links||[]).length;
      return `
        <div class="note-card${n.pinned?' pinned':''}" style="${n.color?'border-top:3px solid '+n.color:''}" onclick="Notes.openModal('${n.id}')">
          ${n.pinned ? '<div class="note-pin">📌</div>' : ''}
          <div class="note-title">${Utils.escHtml(n.title||'Sin título')}</div>
          ${preview ? `<div class="note-preview">${Utils.escHtml(preview)}</div>` : ''}
          ${(attachCount||voiceCount||linkCount) ? `<div class="note-attachments">
            ${attachCount ? `<span class="attach-chip">📎 ${attachCount}</span>` : ''}
            ${voiceCount  ? `<span class="attach-chip">🎙️ ${voiceCount}</span>`  : ''}
            ${linkCount   ? `<span class="attach-chip">🔗 ${linkCount}</span>`   : ''}
          </div>` : ''}
          <div class="note-footer">
            <div class="note-tags">${(n.tags||[]).slice(0,3).map(t=>`<span class="tag">${Utils.escHtml(t)}</span>`).join('')}</div>
            <span class="note-date">${Utils.formatDateShort(n.updatedAt||n.createdAt)}</span>
          </div>
        </div>`;
    }).join('');
  }

  function openModal(id) {
    _editId = id || null;
    _pendingAttachments = [];
    _pendingVoices      = [];
    const n = id ? State.getNotes().find(x=>x.id===id) : null;
    const colors = ['','#8B5CF6','#EC4899','#10B981','#3B82F6','#F59E0B','#EF4444','#14B8A6'];

    const html = `
      <div class="form-group">
        <label class="form-label">Título</label>
        <input type="text" id="nTitle" class="form-input" value="${Utils.escHtml(n?.title||'')}" placeholder="Título de la nota">
      </div>
      <div class="form-group">
        <label class="form-label">Contenido</label>
        <div class="rte-toolbar">
          <button class="rte-btn" onclick="Notes._fmt('bold')" title="Negrita"><b>B</b></button>
          <button class="rte-btn" onclick="Notes._fmt('italic')" title="Cursiva"><i>I</i></button>
          <button class="rte-btn" onclick="Notes._fmt('underline')" title="Subrayado"><u>U</u></button>
          <button class="rte-btn" onclick="Notes._fmt('insertUnorderedList')">• Lista</button>
          <button class="rte-btn" onclick="Notes._fmt('insertOrderedList')">1. Lista</button>
          <button class="rte-btn" onclick="Notes._fmt('formatBlock','<h3>')">H3</button>
          <button class="rte-btn" onclick="Notes._insertLink()">🔗</button>
          <button class="rte-btn" onclick="Notes._fmt('removeFormat')">✕ Formato</button>
        </div>
        <div class="rte-content" id="nContent" contenteditable="true">${n?.content||''}</div>
      </div>
      <div class="form-group">
        <label class="form-label">Etiquetas (separadas por coma)</label>
        <input type="text" id="nTags" class="form-input" value="${(n?.tags||[]).join(', ')}" placeholder="Ej: trabajo, importante, hogar">
      </div>
      <div class="form-group">
        <label class="form-label">Links</label>
        <div id="nLinksList">
          ${(n?.links||[]).map((l,i)=>`<div style="display:flex;gap:6px;margin-bottom:6px"><input type="url" class="form-input" value="${Utils.escHtml(l)}" id="nLink${i}"><button class="btn-icon btn-sm" onclick="this.parentElement.remove()">✕</button></div>`).join('')}
        </div>
        <button class="btn-outline btn-sm" onclick="Notes._addLink()">+ Agregar Link</button>
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          ${colors.map(c=>`<div style="width:24px;height:24px;border-radius:50%;background:${c||'var(--bg3)'};border:2px solid ${c===n?.color||(!c&&!n?.color)?'#fff':'transparent'};cursor:pointer" onclick="Notes._setColor('${c}','${id||''}')"></div>`).join('')}
        </div>
        <input type="hidden" id="nColor" value="${n?.color||''}">
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="nPinned" ${n?.pinned?'checked':''}> 📌 Fijar nota
        </label>
      </div>
      <div class="form-group">
        <label class="form-label">Adjuntos</label>
        <div class="attachment-zone" onclick="document.getElementById('nFileInput').click()" ondragover="event.preventDefault()" ondrop="Notes._onDrop(event)">
          📎 Arrastra o haz clic para adjuntar archivos, PDFs, imágenes...
        </div>
        <input type="file" id="nFileInput" style="display:none" multiple onchange="Notes._onFiles(this.files)">
        <div class="attachment-list" id="nAttachList">
          ${(n?.attachments||[]).map(aid=>`<div class="attachment-item"><span class="attachment-icon">📄</span><div class="attachment-info"><div class="attachment-name">Archivo adjunto</div></div><button class="btn-icon btn-sm" onclick="DB.openAttachment('${aid}')">👁️</button><button class="btn-icon btn-sm" onclick="DB.downloadAttachment('${aid}')">📥</button></div>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Notas de Voz</label>
        <button class="btn-outline" onclick="Notes._startVoice()">🎙️ Grabar nota de voz</button>
        <div id="nVoiceList"></div>
      </div>
      <div class="form-actions">
        ${id?`<button class="btn-danger" onclick="Notes.delete('${id}');App.closeModal()">Eliminar</button>`:''}
        <button class="btn-outline" onclick="App.closeModal()">Cancelar</button>
        <button class="btn-primary" onclick="Notes.save()">Guardar</button>
      </div>`;
    App.openModal(id?'Editar Nota':'Nueva Nota', html, { large: true });
    // Render existing voice players
    if (n?.voiceNotes?.length) {
      n.voiceNotes.forEach(v => Voice.renderPlayer(v.id, v.duration, 'nVoiceList'));
    }
  }

  function _fmt(cmd, val) {
    document.getElementById('nContent')?.focus();
    document.execCommand(cmd, false, val);
  }

  function _insertLink() {
    const url = prompt('URL del enlace:');
    if (!url) return;
    const text = prompt('Texto del enlace:', url);
    document.getElementById('nContent')?.focus();
    document.execCommand('insertHTML', false, `<a href="${url}" target="_blank">${text||url}</a>`);
  }

  function _addLink() {
    const list = document.getElementById('nLinksList');
    const idx  = list.children.length;
    const div  = document.createElement('div');
    div.style.cssText = 'display:flex;gap:6px;margin-bottom:6px';
    div.innerHTML = `<input type="url" class="form-input" placeholder="https://..." id="nLink${idx}"><button class="btn-icon btn-sm" onclick="this.parentElement.remove()">✕</button>`;
    list.appendChild(div);
  }

  function _setColor(color, id) {
    document.getElementById('nColor').value = color;
    document.querySelectorAll('[onclick*="_setColor"]').forEach(el => el.style.borderColor = 'transparent');
    event.target.style.borderColor = '#fff';
  }

  function _onFiles(files) {
    Array.from(files).forEach(f => {
      const id   = Utils.uuid();
      _pendingAttachments.push({ file: f, id });
      const list = document.getElementById('nAttachList');
      const item = document.createElement('div');
      item.className = 'attachment-item'; item.id = 'natt-' + id;
      item.innerHTML = `<span class="attachment-icon">${Utils.fileIcon(f.type)}</span>
        <div class="attachment-info"><div class="attachment-name">${Utils.escHtml(f.name)}</div><div class="attachment-size">${Utils.fileSize(f.size)}</div></div>
        <button class="attachment-remove" onclick="Notes._removeAttach('${id}')">✕</button>`;
      list?.appendChild(item);
    });
  }

  function _onDrop(e) { e.preventDefault(); _onFiles(e.dataTransfer.files); }
  function _removeAttach(id) {
    _pendingAttachments = _pendingAttachments.filter(a => a.id !== id);
    document.getElementById('natt-'+id)?.remove();
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
    const title   = document.getElementById('nTitle')?.value.trim() || 'Sin título';
    const content = document.getElementById('nContent')?.innerHTML  || '';
    const tagsRaw = document.getElementById('nTags')?.value || '';
    const tags    = tagsRaw.split(',').map(t=>t.trim()).filter(Boolean);
    const color   = document.getElementById('nColor')?.value || '';
    const pinned  = document.getElementById('nPinned')?.checked || false;

    // Collect links
    const links = [];
    document.querySelectorAll('[id^="nLink"]').forEach(el => { if (el.value) links.push(el.value); });

    // Save attachments
    const attIds = [];
    for (const { file, id } of _pendingAttachments) {
      await DB.saveAttachment(id, file);
      attIds.push(id);
    }

    const existing = _editId ? State.getNotes().find(x=>x.id===_editId) : null;
    const note = {
      id:          _editId || Utils.uuid(),
      title, content, tags, color, pinned, links,
      attachments: [...(existing?.attachments||[]), ...attIds],
      voiceNotes:  [...(existing?.voiceNotes||[]), ..._pendingVoices],
      createdAt:   existing?.createdAt || new Date().toISOString(),
      updatedAt:   new Date().toISOString()
    };
    State.saveNote(note);
    App.closeModal();
    App.toast(_editId ? 'Nota actualizada' : 'Nota guardada','success');
    render();
  }

  function _delete(id) {
    if (!confirm('¿Eliminar esta nota?')) return;
    State.deleteNote(id);
    App.toast('Nota eliminada','info');
    render();
  }

  return { render, filter, openModal, save, delete: _delete, _fmt, _insertLink, _addLink, _setColor, _onFiles, _onDrop, _removeAttach, _startVoice, _setTag };
})();
