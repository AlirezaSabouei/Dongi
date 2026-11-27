/**
 * Group detail page: reads the group id from `?id=` and fills the static
 * placeholder markup. Real member/expense data arrives with the groups API.
 */

import { initShell } from './shell.js';

initShell();
initGroup();

function initGroup() {
  const rawId = new URLSearchParams(window.location.search).get('id') ?? '';
  const id = rawId.trim();
  const idTarget = document.querySelector('[data-group-id]');
  const initials = document.querySelector('[data-group-initials]');

  if (idTarget) idTarget.textContent = id || 'نامشخص';
  if (initials) {
    initials.textContent = id ? id.slice(0, 2).toUpperCase() : 'گ';
  }

  document.title = id ? `گروه ${id} · دنگی` : 'گروه · دنگی';
}
