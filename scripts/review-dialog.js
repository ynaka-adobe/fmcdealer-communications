/*
 * Demo review actions (send to reviewer, final approval, approve, reopen). A signed-in employee
 * needs nothing more. Anyone else is asked for a demo code, once per browser tab, kept only in
 * sessionStorage. Without the code, nothing is changed.
 */
import { reviewCommunication } from './communications-api.js';

const KEY = 'fmc-review-code';

const read = () => { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } };
const write = (v) => { try { if (v) sessionStorage.setItem(KEY, v); else sessionStorage.removeItem(KEY); } catch (e) { /* storage blocked: ask each time */ } };

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A short message in the corner; kind is 'ok' or 'error'. */
export function toast(message, kind = 'ok') {
  let box = document.querySelector('.review-toasts');
  if (!box) {
    box = el('div', 'review-toasts');
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  const t = el('p', `review-toast review-toast-${kind}`, message);
  box.append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 8000 : 4500);
}

/** Ask for the demo code; resolves with the text entered, or '' if cancelled. */
function prompt(message) {
  return new Promise((resolve) => {
    const dialog = el('dialog', 'review-dialog');
    const form = el('form');
    form.method = 'dialog';
    const label = el('label', '', message);
    const input = el('input');
    input.type = 'password';
    input.autocomplete = 'off';
    input.required = true;
    label.append(input);
    const actions = el('div', 'review-dialog-actions');
    const cancel = el('button', '', 'Cancel');
    cancel.type = 'button';
    const ok = el('button', 'review-dialog-ok', 'Continue');
    ok.type = 'submit';
    actions.append(cancel, ok);
    form.append(label, actions);
    dialog.append(form);
    document.body.append(dialog);
    const done = (value) => { dialog.close(); dialog.remove(); resolve(value); };
    cancel.addEventListener('click', () => done(''));
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); done(''); });
    form.addEventListener('submit', (e) => { e.preventDefault(); done(input.value.trim()); });
    dialog.showModal();
    input.focus();
  });
}

/**
 * Run a review action. Resolves with the service's answer; rejects with a readable message
 * (also when the person cancels the code prompt, with `cancelled` set).
 */
export async function runReview(id, action) {
  // First try with the remembered code, or none: a signed-in employee needs no code, so the
  // prompt appears only when the service says one is required.
  let code = read();
  let who = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!code && attempt > 0) {
      // eslint-disable-next-line no-await-in-loop
      code = await prompt(attempt > 1 ? 'That code was not accepted. Enter the demo code' : `Enter the demo code to continue${who ? ` (${who})` : ''}`);
      if (!code) { const e = new Error('Cancelled'); e.cancelled = true; throw e; }
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const out = await reviewCommunication(id, action, code);
      if (code) write(code);
      return out;
    } catch (e) {
      if (e.status !== 403) throw e;
      if (e.caller === 'guest') who = 'you are signed in with a guest code, and guests need the demo code';
      else if (e.caller === 'none') who = 'the site did not see a sign-in on this request';
      else if (e.caller === 'employee') who = 'you are signed in as an employee, so this should not happen';
      write('');
      code = '';
    }
  }
  throw new Error('The demo code was not accepted.');
}
