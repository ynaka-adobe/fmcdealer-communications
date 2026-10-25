/*
 * Option lists and persistence for the Create Draft form.
 * Values come from the Ford screens; anything marked "sample" is made up for the demo.
 * Replace saveDraft() with a write to AEM Assets when the target is decided.
 */
export const DIVISIONS = ['Sales Ops', 'FCSD'];

export const CHANNELS = [
  'Customer Support', 'FCSD Other', 'Aftermarket - Dealers', 'Aftermarket - FAD', 'Collision',
  'Ford and Lincoln Protect', 'Parts', 'Service', 'Warranty',
];

// sample: who reviews / concurs for each channel (filled in when a channel is chosen)
export const ROUTING = {
  default: { reviewer: 'mshanm26', alternate: 'ndolloff', concurring: 'vck' },
  'Customer Support': { reviewer: 'ndolloff', alternate: 'mshanm26', concurring: 'vck' },
  Collision: { reviewer: 'kvikran2', alternate: 'ndolloff', concurring: 'sraja25' },
};

export const FIELD_GROUPS = ['All Ford Field Personnel', 'All Ford and Lincoln Field Personnel', 'All Lincoln Field Personnel'];

export const FIELD_ROLES = [
  'General Manager', 'Ford Regional Manager', 'FCSD and SalesOps Market Area Trainer',
  'Office Operations Specialist', 'Marketing Manager', 'Accessory Sales Manager',
];

export const DEALER_GROUPS = ['All Ford & Lincoln Dealers', 'All Ford Dealers', 'All Lincoln Dealers'];

export const DEALER_ROLES = [
  'Dealer Principals', 'General Managers', 'Fixed Operations Directors', 'Sales Managers', 'Sales Consultants',
  'F&I Managers', 'Inventory Managers', 'Parts Managers', 'Parts Department', 'Service Managers',
  'Service Advisors', 'Warranty Administrators', 'Service Department', 'Technicians',
];

export const DEPARTMENTS = [
  'New Sales', 'Ford Blue Advantage/Lincoln CPO/Use', 'Service', 'Parts', 'Warranty', 'Quick Lane',
  'Ford Pro - Fleet Sales, Service and Solutions', 'Public Affairs', 'Finance', 'Training',
];

const DRAFTS_KEY = 'fmc-drafts';

/** Stand-in for creating the draft asset. Keeps drafts in this browser session only. */
export async function saveDraft(payload) {
  const now = new Date().toISOString().slice(0, 19);
  const record = {
    id: `DRAFT-${Date.now()}`,
    title: payload.title,
    status: 'DRAFT',
    reviewer: payload.reviewer || '-',
    author: payload.originator || '-',
    created: now,
    modified: now,
  };
  try {
    const drafts = JSON.parse(sessionStorage.getItem(DRAFTS_KEY) || '[]');
    drafts.unshift(record);
    sessionStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  } catch (e) { /* storage unavailable: the draft just isn't listed */ }
  document.dispatchEvent(new CustomEvent('create-draft:submit', { detail: payload }));
  return record;
}

/** Remember a draft created through the service so this browser sees it before the sheet updates. */
export function rememberDraft(record) {
  try {
    const drafts = JSON.parse(sessionStorage.getItem(DRAFTS_KEY) || '[]').filter((d) => d.id !== record.id);
    drafts.unshift(record);
    sessionStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  } catch (e) { /* storage unavailable: it just shows up when the sheet does */ }
}

export function savedDrafts() {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFTS_KEY) || '[]');
  } catch (e) {
    return [];
  }
}
