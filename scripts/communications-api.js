/*
 * Client for the communications service.
 *
 * Where data comes from, set by page metadata (all values are same-origin paths):
 * - `communications-data` (for example `/data`): the LISTS are read from the published sheets
 *   /data/notifications.json (active) and /data/archive.json. These are static, cached JSON, so
 *   listing never touches AEM. This is the fast path and the default for real use.
 * - `communications-api` (for example `/api/fmc`): the service for detail, create and status.
 *   It is called on submission and other key events, not to render lists.
 * - `communications-draft-save` = true: also save each form step through the service (a sheet
 *   write, not an AEM call) so a draft survives a reload and appears in the list.
 * - neither: mock mode, with sample data and drafts kept in this browser session.
 *
 * The service lives behind the site's own origin: the edge function forwards `/api/fmc/...` to it
 * (for example App Builder actions in front of AEM Author), so the browser never holds AEM
 * credentials. The contract is documented in docs/communications-api.md.
 *
 * Only paths on this origin are accepted as a base, so a crafted link cannot point the
 * page at another server.
 */

const MOCK_DATA = '../blocks/communications/communications-data.js';
const SHEETS = { active: 'notifications', archive: 'archive' };
const MOCK_DRAFTS = '../blocks/create-draft/create-draft-data.js';

/** Remote base path from page metadata, or '' for the mock backend. */
export function apiBase() {
  const meta = typeof document !== 'undefined' && document.querySelector('meta[name="communications-api"]');
  const value = ((meta && meta.content) || '').trim();
  return /^\/(?!\/)/.test(value) ? value.replace(/\/+$/, '') : '';
}

export const isRemote = () => apiBase() !== '';

/** Base path of the list sheets from page metadata, or '' when lists come from the mock/service. */
export function dataBase() {
  const meta = typeof document !== 'undefined' && document.querySelector('meta[name="communications-data"]');
  const value = ((meta && meta.content) || '').trim();
  return /^\/(?!\/)/.test(value) ? value.replace(/\/+$/, '') : '';
}

const draftSaveOn = () => typeof document !== 'undefined'
  && (document.querySelector('meta[name="communications-draft-save"]') || {}).content === 'true';

/** Sheet cells are strings: normalise one row to the shape the blocks use. */
function fromSheetRow(r) {
  return {
    id: r.id || r.fileName,
    fileName: r.fileName || r.id,
    title: r.title || r.fileName || '',
    status: r.status || 'DRAFT',
    reviewer: r.reviewer || '-',
    author: r.author || '-',
    created: r.created || '',
    modified: r.modified || r.created || '',
    locked: String(r.locked).toLowerCase() === 'true',
  };
}

/** Polling interval in ms from `communications-poll` metadata (seconds, 5 to 600; default 30). */
function pollMs() {
  const meta = typeof document !== 'undefined' && document.querySelector('meta[name="communications-poll"]');
  const seconds = Number(meta && meta.content);
  return (Number.isFinite(seconds) && seconds >= 5 && seconds <= 600 ? seconds : 30) * 1000;
}

async function request(path, init = {}) {
  const resp = await fetch(`${apiBase()}${path}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: { accept: 'application/json', ...(init.headers || {}) },
  });
  if (!resp.ok) throw new Error(`communications api ${resp.status} for ${path}`);
  return resp.status === 204 ? null : resp.json();
}

/**
 * Communications for the list or the archive.
 * @param {'active'|'archive'} [type]
 * @returns {Promise<Array<{title:string,status:string,reviewer:string,author:string,created:string,modified?:string,fileName?:string,locked?:boolean}>>}
 */
export async function listCommunications(type = 'active') {
  if (dataBase()) {
    const resp = await fetch(`${dataBase()}/${SHEETS[type === 'archive' ? 'archive' : 'active']}.json?limit=1000`, { credentials: 'same-origin', cache: 'no-cache' });
    if (!resp.ok) throw new Error(`communications api ${resp.status} for data sheet`);
    const sheet = await resp.json();
    const rows = (sheet.data || []).map(fromSheetRow);
    if (type !== 'archive') {
      // drafts this browser created that the sheet does not list yet (the sheet is updated
      // by the service and republished, which takes a moment)
      const { savedDrafts } = await import(MOCK_DRAFTS);
      const known = new Set(rows.map((r) => r.id));
      savedDrafts().filter((d) => !known.has(d.id)).forEach((d) => rows.push(fromSheetRow(d)));
    }
    // the active list is newest first; the archive keeps the sheet's order
    return type === 'archive' ? rows : rows.sort((a, b) => String(b.modified).localeCompare(String(a.modified)));
  }
  if (isRemote()) return request(`/communications?type=${encodeURIComponent(type)}`);
  const { default: getCommunications } = await import(MOCK_DATA);
  return getCommunications(type === 'archive' ? 'archive' : undefined);
}

/**
 * One communication for the preview page, or null when there is none.
 * @returns {Promise<{title:string,fields:Array<[string,string]>,body:string}|null>}
 */
export async function getCommunicationDetail(fileName) {
  if (isRemote()) {
    try {
      const found = await request(`/communications/${encodeURIComponent(fileName)}`);
      if (found) return found;
    } catch (e) { /* not in AEM: fall through to the bundled samples */ }
  }
  // the bundled sample documents back the sample rows that exist only in the sheets
  const { getCommunicationDetail: detail } = await import(MOCK_DATA);
  return detail(fileName);
}

/**
 * Create a draft from the Create Draft form payload.
 * @returns {Promise<{id:string,status:string}>}
 */
export async function createDraft(payload) {
  if (isRemote()) {
    const created = await request('/communications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const { rememberDraft } = await import(MOCK_DRAFTS);
    const now = new Date().toISOString().slice(0, 19);
    rememberDraft({
      id: created.id, title: payload.title, status: created.status || 'DRAFT', reviewer: payload.reviewer || '-', author: payload.originator || '-', created: now, modified: now,
    });
    return created;
  }
  const { saveDraft } = await import(MOCK_DRAFTS);
  return saveDraft(payload);
}

/**
 * Save the form's progress for a draft (a sheet write through the service, not AEM). Resolves
 * true when stored; false when saving is off or unavailable, so the form carries on in the page.
 */
export async function saveDraftStep(id, payload) {
  if (!isRemote() || !draftSaveOn()) return false;
  try {
    await request(`/drafts/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return true;
  } catch (e) {
    return false;
  }
}

/** Current workflow status for one draft or communication. */
export async function getStatus(id) {
  if (isRemote()) return request(`/communications/${encodeURIComponent(id)}/status`);
  const { savedDrafts } = await import(MOCK_DRAFTS);
  const found = savedDrafts().find((d) => d.id === id);
  return found ? { id, status: found.status, updated: found.modified } : null;
}

/**
 * Call onChange(list) every intervalMs while the page is visible. Only runs against the
 * remote backend, since the mock never changes underneath the page. Returns a stop function.
 */
export function watchCommunications(type, onChange, intervalMs = pollMs()) {
  if (!isRemote() && !dataBase()) return () => {};
  const timer = setInterval(async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      onChange(await listCommunications(type));
    } catch (e) { /* keep the last good list */ }
  }, intervalMs);
  return () => clearInterval(timer);
}
