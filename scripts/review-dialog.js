/*
 * Review actions (send to reviewer, final approval, approve, archive, restore, reopen). The site
 * is open to anonymous visitors, so there is nothing to ask for: the action is simply sent.
 * (If the service is ever locked with a demo code, its message is shown as the error.)
 */
import { reviewCommunication } from './communications-api.js';

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

/** Run a review action. Resolves with the service's answer; rejects with a readable message. */
export async function runReview(id, action) {
  return reviewCommunication(id, action, '');
}
