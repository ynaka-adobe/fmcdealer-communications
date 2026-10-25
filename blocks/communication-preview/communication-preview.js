import { getCommunicationDetail, listCommunications } from '../../scripts/communications-api.js';
import { sanitizeHtml } from '../create-draft/rich-text.js';

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export default async function decorate(block) {
  const file = new URLSearchParams(window.location.search).get('file');
  // an approved communication may have a PDF exported from AEM Guides, hosted on this site
  const [detail, archived] = await Promise.all([
    getCommunicationDetail(file),
    listCommunications('archive').catch(() => []),
  ]);
  const entry = archived.find((r) => r.fileName === file || r.id === file);
  const pdf = entry && entry.pdf;
  block.textContent = '';

  const layout = el('div', 'communication-preview-layout');

  const side = el('aside', 'communication-preview-fields');
  const main = el('article', 'communication-preview-body');

  if (pdf) {
    layout.classList.add('has-pdf');
    main.append(el('h1', '', (detail && detail.title) || entry.title));
    const bar = el('div', 'communication-preview-actions');
    const download = el('a', 'communication-preview-download', 'Download PDF');
    download.href = pdf;
    download.setAttribute('download', `${entry.fileName}.pdf`);
    const open = el('a', 'communication-preview-open', 'Open in new tab');
    open.href = pdf;
    open.target = '_blank';
    open.rel = 'noopener';
    bar.append(download, open);
    const viewer = el('iframe', 'communication-preview-pdf');
    viewer.src = pdf;
    viewer.title = `${entry.title} (PDF)`;
    viewer.loading = 'lazy';
    main.append(bar, viewer);
    const fields = (detail && detail.fields) || [['Status', entry.status], ['Reviewer', entry.reviewer], ['Author', entry.author]];
    fields.forEach(([label, value]) => {
      const dl = el('div', 'communication-preview-field');
      dl.append(el('p', 'communication-preview-label', label), el('p', 'communication-preview-value', value));
      side.append(dl);
    });
  } else if (detail) {
    detail.fields.forEach(([label, value]) => {
      const dl = el('div', 'communication-preview-field');
      dl.append(el('p', 'communication-preview-label', label), el('p', 'communication-preview-value', value));
      side.append(dl);
    });
    main.append(el('h1', '', detail.title));
    const content = el('div', 'communication-preview-content');
    content.innerHTML = sanitizeHtml(detail.body); // remote content is not trusted
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
