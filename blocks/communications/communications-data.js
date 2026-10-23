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

export default async function getCommunications() {
  return SAMPLE;
}
