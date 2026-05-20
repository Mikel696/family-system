/* Shared utilities */
const Utils = (() => {
  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function formatCurrency(amount, currency = 'COP') {
    const settings = State.getSettings();
    const sym = settings.currencySymbol || '$';
    if (currency === 'COP') {
      return sym + ' ' + Math.abs(amount).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    return sym + ' ' + Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(iso, fmt) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    const dd   = String(d.getDate()).padStart(2,'0');
    const mm   = String(d.getMonth()+1).padStart(2,'0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  function formatDateShort(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function today() {
    return new Date().toISOString().slice(0,10);
  }

  function monthKey(date) {
    const d = date ? new Date(date) : new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }

  function monthLabel(key) {
    if (!key) return '';
    const [y, m] = key.split('-');
    const d = new Date(+y, +m-1, 1);
    return d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  }

  function daysUntil(iso) {
    if (!iso) return null;
    const diff = new Date(iso) - new Date();
    return Math.ceil(diff / 86400000);
  }

  function fileIcon(type) {
    if (!type) return '📄';
    if (type.startsWith('image/')) return '🖼️';
    if (type === 'application/pdf') return '📕';
    if (type.includes('word')) return '📝';
    if (type.includes('excel') || type.includes('spreadsheet')) return '📊';
    if (type.startsWith('audio/')) return '🎵';
    if (type.startsWith('video/')) return '🎬';
    return '📄';
  }

  function fileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
    return (bytes/(1024*1024)).toFixed(1) + ' MB';
  }

  function categoryIcon(cat) {
    const icons = {
      'Salario': '💼', 'Arriendo': '🏠', 'Mercado': '🛒', 'Transporte': '🚌',
      'Salud': '💊', 'Educación': '📚', 'Entretenimiento': '🎬', 'Ropa': '👗',
      'Restaurante': '🍽️', 'Servicios': '💡', 'Ahorro': '💰', 'Deuda': '💳',
      'Inversión': '📈', 'Mascotas': '🐾', 'Viaje': '✈️', 'Regalo': '🎁',
      'Otro ingreso': '💵', 'Otros': '📦', 'Telefono': '📱', 'Internet': '🌐',
      'Gas': '🔥', 'Agua': '💧', 'Electricidad': '⚡', 'Seguro': '🛡️'
    };
    return icons[cat] || '📦';
  }

  function debtTypeIcon(type) {
    return { loan: '🏦', credit_card: '💳', personal: '🤝', mortgage: '🏠', other: '📋' }[type] || '📋';
  }

  function personLabel(p) {
    return { karen: '👩 Karen', miguel: '👨 Miguel', shared: '🏠 Hogar' }[p] || p;
  }

  function priorityLabel(p) {
    return { high: '🔴 Alta', medium: '🟡 Media', low: '🟢 Baja' }[p] || p;
  }

  function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || '';
  }

  const COLORS = ['#8B5CF6','#EC4899','#10B981','#3B82F6','#F59E0B','#EF4444','#14B8A6','#F97316','#6366F1','#84CC16'];

  const TX_CATEGORIES = {
    income:  ['Salario','Freelance','Inversión','Otro ingreso','Transferencia','Bono'],
    expense: ['Arriendo','Mercado','Transporte','Salud','Educación','Entretenimiento',
              'Ropa','Restaurante','Servicios','Electricidad','Gas','Agua','Internet',
              'Telefono','Seguro','Deuda','Ahorro','Mascotas','Viaje','Regalo','Otros']
  };

  return {
    uuid, formatCurrency, formatDate, formatDateShort, formatDateTime,
    today, monthKey, monthLabel, daysUntil,
    fileIcon, fileSize, categoryIcon, debtTypeIcon, personLabel, priorityLabel,
    escHtml, stripHtml, COLORS, TX_CATEGORIES
  };
})();
