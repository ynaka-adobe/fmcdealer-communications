import { getCommunicationDetail } from '../communications/communications-data.js';

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export default async function decorate(block) {
  const file = new URLSearchParams(window.location.search).get('file');
  const detail = await getCommunicationDetail(file);
  block.textContent = '';

  const layout = el('div', 'communication-preview-layout');

  const side = el('aside', 'communication-preview-fields');
  const main = el('article', 'communication-preview-body');

  if (detail) {
    detail.fields.forEach(([label, value]) => {
      const dl = el('div', 'communication-preview-field');
      dl.append(el('p', 'communication-preview-label', label), el('p', 'communication-preview-value', value));
      side.append(dl);
    });
    main.append(el('h1', '', detail.title));
    const content = el('div', 'communication-preview-content');
    content.innerHTML = detail.body; // trusted sample content, see communications-data.js
    main.append(content);
  } else {
    main.append(el('h1', '', file || 'No communication selected'));
    main.append(el('p', '', 'No preview is available for this communication.'));
  }

  const close = el('button', 'communication-preview-close', 'Close');
  close.type = 'button';
  close.addEventListener('click', () => {
    if (document.referrer && new URL(document.referrer).origin === window.location.origin) {
      window.history.back();
    } else {
      window.location.href = '/archive';
    }
  });

  layout.append(side, main);
  block.append(layout, close);
}
