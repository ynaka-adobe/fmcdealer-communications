import { initConsent } from './consent.js';
import initAnalytics from './analytics.js';

/**
 * Analytics runs in the delayed phase so it cannot affect LCP/CWV. Order matters: analytics
 * subscribes to consent first, then consent decides (implied unless the visitor said no).
 */
initAnalytics()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[analytics] init failed', e);
  })
  .finally(() => {
    initConsent();
  });
