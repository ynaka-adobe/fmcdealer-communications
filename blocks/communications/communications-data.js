/*
 * Data source for the communications widget.
 * Replace getCommunications() with a fetch() to the real API when available.
 */
const SAMPLE = [
  {
    title: 'TestOct21 2 PM', status: 'FINAL APPROVAL PENDING', reviewer: 'sgorle1', author: 'sgorle1', created: '2026-10-21T14:01:26', modified: '2026-10-21T14:03:57',
  },
  {
    title: 'EFC Test Oct 21', status: 'DRAFT', reviewer: 'mshanm26', author: 'sgorle1', created: '2026-10-21T10:30:57', modified: '2026-10-21T10:31:49',
  },
  {
    title: 'Sirisha-Test-EFC', status: 'REVIEWER PENDING', reviewer: 'ndolloff', author: 'sgorle1', created: '2026-10-20T22:43:48', modified: '2026-10-20T23:02:20',
  },
];

const ARCHIVE = [
  ['EFC260061', 'EFC260061-S1 Host an event and build awareness for a local non-profit organization', 'PUBLISHED', 'vck', 'vck', '2026-06-01T06:09:41', true],
  ['EFC260064', 'EFC260064 Demo Communication', 'UNPUBLISH', 'vck', 'vck', '2026-06-01T12:40:53', false],
  ['EFC260060', 'EFC260060-S1 Summer of Community Impact Registration', 'PUBLISHED', 'vck', 'vck', '2026-06-01T12:56:08', false],
  ['EFC260066', 'EFC260066-S1 test', 'PUBLISHED', 'sraja25', 'sraja25', '2026-09-11T05:58:13', false],
  ['EFC260067', 'EFC260067-S2 Spring Upgrade - Test - supersede', 'PUBLISHED', 'kvikran2', 'kvikran2', '2026-09-16T09:39:51', false],
  ['MC260017', 'Test - kvikran2', 'PUBLISHED', 'kvikran2', 'kvikran2', '2026-09-17T09:25:14', false],
  ['EFC260068', 'EFC260068-S2 Communication Test-supersede to simple', 'PUBLISHED', 'kvikran2', 'kvikran2', '2026-09-18T10:15:47', false],
  ['EFC260069', 'EFC260069-S2 Dev Test - Supersede', 'PUBLISHED', 'kvikran2', 'kvikran2', '2026-09-18T11:52:58', false],
  ['EFC260070', 'EFC260070 Test iN Local', 'PUBLISHED', 'kvikran2', 'kvikran2', '2026-09-24T11:20:54', true],
  ['EFC260071', 'EFC260071 Defect 500 test', 'PUBLISHED', 'kvikran2', 'kvikran2', '2026-09-24T18:26:49', true],
].map(([fileName, title, status, reviewer, author, created, locked]) => ({
  fileName, title, status, reviewer, author, created, locked,
}));

/** @param {string} [type] 'archive' for archived communications, else the active list */
export default async function getCommunications(type) {
  return type === 'archive' ? ARCHIVE : SAMPLE;
}
