/* IDPS · Actualización automática de paneles — Material Educativo Chile.
   No lee ni envía información personal: consulta solo una revisión agregada, protegida por la sesión institucional. */
(function () {
  'use strict';
  const current = window.location.pathname.replace(/\/$/, '') || '/';
  const selectors = {
    '/panel': '.dashboard-kpis',
    '/panel/aplicacion': 'main .wrap > .grid',
    '/panel/resultados': 'main .wrap > .grid',
    '/panel/informe/institucional': '.page'
  };
  if (!Object.prototype.hasOwnProperty.call(selectors, current)) return;

  const EVERY_MS = 5000;
  let appliedRevision = null;
  let waiting = false;
  let stopped = false;
  let timer = null;
  const status = document.createElement('div');
  status.className = 'idps-live-status';
  status.setAttribute('role', 'status');
  status.textContent = '● Conectando actualización automática…';

  function announce(message, state) {
    status.textContent = message;
    status.dataset.state = state || 'ok';
  }

  function boot() {
    const h = document.querySelector('main h1') || document.querySelector('h1');
    if (h) h.insertAdjacentElement('afterend', status);
    else document.body.appendChild(status);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && !stopped) { clearTimeout(timer); check(); }
    });
    check();
  }

  function courseFilters(root, saved) {
    const q = root.querySelector('#studentSearch');
    const s = root.querySelector('#statusFilter');
    const c = root.querySelector('#courseFilter');
    const table = root.querySelector('#studentsTable');
    if (!q || !s || !c || !table) return;
    q.value = saved.search || '';
    s.value = saved.status || '';
    c.value = saved.course || '';
    const rows = Array.from(table.querySelectorAll('tbody tr[data-status]'));
    function filter() {
      const term = (q.value || '').toLowerCase().trim();
      rows.forEach(function (row) {
        const visible = (!term || (row.dataset.search || '').includes(term)) &&
          (!s.value || row.dataset.status === s.value) &&
          (!c.value || row.dataset.course === c.value);
        row.style.display = visible ? '' : 'none';
      });
    }
    q.addEventListener('input', filter);
    s.addEventListener('change', filter);
    c.addEventListener('change', filter);
    filter();
  }

  async function refresh() {
    const selector = selectors[current];
    const currentBlock = document.querySelector(selector);
    if (!currentBlock) return false;

    // No interrumpir a quien está filtrando, escribiendo o seleccionando una clave.
    const focused = document.activeElement;
    if (focused && currentBlock.contains(focused) &&
      /^(INPUT|SELECT|TEXTAREA)$/.test(focused.tagName)) {
      announce('● Cambios nuevos · se aplicarán al terminar de editar', 'pending');
      return false;
    }

    const response = await fetch(window.location.pathname + window.location.search, {
      method: 'GET', credentials: 'same-origin', cache: 'no-store',
      redirect: 'follow', headers: {'Accept': 'text/html'}
    });
    if (!response.ok || new URL(response.url).pathname !== current)
      throw new Error('La sesión ha vencido o no se puede actualizar');
    const documentNew = new DOMParser().parseFromString(await response.text(), 'text/html');
    const newBlock = documentNew.querySelector(selector);
    if (!newBlock || documentNew.querySelector('form[action="/login"]'))
      throw new Error('No se recibieron resultados válidos');

    const preserved = {
      search: document.getElementById('studentSearch')?.value || '',
      status: document.getElementById('statusFilter')?.value || '',
      course: document.getElementById('courseFilter')?.value || ''
    };
    const top = window.scrollY;
    const updated = document.importNode(newBlock, true);
    currentBlock.replaceWith(updated);
    if (current === '/panel/aplicacion') courseFilters(updated, preserved);
    window.scrollTo({top: top, behavior: 'instant'});
    return true;
  }

  async function check() {
    if (waiting || stopped || document.hidden) return;
    waiting = true;
    try {
      const response = await fetch('/api/idps/live-revision', {
        method: 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: {'Accept': 'application/json'}
      });
      if (response.status === 401 || response.status === 403) {
        stopped = true;
        announce('Sesión vencida · vuelve a ingresar para ver los resultados', 'error');
        return;
      }
      if (!response.ok) throw new Error('No se pudo consultar el avance');
      const data = await response.json();
      if (!data.ok || !data.revision) throw new Error('Revisión no disponible');
      if (appliedRevision !== data.revision) {
        const synced = await refresh();
        if (synced) {
          appliedRevision = data.revision;
          announce('● Resultados al día · actualización automática cada 5 s', 'ok');
        }
      } else {
        announce('● Resultados al día · actualización automática cada 5 s', 'ok');
      }
    } catch (err) {
      announce('● Sin conexión temporal · reintentando automáticamente', 'error');
    } finally {
      waiting = false;
      if (!stopped) timer = setTimeout(check, EVERY_MS);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true});
  else boot();
})();
