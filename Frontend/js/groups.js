/**
 * Groups page: list, create, join, and group detail.
 *
 * Routes are hash based so the app stays a static multi-page PWA:
 *   #/groups          group list
 *   #/groups/{id}     group detail
 *   #/join/{code}     group list with the join dialog pre-filled
 *
 * The page talks to the authenticated `/groups` API. A `401` on any call clears
 * the local token and sends the visitor through the login flow, preserving the
 * route they were trying to open.
 */

import {
  ApiError,
  createGroup,
  getGroup,
  joinGroup,
  listGroups,
} from './api.js';
import { clearAuthToken } from './auth.js';
import { initShell } from './shell.js';

const FA_NUMBER = new Intl.NumberFormat('fa-IR');
const MAX_GROUP_NAME_LENGTH = 100;
const LIST_HASH = '#/groups';

const MESSAGES = {
  nameRequired: 'نام گروه را وارد کنید.',
  nameTooLong: `نام گروه باید حداکثر ${MAX_GROUP_NAME_LENGTH} نویسه باشد.`,
  codeRequired: 'کد دعوت را وارد کنید.',
  created: 'گروه ساخته شد.',
  loadFailed: 'گروه‌ها بارگذاری نشدند. اتصال را بررسی کنید و دوباره تلاش کنید.',
  createFailed: 'ساخت گروه ممکن نشد. دوباره تلاش کنید.',
  joinFailed: 'پیوستن به گروه ممکن نشد. دوباره تلاش کنید.',
  invalidInvite: 'کد دعوت معتبر نیست یا منقضی شده است.',
  groupNotFound: 'این گروه وجود ندارد یا شما عضو آن نیستید.',
  serverError: 'سرور موقتاً در دسترس نیست. کمی بعد دوباره تلاش کنید.',
};

const refs = {};
const state = {
  groups: [],
  groupsLoaded: false,
  groupsLoading: false,
  listRequestId: 0,
  detailId: '',
  detailRequestId: 0,
  joinFromRoute: false,
  redirecting: false,
};

initShell();
initGroups();

function initGroups() {
  refs.listView = document.querySelector('[data-view="list"]');
  refs.detailView = document.querySelector('[data-view="detail"]');
  refs.groupList = document.querySelector('[data-group-list]');
  refs.loading = document.querySelector('[data-groups-loading]');
  refs.listError = document.querySelector('[data-groups-error]');
  refs.listErrorMessage = document.querySelector('[data-groups-error-message]');
  refs.empty = document.querySelector('[data-groups-empty]');
  refs.groupsStatus = document.querySelector('[data-groups-status]');
  refs.retry = document.querySelector('[data-retry]');

  refs.createDialog = document.querySelector('[data-create-dialog]');
  refs.createForm = document.querySelector('[data-create-form]');
  refs.createName = document.querySelector('#create-group-name');
  refs.createError = document.querySelector('[data-create-error]');
  refs.createSubmit = document.querySelector('[data-create-submit]');

  refs.joinDialog = document.querySelector('[data-join-dialog]');
  refs.joinForm = document.querySelector('[data-join-form]');
  refs.joinCode = document.querySelector('#join-code');
  refs.joinError = document.querySelector('[data-join-error]');
  refs.joinSubmit = document.querySelector('[data-join-submit]');

  refs.detailLoading = document.querySelector('[data-detail-loading]');
  refs.detailError = document.querySelector('[data-detail-error]');
  refs.detailErrorTitle = document.querySelector('[data-detail-error-title]');
  refs.detailErrorMessage = document.querySelector('[data-detail-error-message]');
  refs.detailContent = document.querySelector('[data-detail-content]');
  refs.detailRetry = document.querySelector('[data-detail-retry]');
  refs.detailName = document.querySelector('[data-detail-name]');
  refs.detailMeta = document.querySelector('[data-detail-meta]');
  refs.detailInitials = document.querySelector('[data-detail-initials]');
  refs.detailMembers = document.querySelector('[data-detail-members]');
  refs.detailCreated = document.querySelector('[data-detail-created]');
  refs.detailId = document.querySelector('[data-detail-id]');
  refs.detailMembersNote = document.querySelector('[data-detail-members-note]');

  if (!refs.listView || !refs.detailView || !refs.groupList) return;

  bindEvents();
  normaliseInitialRoute();
  route();
}

function bindEvents() {
  document.querySelectorAll('[data-open-create], [data-empty-create]').forEach((button) => {
    button.addEventListener('click', openCreateDialog);
  });
  document
    .querySelectorAll('[data-open-join], [data-empty-join]')
    .forEach((button) => {
      button.addEventListener('click', () => openJoinDialog(''));
    });
  document
    .querySelectorAll('[data-close-create]')
    .forEach((button) => button.addEventListener('click', closeCreateDialog));
  document
    .querySelectorAll('[data-close-join]')
    .forEach((button) => button.addEventListener('click', closeJoinDialog));

  refs.retry?.addEventListener('click', () => loadGroups({ force: true }));
  refs.detailRetry?.addEventListener('click', () => {
    if (state.detailId) loadDetail(state.detailId);
  });

  refs.createForm?.addEventListener('submit', onCreateSubmit);
  refs.joinForm?.addEventListener('submit', onJoinSubmit);
  refs.joinDialog?.addEventListener('close', onJoinDialogClosed);

  refs.createName?.addEventListener('input', () => {
    if (refs.createName.getAttribute('aria-invalid') === 'true') {
      setFieldError(refs.createName, refs.createError, '');
    }
  });
  refs.joinCode?.addEventListener('input', () => {
    if (refs.joinCode.getAttribute('aria-invalid') === 'true') {
      setFieldError(refs.joinCode, refs.joinError, '');
    }
  });

  window.addEventListener('hashchange', route);
}

function normaliseInitialRoute() {
  const hash = window.location.hash;
  if (!hash || hash === '#') {
    history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}${LIST_HASH}`,
    );
  }
}

function route() {
  const parsed = parseRoute();

  if (parsed.name === 'unknown') {
    replaceRoute(LIST_HASH);
    return;
  }

  if (parsed.name === 'join') {
    showListView();
    ensureGroupsLoaded();
    openJoinDialog(parsed.code, { fromRoute: true });
    return;
  }

  if (parsed.name === 'detail') {
    closeDialogs();
    showDetailView(parsed.id);
    return;
  }

  closeDialogs();
  showListView();
  ensureGroupsLoaded();
}

function parseRoute() {
  const hash = window.location.hash;

  if (hash === LIST_HASH || hash === `${LIST_HASH}/`) {
    return { name: 'list' };
  }

  const joinMatch = /^#\/join\/([^/]+)\/?$/.exec(hash);
  if (joinMatch) {
    return { name: 'join', code: safeDecode(joinMatch[1]).trim() };
  }

  const detailMatch = /^#\/groups\/([^/]+)\/?$/.exec(hash);
  if (detailMatch) {
    return { name: 'detail', id: safeDecode(detailMatch[1]).trim() };
  }

  return { name: 'unknown' };
}

function replaceRoute(hash) {
  history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}${hash}`,
  );
  route();
}

function navigateTo(hash) {
  if (window.location.hash === hash) {
    route();
    return;
  }
  window.location.hash = hash;
}

function showListView() {
  refs.listView.hidden = false;
  refs.detailView.hidden = true;
  document.title = 'گروه‌ها · دنگی';
}

function showDetailView(id) {
  refs.listView.hidden = true;
  refs.detailView.hidden = false;
  state.detailId = id;

  if (!id) {
    route();
    return;
  }

  loadDetail(id);
}

function ensureGroupsLoaded() {
  if (state.groupsLoaded || state.groupsLoading) return;
  loadGroups();
}

function loadGroups({ force = false } = {}) {
  if (state.groupsLoading) return;
  if (state.groupsLoaded && !force) return;

  const requestId = ++state.listRequestId;
  state.groupsLoading = true;
  setGroupsStatus('');

  if (!state.groupsLoaded) {
    setListState('loading');
  }

  listGroups()
    .then((data) => {
      if (requestId !== state.listRequestId) return;

      state.groups = Array.isArray(data) ? data : [];
      state.groupsLoaded = true;
      renderGroups();
    })
    .catch((error) => {
      if (requestId !== state.listRequestId) return;
      if (handleUnauthorized(error)) return;

      setListState('error');
      if (refs.listErrorMessage) {
        refs.listErrorMessage.textContent = listErrorMessage(error);
      }
    })
    .finally(() => {
      if (requestId === state.listRequestId) {
        state.groupsLoading = false;
      }
    });
}

function renderGroups() {
  if (!refs.groupList) return;

  refs.groupList.replaceChildren(
    ...state.groups.map((group) => createGroupItem(group)),
  );

  if (state.groups.length === 0) {
    setListState('empty');
    return;
  }

  setListState('list');
}

function createGroupItem(group) {
  const item = document.createElement('li');
  const link = document.createElement('a');
  const name = group?.name || 'گروه بدون نام';
  const memberCount = getMemberCount(group);

  link.className = 'group-card';
  link.href = `groups.html#/groups/${encodeURIComponent(group?.id ?? '')}`;
  link.dataset.groupId = String(group?.id ?? '');
  link.setAttribute(
    'aria-label',
    `${name}، ${memberLabel(memberCount)}`,
  );

  const avatar = document.createElement('span');
  avatar.className = 'avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = initialsFor(name) || 'گ';

  const text = document.createElement('span');
  text.className = 'group-card-text';

  const nameElement = document.createElement('span');
  nameElement.className = 'group-card-name';
  nameElement.textContent = name;

  const metaElement = document.createElement('span');
  metaElement.className = 'group-card-meta';
  metaElement.textContent = memberLabel(memberCount);

  text.append(nameElement, metaElement);

  const chevron = document.createElement('span');
  chevron.className = 'chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '‹';

  link.append(avatar, text, chevron);
  item.append(link);
  return item;
}

function setListState(mode) {
  if (!refs.loading) return;
  refs.loading.hidden = mode !== 'loading';
  refs.listError.hidden = mode !== 'error';
  refs.empty.hidden = mode !== 'empty';
  refs.groupList.hidden = mode !== 'list';
}

function loadDetail(id) {
  const requestId = ++state.detailRequestId;
  state.detailId = id;

  refs.detailLoading.hidden = false;
  refs.detailError.hidden = true;
  refs.detailContent.hidden = true;

  getGroup(id)
    .then((group) => {
      if (requestId !== state.detailRequestId) return;
      if (!group || !group.id) {
        throw new ApiError(MESSAGES.groupNotFound, { status: 404 });
      }

      renderDetail(group);
      refs.detailLoading.hidden = true;
      refs.detailError.hidden = true;
      refs.detailContent.hidden = false;
    })
    .catch((error) => {
      if (requestId !== state.detailRequestId) return;
      if (handleUnauthorized(error)) return;

      renderDetailError(error);
      refs.detailLoading.hidden = true;
      refs.detailError.hidden = false;
      refs.detailContent.hidden = true;
    });
}

function renderDetail(group) {
  const name = group.name || 'گروه بدون نام';
  const memberCount = getMemberCount(group);

  refs.detailName.textContent = name;
  refs.detailInitials.textContent = initialsFor(name) || 'گ';
  refs.detailMeta.textContent = memberLabel(memberCount);
  refs.detailMembers.textContent = FA_NUMBER.format(memberCount);
  refs.detailCreated.textContent = formatDate(group.createdAt);
  refs.detailId.textContent = group.id;
  refs.detailMembersNote.textContent =
    memberCount <= 1
      ? 'شما تنها عضو این گروه هستید. برای دعوت دوستان از کد دعوت گروه استفاده کنید.'
      : `${FA_NUMBER.format(memberCount)} نفر در این گروه خرج‌ها را شریک می‌شوند.`;
  document.title = `${name} · دنگی`;
}

function renderDetailError(error) {
  const status = error instanceof ApiError ? error.status : 0;

  if (status === 404 || status === 403) {
    refs.detailErrorTitle.textContent = 'گروه پیدا نشد';
    refs.detailErrorMessage.textContent = MESSAGES.groupNotFound;
    return;
  }

  if (status >= 500) {
    refs.detailErrorTitle.textContent = 'گروه بارگذاری نشد';
    refs.detailErrorMessage.textContent = MESSAGES.serverError;
    return;
  }

  refs.detailErrorTitle.textContent = 'گروه بارگذاری نشد';
  refs.detailErrorMessage.textContent =
    error instanceof Error && error.message
      ? error.message
      : MESSAGES.loadFailed;
}

function openCreateDialog() {
  refs.createForm?.reset();
  setFieldError(refs.createName, refs.createError, '');
  setGroupsStatus('');
  showDialog(refs.createDialog);
  refs.createName?.focus();
}

function closeCreateDialog() {
  hideDialog(refs.createDialog);
}

function openJoinDialog(code, { fromRoute = false } = {}) {
  state.joinFromRoute = fromRoute;
  refs.joinForm?.reset();
  setFieldError(refs.joinCode, refs.joinError, '');
  if (refs.joinCode) refs.joinCode.value = code || '';
  showDialog(refs.joinDialog);

  refs.joinCode?.focus();
  if (code) refs.joinCode?.select();
}

function closeJoinDialog() {
  if (!refs.joinDialog) return;

  if (typeof refs.joinDialog.close === 'function' && refs.joinDialog.open) {
    refs.joinDialog.close();
  } else {
    refs.joinDialog.removeAttribute('open');
    onJoinDialogClosed();
  }
}

function onJoinDialogClosed() {
  if (!state.joinFromRoute) return;
  state.joinFromRoute = false;

  if (/^#\/join\//.test(window.location.hash)) {
    replaceRoute(LIST_HASH);
  }
}

function closeDialogs() {
  state.joinFromRoute = false;
  hideDialog(refs.createDialog);
  hideDialog(refs.joinDialog);
}

function showDialog(dialog) {
  if (!dialog) return;
  if (dialog.open) return;
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
}

function hideDialog(dialog) {
  if (!dialog || !dialog.open) return;
  if (typeof dialog.close === 'function') {
    dialog.close();
  } else {
    dialog.removeAttribute('open');
  }
}

async function onCreateSubmit(event) {
  event.preventDefault();
  if (refs.createSubmit?.disabled) return;

  const name = refs.createName?.value.trim() ?? '';

  if (!name) {
    setFieldError(refs.createName, refs.createError, MESSAGES.nameRequired);
    refs.createName?.focus();
    return;
  }

  if (name.length > MAX_GROUP_NAME_LENGTH) {
    setFieldError(refs.createName, refs.createError, MESSAGES.nameTooLong);
    refs.createName?.focus();
    return;
  }

  setFieldError(refs.createName, refs.createError, '');
  setBusy(refs.createSubmit, true, 'در حال ساخت…', 'ساختن گروه');

  try {
    const group = await createGroup(name);
    if (!group || !group.id) {
      throw new Error(MESSAGES.createFailed);
    }

    state.groups = [
      group,
      ...state.groups.filter((item) => item.id !== group.id),
    ];
    state.groupsLoaded = true;
    renderGroups();

    hideDialog(refs.createDialog);
    refs.createForm?.reset();
    setGroupsStatus(MESSAGES.created, 'success');
  } catch (error) {
    if (handleUnauthorized(error)) return;
    setFieldError(
      refs.createName,
      refs.createError,
      actionErrorMessage(error, 'create'),
    );
  } finally {
    setBusy(refs.createSubmit, false, 'در حال ساخت…', 'ساختن گروه');
  }
}

async function onJoinSubmit(event) {
  event.preventDefault();
  if (refs.joinSubmit?.disabled) return;

  const inviteCode = refs.joinCode?.value.trim() ?? '';

  if (!inviteCode) {
    setFieldError(refs.joinCode, refs.joinError, MESSAGES.codeRequired);
    refs.joinCode?.focus();
    return;
  }

  setFieldError(refs.joinCode, refs.joinError, '');
  setBusy(refs.joinSubmit, true, 'در حال پیوستن…', 'پیوستن به گروه');

  try {
    const group = await joinGroup(inviteCode);
    if (!group || !group.id) {
      throw new Error(MESSAGES.joinFailed);
    }

    if (state.groupsLoaded) {
      state.groups = [
        group,
        ...state.groups.filter((item) => item.id !== group.id),
      ];
      renderGroups();
    }

    state.joinFromRoute = false;
    hideDialog(refs.joinDialog);
    refs.joinForm?.reset();
    setGroupsStatus('', '');
    navigateTo(`#/groups/${encodeURIComponent(group.id)}`);
  } catch (error) {
    if (handleUnauthorized(error)) return;
    setFieldError(
      refs.joinCode,
      refs.joinError,
      actionErrorMessage(error, 'join'),
    );
  } finally {
    setBusy(refs.joinSubmit, false, 'در حال پیوستن…', 'پیوستن به گروه');
  }
}

function handleUnauthorized(error) {
  if (!(error instanceof ApiError) || error.status !== 401) return false;
  if (state.redirecting) return true;

  state.redirecting = true;
  clearAuthToken();

  const hash = window.location.hash.startsWith('#/')
    ? window.location.hash
    : LIST_HASH;
  const next = `groups.html${hash}`;
  window.location.replace(`login.html?next=${encodeURIComponent(next)}`);
  return true;
}

function actionErrorMessage(error, action) {
  const fallback =
    action === 'create' ? MESSAGES.createFailed : MESSAGES.joinFailed;

  if (error instanceof ApiError) {
    if (error.status === 0) return error.message;
    if (error.status === 404 && action === 'join') return MESSAGES.invalidInvite;
    if (error.status === 400) {
      return action === 'create'
        ? MESSAGES.nameTooLong
        : MESSAGES.invalidInvite;
    }
    if (error.status === 409) return fallback;
    if (error.status >= 500) return MESSAGES.serverError;
  }

  return error instanceof Error && error.message ? error.message : fallback;
}

function listErrorMessage(error) {
  if (error instanceof ApiError) {
    if (error.status === 0) return error.message;
    if (error.status >= 500) return MESSAGES.serverError;
  }

  return error instanceof Error && error.message
    ? error.message
    : MESSAGES.loadFailed;
}

function setFieldError(input, target, message) {
  if (!target) return;
  target.textContent = message;

  if (!input) return;
  if (message) {
    input.setAttribute('aria-invalid', 'true');
  } else {
    input.removeAttribute('aria-invalid');
  }
}

function setBusy(button, busy, busyLabel, idleLabel) {
  if (!button) return;
  button.disabled = busy;
  button.textContent = busy ? busyLabel : idleLabel;
}

function setGroupsStatus(message, status = '') {
  if (!refs.groupsStatus) return;
  refs.groupsStatus.textContent = message;
  if (status) {
    refs.groupsStatus.dataset.state = status;
  } else {
    delete refs.groupsStatus.dataset.state;
  }
}

function getMemberCount(group) {
  if (Array.isArray(group?.memberIds)) return group.memberIds.length;

  const count = Number(group?.memberCount ?? group?.membersCount);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function memberLabel(count) {
  return count === 0 ? 'بدون عضو' : `${FA_NUMBER.format(count)} عضو`;
}

function initialsFor(name) {
  return Array.from(String(name ?? '').trim()).slice(0, 2).join('').toUpperCase();
}

function formatDate(value) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  try {
    return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
