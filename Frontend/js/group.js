/**
 * Legacy group-detail entry point.
 *
 * Group details are rendered by `groups.html` at `#/groups/{id}` so hash routes
 * are shareable and survive refreshes. This module keeps the old
 * `group.html?id=...` links working by translating them to the current route.
 */

const id = new URLSearchParams(window.location.search).get('id')?.trim() ?? '';
const target = id
  ? `groups.html#/groups/${encodeURIComponent(id)}`
  : 'groups.html#/groups';

window.location.replace(target);
