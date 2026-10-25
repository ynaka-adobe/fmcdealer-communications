/*
 * Client for the communications service.
 *
 * Two backends behind one interface:
 * - mock (default): sample data and drafts kept in this browser session
 * - remote: a same-origin service, enabled by a `communications-api` page metadata value
 *   such as `/api/fmc` (paths below it are in the contract, e.g. `/api/fmc/communications`). The edge function forwards that path to the real service
 *   (for example App Builder actions in front of AEM Author), so the browser never holds
 *   AEM credentials. The contract is documented in docs/communications-api.md.
 *
 * Only paths on this origin are accepted as a base, so a crafted link cannot point the
 * page at another server.
 */

const MOCK_DATA = '../blocks/communications/communications-data.js';
const MOCK_DRAFTS = '../blocks/create-draft/create-draft-data.js';

/** Remote base path from page metadata, or '' for the mock backend. */
export function apiBase() {
  const meta = typeof document !== 'undefined' && document.querySelector('meta[name="communications-api"]');
  const value = ((meta && meta.content) || '').trim();
  return /^\/(?!\/)/.test(value) ? value.replace(/\/+$/, '') : '';
}

export const isRemote = () => apiBase() !== '';

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
      return await request(`/communications/${encodeURIComponent(fileName)}`);
    } catch (e) {
      return null;
    }
  }
  const { getCommunicationDetail: detail } = await import(MOCK_DATA);
  return detail(fileName);
}

/**
 * Create a draft from the Create Draft form payload.
 * @returns {Promise<{id:string,status:string}>}
 */
export async function createDraft(payload) {
  if (isRemote()) {
    return request('/communications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }
  const { saveDraft } = await import(MOCK_DRAFTS);
  return saveDraft(payload);
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
  if (!isRemote()) return () => {};
  const timer = setInterval(async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      onChange(await listCommunications(type));
    } catch (e) { /* keep the last good list */ }
  }, intervalMs);
  return () => clearInterval(timer);
}
