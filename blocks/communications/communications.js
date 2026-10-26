import { shouldShowAnnouncement } from './communications-data.js';
import { listCommunications, watchCommunications } from '../../scripts/communications-api.js';
import showAnnouncement from './announcement.js';
import { downloadHtml, downloadPdf } from '../../scripts/communication-export.js';
import { runReview, toast } from '../../scripts/review-dialog.js';

const PAGE_SIZE = 7;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

const ACTIVE_COLUMNS = [
  { key: 'title', label: 'Title', sort: true, filter: true },
  { key: 'status', label: 'Status', sort: true, filter: true, select: true },
  { key: 'reviewer', label: 'Reviewer', sort: true, filter: true, select: true },
  { key: 'author', label: 'Author', sort: true, filter: true, select: true },
  { key: 'created', label: 'Created Date', sort: true, date: true },
  { key: 'modified', label: 'Modified Date', sort: true, date: true },
];

const ARCHIVE_COLUMNS = [
  {
    key: 'fileName', label: 'File Name', sort: true, filter: true, info: true,
  },
  { key: 'title', label: 'Title', sort: true, filter: true },
  { key: 'status', label: 'Status', sort: true, filter: true, select: true },
  { key: 'reviewer', label: 'Reviewer', sort: true, filter: true, select: true },
  { key: 'author', label: 'Author', sort: true, filter: true, select: true },
  { key: 'created', label: 'Created Date', sort: true, date: true },
  { key: 'modified', label: 'Modified Date', sort: true, date: true },
];

// A reference only means something for real communication numbers (EFC260061); the id the
// site gives a draft (DRAFT-<time>-<code>) is plumbing, so it is not shown.
const SITE_ID = /^DRAFT-\d{14}-[a-z0-9]{4}$/;

// workflow order for the Status list; any other value sorts after these, alphabetically
const STATUS_ORDER = ['DRAFT', 'REVIEWER PENDING', 'FINAL APPROVAL PENDING', 'GENERATING PDF', 'PDF ERROR', 'APPROVED', 'PUBLISHED', 'UNPUBLISH'];

// Text search: each cell is folded to lower case without accents and split into words once per
// row set (the "index"). A query matches when every query word starts a word of the cell, in any
// order; a substring hit inside a word still counts, but ranks lower.
const fold = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const wordsOf = (folded) => folded.split(/[^a-z0-9]+/).filter(Boolean);

function buildIndex(rows, keys) {
  const index = new Map();
  rows.forEach((r) => {
    const entry = {};
    keys.forEach((k) => { const text = fold(r[k]); entry[k] = { text, words: wordsOf(text) }; });
    index.set(r, entry);
  });
  return index;
}

/** 0 = no match, 3 = whole phrase at the start, 2 = every word starts a word, 1 = substrings only */
function score(cell, query) {
  const terms = wordsOf(query);
  if (!terms.length) return 3;
  if (cell.text.startsWith(query)) return 3;
  if (terms.every((t) => cell.words.some((w) => w.startsWith(t)))) return 2;
  return terms.every((t) => cell.text.includes(t)) ? 1 : 0;
}

const ACTIONS = ['Edit', 'Archive'];

// the next workflow step offered for a status (demo review actions; see scripts/review-dialog.js)
const NEXT_STEP = {
  DRAFT: ['Send to Reviewer', 'reviewer'],
  'REVIEWER PENDING': ['Final Approval', 'final'],
  'FINAL APPROVAL PENDING': ['Approve', 'approve'],
  'PDF ERROR': ['Retry PDF', 'approve'],
};
const REVIEW_DONE = {
  reviewer: 'sent to the reviewer', final: 'moved to final approval', approve: 'approved and moved to the archive', reopen: 'reopened as a draft',
};
const statusClass = (s) => `status-${String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
const ARCHIVE_ACTIONS = ['Copy As New', 'Preview', 'Download PDF', 'Download HTML', 'Reopen', 'View Properties', 'Version'];

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
  const isArchive = block.classList.contains('archive');

  const menuActions = isArchive ? ARCHIVE_ACTIONS : ACTIONS;
  let rows;
  try {
    rows = await listCommunications(isArchive ? 'archive' : 'active');
  } catch (e) {
    // the service answers 401 when the session has ended; anything else is a service problem
    const signedOut = /communications api 401/.test(e && e.message);
    block.textContent = '';
    const msg = el('p', 'communications-error');
    if (signedOut) {
      const link = el('a', '', 'Sign in');
      link.href = `/auth/login?returnTo=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`;
      msg.append('Your session has ended. ', link, ' to see communications.');
    } else {
      msg.textContent = 'Communications are unavailable right now. Please try again shortly.';
    }
    block.append(msg);
    return;
  }
  // the File Name column only when some communication has a real number, so both pages share
  // one layout; a locked communication is marked next to its title
  const COLUMNS = (isArchive ? ARCHIVE_COLUMNS : ACTIVE_COLUMNS)
    .filter((c) => c.key !== 'fileName' || rows.some((r) => r.fileName && !SITE_ID.test(r.fileName)));
  const leadCount = 1;
  const state = {
    sortKey: null, sortDir: 1, filters: {}, page: 1, tallest: 0,
  };

  block.textContent = '';

  // header band: breadcrumb on the left, actions on the right, the same on both pages
  const toolbar = el('div', 'communications-toolbar');
  if (!isArchive) {
    const archive = el('a', 'communications-button', 'View Archive');
    archive.href = '/archive';
    toolbar.append(archive);
  }
  const create = el('button', 'communications-button', 'Create Draft');
  create.type = 'button';
  create.addEventListener('click', async () => {
    const proceed = block.dispatchEvent(new CustomEvent('communications:create-draft', { bubbles: true, cancelable: true }));
    if (!proceed) return;
    if (shouldShowAnnouncement() && !(await showAnnouncement())) return;
    window.location.href = '/create-draft';
  });
  toolbar.append(create);
  // the archive page authors its own "Home › View Archive"; the home page is just "Home"
  let crumb = document.querySelector('main .breadcrumb');
  if (!crumb) {
    crumb = el('nav', 'breadcrumb');
    crumb.setAttribute('aria-label', 'Breadcrumb');
    const here = el('h1', '', 'Home');
    here.setAttribute('aria-current', 'page');
    crumb.append(here);
  }
  const bar = el('div', 'communications-bar');
  bar.append(crumb, toolbar);

  // table
  const table = el('table');
  const scroller = el('div', 'communications-scroll');
  const thead = el('thead');
  const tbody = el('tbody');
  table.append(thead, tbody);
  const pager = el('nav', 'communications-pager');
  pager.setAttribute('aria-label', 'Pagination');

  const searchKeys = COLUMNS.filter((c) => c.filter && !c.select).map((c) => c.key);
  let index = buildIndex(rows, searchKeys);

  function visibleRows() {
    const best = new Map(); // row -> its weakest search score, for ranking
    let out = rows.filter((r) => Object.entries(state.filters).every(([k, v]) => {
      if (!v) return true;
      if (COLUMNS.find((c) => c.key === k).select) return String(r[k]) === v;
      const hit = score(index.get(r)[k], fold(v).trim());
      best.set(r, Math.min(best.get(r) || 3, hit));
      return hit > 0;
    }));
    if (state.sortKey) {
      out = [...out].sort((a, b) => (a[state.sortKey] > b[state.sortKey] ? 1 : -1) * state.sortDir);
    } else if (best.size) {
      // no explicit sort: best matches first, otherwise the sheet's own order
      out = out.map((r, i) => [r, i]).sort((a, b) => (best.get(b[0]) - best.get(a[0])) || (a[1] - b[1])).map(([r]) => r);
    }
    return out;
  }

  // the choices of a drop-down are the values currently in the sheet
  const selects = {};
  function optionsFor(key) {
    const values = [...new Set(rows.map((r) => String(r[key] || '')).filter((v) => v && v !== '-'))];
    if (key !== 'status') return values.sort((a, b) => a.localeCompare(b));
    const rank = (v) => (STATUS_ORDER.includes(v) ? STATUS_ORDER.indexOf(v) : STATUS_ORDER.length);
    return values.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }
  function fillSelect(select, key, label) {
    const keep = state.filters[key] || '';
    select.textContent = '';
    const all = el('option', '', `Any ${label.toLowerCase()}`);
    all.value = '';
    select.append(all);
    const values = optionsFor(key);
    // a selected value that has left the sheet stays selectable until the person changes it
    if (keep && !values.includes(keep)) values.push(keep);
    values.forEach((v) => {
      const o = el('option', '', v);
      o.value = v;
      select.append(o);
    });
    select.value = keep;
  }

  // A refresh can read a copy of the sheet from just before a change made here, so for a short
  // while the page keeps the result it already knows: id -> { status, gone, until }
  const settled = new Map();
  const SETTLE_MS = 45000;
  function applySettled(list) {
    const now = Date.now();
    settled.forEach((v, id) => { if (v.until < now) settled.delete(id); });
    return list.filter((r) => !(settled.get(r.id) || {}).gone)
      .map((r) => (settled.has(r.id) ? { ...r, status: settled.get(r.id).status } : r));
  }

  async function review(r, action) {
    try {
      const out = await runReview(r.id, action);
      // approving starts PDF generation; the row leaves this list only once it is APPROVED
      const gone = out.status === 'APPROVED' || action === 'reopen';
      settled.set(r.id, { status: out.status, gone, until: Date.now() + SETTLE_MS });
      if (gone) {
        // it now belongs on the other list; this one drops it at once
        rows = rows.filter((x) => x.id !== r.id);
      } else {
        r.status = out.status;
      }
      index = buildIndex(rows, searchKeys);
      Object.entries(selects).forEach(([key, { select, label }]) => fillSelect(select, key, label));
      renderBody();
      toast(out.status === 'GENERATING PDF'
        ? `Generating the PDF for "${r.title}". It moves to the archive when the PDF is ready.`
        : `"${r.title}" ${REVIEW_DONE[action]}.`);
    } catch (e) {
      if (!e.cancelled) toast(e.message, 'error');
    }
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
      td.colSpan = COLUMNS.length + leadCount;
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
        // review steps only exist for communications that live in AEM (they have an asset path)
        const step = !isArchive && r.aemPath && NEXT_STEP[r.status];
        // a PDF can only be downloaded when one was exported for this communication
        const items = (isArchive ? menuActions : [menuActions[0], ...(step ? [step[0]] : []), ...menuActions.slice(1)])
          .filter((a) => (a !== 'Download PDF' || r.pdf) && (a !== 'Reopen' || r.aemPath));
        items.forEach((a) => {
          const li = el('li');
          const item = el('button', '', a);
          item.type = 'button';
          item.addEventListener('click', () => {
            closeMenus();
            const proceed = block.dispatchEvent(new CustomEvent(`communications:${a.toLowerCase().replace(/\s+/g, '-')}`, { bubbles: true, cancelable: true, detail: r }));
            if (!proceed) return;
            if (isArchive && a === 'Preview') window.location.href = `/preview?file=${encodeURIComponent(r.fileName)}`;
            if (isArchive && a === 'Download PDF') downloadPdf(r.pdf, r.fileName);
            if (isArchive && a === 'Download HTML') downloadHtml(r.fileName);
            const action = (step && a === step[0] && step[1]) || (a === 'Reopen' && 'reopen');
            if (action) review(r, action);
          });
          li.append(item);
          menu.append(li);
        });
        actions.append(menu);
        // fixed positioning escapes the table's scroll container; flip up near the bottom edge
        const k = kebab.getBoundingClientRect();
        const m = menu.getBoundingClientRect();
        const below = k.bottom + m.height + 8 <= window.innerHeight;
        menu.style.top = `${below ? k.bottom : Math.max(8, k.top - m.height)}px`;
        menu.style.left = `${Math.min(k.left, window.innerWidth - m.width - 8)}px`;
      });
      actions.append(kebab);
      tr.append(actions);
      COLUMNS.forEach((c) => {
        let text = r[c.key];
        if (c.date) text = formatDate(r[c.key]);
        else if (c.key === 'status') text = '';
        else if (c.key === 'fileName' && SITE_ID.test(r.fileName)) text = '\u2014';
        const td = el('td', c.date ? 'communications-date' : '', text);
        if (c.key === 'title' && r.locked) {
          const lock = el('span', 'communications-info', '\u24D8 ');
          lock.title = 'Locked';
          lock.setAttribute('role', 'img');
          lock.setAttribute('aria-label', 'Locked');
          td.prepend(lock);
        }
        if (c.key === 'status') {
          const pill = el('span', `communications-status ${statusClass(r.status)}`, r.status);
          if (r.note) pill.title = r.note; // why a PDF failed
          td.append(pill);
        }
        if (c.info && !SITE_ID.test(r.fileName)) {
          const i = el('span', 'communications-info', ' \u24D8');
          i.title = `Details for ${r[c.key]}`;
          td.append(i);
        }
        tr.append(td);
      });
      tbody.append(tr);
    });

    // keep the table as tall as its fullest page so the pager does not jump up on a short page
    state.tallest = Math.max(state.tallest, table.offsetHeight);
    scroller.style.minHeight = state.tallest ? `${state.tallest}px` : '';

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
    labels.append(el('th', '', 'Actions'));
    filters.append(el('th'));
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
      if (c.select) {
        const select = el('select');
        select.setAttribute('aria-label', `Filter by ${c.label}`);
        selects[c.key] = { select, label: c.label };
        fillSelect(select, c.key, c.label);
        select.addEventListener('change', () => {
          state.filters[c.key] = select.value;
          state.page = 1;
          renderBody();
        });
        fth.append(select);
      } else if (c.filter) {
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
  window.addEventListener('scroll', closeMenus, true);
  window.addEventListener('resize', closeMenus);
  // row heights change with the width (titles wrap), so measure again after a resize
  window.addEventListener('resize', () => { state.tallest = 0; scroller.style.minHeight = ''; });
  renderHead();
  renderBody();
  // pick up workflow status changes made in AEM (remote backend only)
  watchCommunications(isArchive ? 'archive' : 'active', (fresh) => {
    rows = applySettled(fresh);
    index = buildIndex(rows, searchKeys);
    Object.entries(selects).forEach(([key, { select, label }]) => fillSelect(select, key, label));
    renderBody();
  });
  scroller.append(table);
  block.append(bar, scroller, pager);
}
