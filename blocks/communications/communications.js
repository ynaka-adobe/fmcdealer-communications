import getCommunications from './communications-data.js';

const PAGE_SIZE = 10;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

const COLUMNS = [
  { key: 'title', label: 'Title', sort: true, filter: true },
  { key: 'status', label: 'Status', sort: true, filter: true },
  { key: 'reviewer', label: 'Reviewer', sort: true, filter: true },
  { key: 'author', label: 'Author', sort: true, filter: true },
  { key: 'created', label: 'Created Date', sort: true, date: true },
  { key: 'modified', label: 'Modified Date', sort: true, date: true },
];

const ACTIONS = ['Edit', 'Review', 'Archive'];

function formatDate(iso) {
  const d = new Date(iso);
  return `${pad(d.getDate())}-${MONTHS[d.getMonth()]}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export default async function decorate(block) {
  const rows = await getCommunications();
  const state = {
    sortKey: null, sortDir: 1, filters: {}, page: 1,
  };

  block.textContent = '';

  // toolbar
  const toolbar = el('div', 'communications-toolbar');
  [['View Archive', 'view-archive'], ['Create Draft', 'create-draft']].forEach(([label, evt]) => {
    const b = el('button', 'communications-button', label);
    b.type = 'button';
    b.addEventListener('click', () => block.dispatchEvent(new CustomEvent(`communications:${evt}`, { bubbles: true })));
    toolbar.append(b);
  });

  // table
  const table = el('table');
  const thead = el('thead');
  const tbody = el('tbody');
  table.append(thead, tbody);
  const pager = el('nav', 'communications-pager');
  pager.setAttribute('aria-label', 'Pagination');

  function visibleRows() {
    let out = rows.filter((r) => Object.entries(state.filters)
      .every(([k, v]) => !v || String(r[k]).toLowerCase().includes(v.toLowerCase())));
    if (state.sortKey) {
      out = [...out].sort((a, b) => (a[state.sortKey] > b[state.sortKey] ? 1 : -1) * state.sortDir);
    }
    return out;
  }

  function closeMenus() {
    block.querySelectorAll('.communications-menu').forEach((m) => m.remove());
  }

  function renderBody() {
    closeMenus();
    const all = visibleRows();
    const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    state.page = Math.min(state.page, pages);
    const slice = all.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);

    tbody.textContent = '';
    if (!slice.length) {
      const tr = el('tr');
      const td = el('td', 'communications-empty', 'No communications found');
      td.colSpan = COLUMNS.length + 2;
      tr.append(td);
      tbody.append(tr);
    }
    slice.forEach((r) => {
      const tr = el('tr');
      const actions = el('td', 'communications-actions');
      const kebab = el('button', 'communications-kebab', '⋮');
      kebab.type = 'button';
      kebab.setAttribute('aria-label', `Actions for ${r.title}`);
      kebab.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = actions.querySelector('.communications-menu');
        closeMenus();
        if (open) return;
        const menu = el('ul', 'communications-menu');
        ACTIONS.forEach((a) => {
          const li = el('li');
          const item = el('button', '', a);
          item.type = 'button';
          item.addEventListener('click', () => {
            closeMenus();
            block.dispatchEvent(new CustomEvent(`communications:${a.toLowerCase()}`, { bubbles: true, detail: r }));
          });
          li.append(item);
          menu.append(li);
        });
        actions.append(menu);
      });
      actions.append(kebab);
      tr.append(actions, el('td', 'communications-change'));
      COLUMNS.forEach((c) => {
        tr.append(el('td', c.date ? 'communications-date' : '', c.date ? formatDate(r[c.key]) : r[c.key]));
      });
      tbody.append(tr);
    });

    // pagination
    pager.textContent = '';
    const addPage = (label, page, { current = false, disabled = false, aria } = {}) => {
      const b = el('button', current ? 'current' : '', label);
      b.type = 'button';
      b.disabled = disabled;
      if (aria) b.setAttribute('aria-label', aria);
      if (current) b.setAttribute('aria-current', 'page');
      b.addEventListener('click', () => { state.page = page; renderBody(); });
      pager.append(b);
    };
    addPage('«', 1, { disabled: state.page === 1, aria: 'First page' });
    addPage('‹', state.page - 1, { disabled: state.page === 1, aria: 'Previous page' });
    for (let p = 1; p <= pages; p += 1) addPage(String(p), p, { current: p === state.page });
    addPage('›', state.page + 1, { disabled: state.page === pages, aria: 'Next page' });
    addPage('»', pages, { disabled: state.page === pages, aria: 'Last page' });
  }

  function renderHead() {
    thead.textContent = '';
    const labels = el('tr');
    const filters = el('tr', 'communications-filters');
    labels.append(el('th', '', 'Actions'), el('th', '', 'Change'));
    filters.append(el('th'), el('th'));
    COLUMNS.forEach((c) => {
      const th = el('th');
      th.setAttribute('scope', 'col');
      if (c.sort) {
        const b = el('button', 'communications-sort', c.label);
        b.type = 'button';
        const arrow = state.sortKey === c.key ? (state.sortDir > 0 ? ' ↑' : ' ↓') : ' ⇅';
        b.append(el('span', 'communications-arrow', arrow));
        b.addEventListener('click', () => {
          state.sortDir = state.sortKey === c.key ? -state.sortDir : 1;
          state.sortKey = c.key;
          renderHead();
          renderBody();
        });
        th.append(b);
        th.setAttribute('aria-sort', state.sortKey === c.key ? (state.sortDir > 0 ? 'ascending' : 'descending') : 'none');
      } else {
        th.textContent = c.label;
      }
      labels.append(th);

      const fth = el('th');
      if (c.filter) {
        const input = el('input');
        input.type = 'search';
        input.placeholder = `Search by ${c.label}`;
        input.setAttribute('aria-label', `Search by ${c.label}`);
        input.value = state.filters[c.key] || '';
        input.addEventListener('input', () => {
          state.filters[c.key] = input.value;
          state.page = 1;
          renderBody();
        });
        fth.append(input);
      }
      filters.append(fth);
    });
    thead.append(labels, filters);
  }

  document.addEventListener('click', closeMenus);
  renderHead();
  renderBody();
  const scroller = el('div', 'communications-scroll');
  scroller.append(table);
  block.append(toolbar, scroller, pager);
}
