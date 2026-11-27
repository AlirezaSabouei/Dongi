/**
 * Groups page: list, create, join, and group detail.
 *
 * Routes are hash based so the app stays a static multi-page PWA:
 *   #/groups          group list
 *   #/groups/{id}     group detail (members, expenses, invite)
 *   #/join/{code}     group list with the join dialog pre-filled
 *
 * The page talks to the authenticated `/groups` API. A `401` on any call clears
 * the local token and sends the visitor through the login flow, preserving the
 * route they were trying to open.
 */

import {
  ApiError,
  createGroup,
  createGroupExpense,
  getGroup,
  getGroupInvite,
  joinGroup,
  listGroupExpenses,
  listGroups,
} from './api.js';
import { clearAuthToken, getAuthUserId } from './auth.js';
import {
  calculateEqualSplit,
  formatExpenseAmount,
  normalizeMemberIds,
  parseRialAmount,
  renderExpenseList,
  sumExpenseAmounts,
  toExpenseArray,
} from './expenses.js';
import { initShell } from './shell.js';

const FA_NUMBER = new Intl.NumberFormat('fa-IR');
const MAX_GROUP_NAME_LENGTH = 100;
const MAX_EXPENSE_TITLE_LENGTH = 200;
const MAX_EXPENSE_DESCRIPTION_LENGTH = 1000;
const LIST_HASH = '#/groups';
const TOAST_DURATION_MS = 5000;

/**
 * The expenses endpoint is part of the backend group API, but an older
 * deployment may not expose it yet. A missing endpoint (404/405/501) should
 * degrade to the empty state instead of breaking the group page.
 */
const EXPENSES_UNAVAILABLE_STATUSES = new Set([404, 405, 501]);

const MESSAGES = {
  nameRequired: 'نام گروه را وارد کنید.',
  nameTooLong: `نام گروه باید حداکثر ${MAX_GROUP_NAME_LENGTH} نویسه باشد.`,
  codeRequired: 'کد دعوت را وارد کنید.',
  created: 'گروه ساخته شد.',
  loadFailed: 'گروه‌ها بارگذاری نشدند. اتصال را بررسی کنید و دوباره تلاش کنید.',
  createFailed: 'ساخت گروه ممکن نشد. دوباره تلاش کنید.',
  joinFailed: 'پیوستن به گروه ممکن نشد. دوباره تلاش کنید.',
  invalidInvite: 'کد دعوت معتبر نیست یا منقضی شده است.',
  notAMember: 'شما عضو این گروه نیستید',
  notAMemberHint:
    'برای دیدن اعضا و هزینه‌های این گروه باید عضو آن باشید. از میزبان بخواهید لینک دعوت را برایتان بفرستد.',
  groupNotFound: 'گروه پیدا نشد',
  groupNotFoundHint: 'این گروه وجود ندارد یا حذف شده است.',
  detailLoadFailed: 'گروه بارگذاری نشد',
  serverError: 'سرور موقتاً در دسترس نیست. کمی بعد دوباره تلاش کنید.',
  expensesLoadFailed: 'فهرست هزینه‌ها بارگذاری نشد. دوباره تلاش کنید.',
  inviteFailed: 'ساخت لینک دعوت ممکن نشد. دوباره تلاش کنید.',
  inviteUnavailable: 'لینک دعوت در پاسخ سرور پیدا نشد.',
  inviteShared: 'دعوت‌نامه آمادهٔ ارسال شد.',
  inviteCopied: 'لینک دعوت کپی شد؛ آن را برای دوستانتان بفرستید.',
  inviteCopyFailed: 'کپی لینک دعوت ممکن نشد. اتصال مرورگر را بررسی کنید.',
  inviteNotMember: 'شما عضو این گروه نیستید و نمی‌توانید دعوت بفرستید.',
  inviteGroupGone: 'این گروه دیگر وجود ندارد.',
  expenseTitleRequired: 'عنوان هزینه را وارد کنید.',
  expenseTitleTooLong: `عنوان هزینه باید حداکثر ${MAX_EXPENSE_TITLE_LENGTH} نویسه باشد.`,
  expenseDescriptionTooLong: `توضیح باید حداکثر ${MAX_EXPENSE_DESCRIPTION_LENGTH} نویسه باشد.`,
  expenseAmountInvalid: 'مبلغ باید عدد صحیح بزرگ‌تر از صفر باشد.',
  expenseMembersRequired: 'حداقل یک عضو را برای تقسیم انتخاب کنید.',
  expenseCreated: 'هزینه ثبت شد.',
  expenseCreateFailed: 'ثبت هزینه ممکن نشد. دوباره تلاش کنید.',
  expenseForbidden: 'شما اجازهٔ ثبت هزینه در این گروه را ندارید.',
  expenseUserUnknown:
    'شناسهٔ کاربر جاری پیدا نشد. لطفاً خارج شوید و دوباره وارد شوید.',
  expensePreviewHint: 'برای دیدن تقسیم، مبلغ و حداقل یک عضو را مشخص کنید.',
};

const refs = {};
const state = {
  groups: [],
  groupsLoaded: false,
  groupsLoading: false,
  listRequestId: 0,
  detailId: '',
  detailGroup: null,
  detailMembers: [],
  detailRequestId: 0,
  expensesRequestId: 0,
  currentUserId: null,
  joinFromRoute: false,
  redirecting: false,
  expenseMembers: [],
  expensePayerId: '',
};

let toastTimer = 0;

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
  refs.detailErrorBack = document.querySelector('[data-detail-error-back]');
  refs.detailContent = document.querySelector('[data-detail-content]');
  refs.detailRetry = document.querySelector('[data-detail-retry]');
  refs.detailName = document.querySelector('[data-detail-name]');
  refs.detailMeta = document.querySelector('[data-detail-meta]');
  refs.detailInitials = document.querySelector('[data-detail-initials]');
  refs.detailMembers = document.querySelector('[data-detail-members]');
  refs.detailMemberList = document.querySelector('[data-detail-member-list]');
  refs.detailMembersNote = document.querySelector('[data-detail-members-note]');
  refs.invite = document.querySelector('[data-invite]');

  refs.expenseList = document.querySelector('[data-expense-list]');
  refs.expensesLoading = document.querySelector('[data-expenses-loading]');
  refs.expensesError = document.querySelector('[data-expenses-error]');
  refs.expensesErrorMessage = document.querySelector(
    '[data-expenses-error-message]',
  );
  refs.expensesEmpty = document.querySelector('[data-expenses-empty]');
  refs.expensesCount = document.querySelector('[data-expenses-count]');
  refs.expensesRetry = document.querySelector('[data-expenses-retry]');
  refs.expenseCount = document.querySelector('[data-detail-expense-count]');
  refs.expenseTotal = document.querySelector('[data-detail-expense-total]');

  refs.openExpense = document.querySelector('[data-open-expense]');
  refs.expenseDialog = document.querySelector('[data-expense-dialog]');
  refs.expenseForm = document.querySelector('[data-expense-form]');
  refs.expenseTitle = document.querySelector('#expense-title-input');
  refs.expenseDescription = document.querySelector('#expense-description');
  refs.expenseAmount = document.querySelector('#expense-amount');
  refs.expenseTitleError = document.querySelector('[data-expense-title-error]');
  refs.expenseDescriptionError = document.querySelector(
    '[data-expense-description-error]',
  );
  refs.expenseAmountError = document.querySelector('[data-expense-amount-error]');
  refs.expenseMembers = document.querySelector('[data-expense-members]');
  refs.expenseMembersError = document.querySelector(
    '[data-expense-members-error]',
  );
  refs.expensePreview = document.querySelector('[data-expense-preview]');
  refs.expenseFormError = document.querySelector('[data-expense-error]');
  refs.expenseSubmit = document.querySelector('[data-expense-submit]');

  refs.toast = document.querySelector('[data-toast]');

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
  document
    .querySelectorAll('[data-close-expense]')
    .forEach((button) => button.addEventListener('click', closeExpenseDialog));

  refs.openExpense?.addEventListener('click', openExpenseDialog);

  refs.retry?.addEventListener('click', () => loadGroups({ force: true }));
  refs.detailRetry?.addEventListener('click', () => {
    if (state.detailId) loadDetail(state.detailId);
  });
  refs.expensesRetry?.addEventListener('click', () => {
    if (state.detailId) loadExpenses(state.detailId);
  });
  refs.invite?.addEventListener('click', onInviteClick);

  refs.createForm?.addEventListener('submit', onCreateSubmit);
  refs.joinForm?.addEventListener('submit', onJoinSubmit);
  refs.expenseForm?.addEventListener('submit', onExpenseSubmit);
  refs.joinDialog?.addEventListener('close', onJoinDialogClosed);
  refs.expenseDialog?.addEventListener('close', resetExpenseErrors);

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

  refs.expenseTitle?.addEventListener('input', () => {
    if (refs.expenseTitle.getAttribute('aria-invalid') === 'true') {
      setFieldError(refs.expenseTitle, refs.expenseTitleError, '');
    }
  });
  refs.expenseDescription?.addEventListener('input', () => {
    if (refs.expenseDescription.getAttribute('aria-invalid') === 'true') {
      setFieldError(
        refs.expenseDescription,
        refs.expenseDescriptionError,
        '',
      );
    }
  });
  refs.expenseAmount?.addEventListener('input', () => {
    if (refs.expenseAmount.getAttribute('aria-invalid') === 'true') {
      setFieldError(refs.expenseAmount, refs.expenseAmountError, '');
    }
    updateExpensePreview();
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
  if (state.detailId) {
    state.detailId = '';
    state.detailRequestId += 1;
    state.expensesRequestId += 1;
  }

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
  state.detailGroup = null;
  state.detailMembers = [];
  state.currentUserId = getAuthUserId();
  state.expensesRequestId += 1;

  refs.detailLoading.hidden = false;
  refs.detailError.hidden = true;
  refs.detailContent.hidden = true;

  resetExpenseSummary();
  setExpensesState('loading');

  getGroup(id)
    .then((group) => {
      if (requestId !== state.detailRequestId) return false;
      if (!group || !group.id) {
        throw new ApiError(MESSAGES.groupNotFound, { status: 404 });
      }

      renderDetail(group);
      refs.detailLoading.hidden = true;
      refs.detailError.hidden = true;
      refs.detailContent.hidden = false;
      return true;
    })
    .then((shouldLoadExpenses) => {
      if (!shouldLoadExpenses || requestId !== state.detailRequestId) return;
      loadExpenses(id);
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
  const members = getMembers(group);
  const memberCount = members.length;
  const createdAt = formatDate(group.createdAt);

  state.detailGroup = group;
  state.detailMembers = members;

  refs.detailName.textContent = name;
  refs.detailInitials.textContent = initialsFor(name) || 'گ';
  refs.detailMeta.textContent = createdAt
    ? `${memberLabel(memberCount)} · ساخته‌شده در ${createdAt}`
    : memberLabel(memberCount);
  refs.detailMembers.textContent = FA_NUMBER.format(memberCount);

  renderMemberList(members, group.ownerId, state.currentUserId);

  refs.detailMembersNote.hidden = memberCount > 1;
  refs.detailMembersNote.textContent =
    memberCount === 0
      ? 'هنوز عضوی در این گروه نیست.'
      : 'شما تنها عضو این گروه هستید. برای دعوت دوستان از دکمهٔ «دعوت دوستان» استفاده کنید.';

  document.title = `${name} · دنگی`;
}

function getMembers(group) {
  const source =
    Array.isArray(group?.members) && group.members.length > 0
      ? group.members
      : Array.isArray(group?.memberIds)
        ? group.memberIds
        : [];

  const members = [];
  const seen = new Set();

  for (const entry of source) {
    const rawId =
      typeof entry === 'string' ? entry : entry?.id ?? entry?.userId;
    const id = typeof rawId === 'string' ? rawId.trim() : String(rawId ?? '').trim();
    if (!id || seen.has(id)) continue;

    seen.add(id);
    members.push(
      typeof entry === 'object' && entry !== null
        ? { ...entry, id }
        : { id },
    );
  }

  return members;
}

function renderMemberList(members, ownerId, currentUserId) {
  if (!refs.detailMemberList) return;

  const owner = String(ownerId ?? '');

  refs.detailMemberList.replaceChildren(
    ...members.map((member, index) => {
      const id = String(member.id);
      const isSelf = Boolean(currentUserId) && id === String(currentUserId);
      const isOwner = Boolean(owner) && id === owner;
      const label = memberDisplayName(member, index, isSelf);
      const item = document.createElement('li');
      item.className = 'member-chip';
      item.dataset.memberId = id;
      if (isSelf) item.dataset.self = 'true';
      if (isOwner) item.dataset.owner = 'true';

      const avatar = document.createElement('span');
      avatar.className = 'avatar avatar-sm';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = memberInitials(member, index);

      const name = document.createElement('span');
      name.className = 'member-name';
      name.textContent = label;

      item.append(avatar, name);

      if (isOwner) {
        const badge = document.createElement('span');
        badge.className = 'member-badge';
        badge.textContent = 'سازنده';
        item.append(badge);
      }

      item.title = label;
      item.setAttribute('aria-label', isOwner ? `${label}، سازندهٔ گروه` : label);
      return item;
    }),
  );
}

function memberDisplayName(member, index, isSelf) {
  const name =
    typeof member?.name === 'string' && member.name.trim()
      ? member.name.trim()
      : typeof member?.phone === 'string' && member.phone.trim()
        ? member.phone.trim()
        : '';

  if (name) return isSelf ? `${name} (شما)` : name;
  return isSelf ? 'شما' : `عضو ${FA_NUMBER.format(index + 1)}`;
}

function memberInitials(member, index) {
  const name =
    typeof member?.name === 'string' && member.name.trim()
      ? member.name.trim()
      : '';

  return name ? initialsFor(name) : FA_NUMBER.format(index + 1);
}

function loadExpenses(groupId) {
  if (!groupId || groupId !== state.detailId) return;

  const requestId = ++state.expensesRequestId;
  setExpensesState('loading');
  resetExpenseSummary();

  listGroupExpenses(groupId)
    .then((data) => {
      if (requestId !== state.expensesRequestId) return;
      if (groupId !== state.detailId) return;

      const expenses = toExpenseArray(data);
      renderExpenses(expenses);
      setExpensesState(expenses.length > 0 ? 'list' : 'empty');
    })
    .catch((error) => {
      if (requestId !== state.expensesRequestId) return;
      if (handleUnauthorized(error)) return;

      if (isExpensesUnavailable(error)) {
        renderExpenses([]);
        setExpensesState('empty');
        return;
      }

      setExpensesState('error');
      if (refs.expensesErrorMessage) {
        refs.expensesErrorMessage.textContent = expensesErrorMessage(error);
      }
    });
}

function renderExpenses(expenses) {
  const items = toExpenseArray(expenses);

  renderExpenseList(refs.expenseList, items, {
    payerLabel: (expense) => payerLabelFor(expense?.payerId),
  });

  updateExpenseSummary(items);
}

function payerLabelFor(payerId) {
  const id = typeof payerId === 'string' ? payerId.trim() : '';
  if (!id) return '';

  if (state.currentUserId && id === String(state.currentUserId)) return 'شما';

  const index = state.detailMembers.findIndex(
    (member) => String(member.id) === id,
  );

  if (index >= 0) {
    const member = state.detailMembers[index];
    const name =
      typeof member.name === 'string' && member.name.trim()
        ? member.name.trim()
        : typeof member.phone === 'string' && member.phone.trim()
          ? member.phone.trim()
          : '';
    if (name) return name;
    return `عضو ${FA_NUMBER.format(index + 1)}`;
  }

  return id.length <= 6 ? id.toUpperCase() : id.slice(-6).toUpperCase();
}

function setExpensesState(mode) {
  refs.expensesLoading.hidden = mode !== 'loading';
  refs.expensesError.hidden = mode !== 'error';
  refs.expensesEmpty.hidden = mode !== 'empty';
  refs.expenseList.hidden = mode !== 'list';
}

function resetExpenseSummary() {
  refs.expenseCount.textContent = '—';
  refs.expenseTotal.textContent = '—';
  refs.expensesCount.textContent = '';
}

function updateExpenseSummary(expenses) {
  const items = toExpenseArray(expenses);
  const total = sumExpenseAmounts(items);

  refs.expenseCount.textContent = FA_NUMBER.format(items.length);
  refs.expenseTotal.textContent = formatExpenseAmount(total ?? 0);
  refs.expensesCount.textContent =
    items.length > 0 ? `${FA_NUMBER.format(items.length)} مورد` : '';
}

function renderDetailError(error) {
  const status = error instanceof ApiError ? error.status : 0;

  refs.detailRetry.hidden = false;
  refs.detailErrorBack.textContent = 'بازگشت به گروه‌ها';
  document.title = 'گروه · دنگی';

  if (status === 403) {
    refs.detailErrorTitle.textContent = MESSAGES.notAMember;
    refs.detailErrorMessage.textContent = MESSAGES.notAMemberHint;
    refs.detailRetry.hidden = true;
    return;
  }

  if (status === 404) {
    refs.detailErrorTitle.textContent = MESSAGES.groupNotFound;
    refs.detailErrorMessage.textContent = MESSAGES.groupNotFoundHint;
    refs.detailRetry.hidden = true;
    return;
  }

  refs.detailErrorTitle.textContent = MESSAGES.detailLoadFailed;

  if (status >= 500) {
    refs.detailErrorMessage.textContent = MESSAGES.serverError;
    return;
  }

  refs.detailErrorMessage.textContent =
    error instanceof Error && error.message
      ? error.message
      : MESSAGES.loadFailed;
}

async function onInviteClick() {
  if (!state.detailId || refs.invite?.disabled) return;

  setBusy(refs.invite, true, 'در حال آماده‌سازی…', 'دعوت دوستان');

  try {
    const invite = await getGroupInvite(state.detailId);
    const url = resolveInviteUrl(invite);

    if (!url) {
      showToast(MESSAGES.inviteUnavailable, 'error');
      return;
    }

    await shareOrCopyInvite(url, state.detailGroup?.name || 'گروه');
  } catch (error) {
    if (handleUnauthorized(error)) return;
    showToast(inviteErrorMessage(error), 'error');
  } finally {
    setBusy(refs.invite, false, 'در حال آماده‌سازی…', 'دعوت دوستان');
  }
}

function resolveInviteUrl(invite) {
  const rawUrl =
    typeof invite?.joinUrl === 'string' ? invite.joinUrl.trim() : '';
  if (rawUrl) {
    try {
      return new URL(rawUrl, window.location.href).href;
    } catch {
      return rawUrl;
    }
  }

  const inviteCode =
    typeof invite?.inviteCode === 'string' ? invite.inviteCode.trim() : '';
  if (!inviteCode) return '';

  return new URL(
    `groups.html#/join/${encodeURIComponent(inviteCode)}`,
    window.location.href,
  ).href;
}

async function shareOrCopyInvite(url, groupName) {
  const shareData = {
    title: `${groupName} · دنگی`,
    text: `به گروه «${groupName}» در دنگی بپیوندید.`,
    url,
  };

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share(shareData);
      showToast(MESSAGES.inviteShared, 'success');
      return;
    } catch (error) {
      // Closing the share sheet is not an error; fall through for real
      // failures so the link can still be copied.
      if (error && error.name === 'AbortError') return;
    }
  }

  try {
    await copyText(url);
    showToast(MESSAGES.inviteCopied, 'success');
  } catch {
    showToast(`${MESSAGES.inviteCopyFailed} ${url}`, 'error');
  }
}

async function copyText(text) {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      /* Fall back to the selection-based copy path below. */
    }
  }

  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  area.setSelectionRange(0, text.length);

  const copied =
    typeof document.execCommand === 'function' && document.execCommand('copy');
  area.remove();

  if (!copied) throw new Error('Clipboard is not available.');
}

function inviteErrorMessage(error) {
  if (error instanceof ApiError) {
    if (error.status === 0) return error.message;
    if (error.status === 403) return MESSAGES.inviteNotMember;
    if (error.status === 404) return MESSAGES.inviteGroupGone;
    if (error.status >= 500) return MESSAGES.serverError;
  }

  return MESSAGES.inviteFailed;
}

function expensesErrorMessage(error) {
  if (error instanceof ApiError) {
    if (error.status === 0) return error.message;
    if (error.status >= 500) return MESSAGES.serverError;
  }

  return MESSAGES.expensesLoadFailed;
}

function isExpensesUnavailable(error) {
  return (
    error instanceof ApiError && EXPENSES_UNAVAILABLE_STATUSES.has(error.status)
  );
}

function showToast(message, tone = 'info') {
  if (!refs.toast) return;

  refs.toast.textContent = message;
  refs.toast.dataset.tone = tone;
  refs.toast.hidden = false;

  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    refs.toast.hidden = true;
  }, TOAST_DURATION_MS);
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
  hideDialog(refs.expenseDialog);
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

function openExpenseDialog() {
  if (!state.detailId || !state.detailGroup) return;

  const payerId = state.currentUserId;
  if (!payerId) {
    showToast(MESSAGES.expenseUserUnknown, 'error');
    return;
  }

  const members = state.detailMembers.slice();
  if (!members.some((member) => String(member.id) === payerId)) {
    // The signed-in user must always be selectable as the payer, even if the
    // group payload omitted them.
    members.push({ id: payerId });
  }

  state.expenseMembers = members;
  state.expensePayerId = payerId;

  refs.expenseForm?.reset();
  resetExpenseErrors();
  renderExpenseMembers();
  updateExpensePreview();
  showDialog(refs.expenseDialog);
  refs.expenseTitle?.focus();
}

function closeExpenseDialog() {
  hideDialog(refs.expenseDialog);
}

function renderExpenseMembers() {
  if (!refs.expenseMembers) return;

  const rows = state.expenseMembers.map((member, index) => {
    const id = String(member.id);
    const isPayer = id === state.expensePayerId;
    const isSelf =
      Boolean(state.currentUserId) && id === String(state.currentUserId);
    const label = memberDisplayName(member, index, isSelf);

    const row = document.createElement('li');
    row.className = 'member-option';
    row.dataset.memberId = id;
    if (isPayer) row.dataset.locked = 'true';

    const labelElement = document.createElement('label');
    labelElement.title = isPayer
      ? `${label} — پرداخت‌کننده (قابل حذف نیست)`
      : label;

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = id;
    input.checked = true;
    input.disabled = isPayer;
    input.dataset.memberId = id;
    input.setAttribute(
      'aria-label',
      isPayer ? `${label}، پرداخت‌کننده و قابل حذف نیست` : label,
    );
    input.addEventListener('change', () => {
      setExpenseMembersError('');
      updateExpensePreview();
    });

    const avatar = document.createElement('span');
    avatar.className = 'avatar avatar-sm';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = memberInitials(member, index);

    const name = document.createElement('span');
    name.className = 'member-option-name';
    name.textContent = label;

    labelElement.append(input, avatar, name);

    if (isPayer) {
      const badge = document.createElement('span');
      badge.className = 'member-option-badge';
      badge.textContent = 'پرداخت‌کننده';
      labelElement.append(badge);
    }

    row.append(labelElement);
    return row;
  });

  refs.expenseMembers.replaceChildren(...rows);
}

function getSelectedExpenseMemberIds() {
  if (!refs.expenseMembers) return [];

  const ids = Array.from(
    refs.expenseMembers.querySelectorAll('input[type="checkbox"]'),
  )
    .filter((input) => input.checked)
    .map((input) => input.value);

  // Defensive: the lock above should make this impossible, but the payer must
  // never fall out of the split.
  if (state.expensePayerId) ids.push(state.expensePayerId);

  return normalizeMemberIds(ids);
}

function updateExpensePreview() {
  if (!refs.expensePreview) return;

  const amount = parseRialAmount(refs.expenseAmount?.value);
  const memberIds = getSelectedExpenseMemberIds();
  const split = calculateEqualSplit(amount, memberIds);

  if (!split) {
    const hint = document.createElement('p');
    hint.className = 'split-preview-empty';
    hint.textContent = MESSAGES.expensePreviewHint;
    refs.expensePreview.replaceChildren(hint);
    return;
  }

  const shares = split.map((entry) => entry.share);
  const smallest = Math.min(...shares);
  const largest = Math.max(...shares);
  const shareById = new Map(
    split.map((entry) => [entry.memberId, entry.share]),
  );

  const summary = document.createElement('p');
  summary.className = 'split-preview-summary';
  summary.textContent =
    smallest === largest
      ? `هر نفر ${formatExpenseAmount(smallest)}`
      : `هر نفر از ${formatExpenseAmount(smallest)} تا ${formatExpenseAmount(
          largest,
        )}`;

  const note = document.createElement('p');
  note.className = 'split-preview-note';
  note.textContent = `${FA_NUMBER.format(split.length)} نفر · جمع ${formatExpenseAmount(
    amount,
  )}`;

  const list = document.createElement('ul');
  list.className = 'split-preview-list';

  state.expenseMembers.forEach((member, index) => {
    const id = String(member.id);
    if (!shareById.has(id)) return;

    const item = document.createElement('li');
    item.className = 'split-preview-item';

    const name = document.createElement('span');
    name.textContent = memberDisplayName(
      member,
      index,
      Boolean(state.currentUserId) && id === String(state.currentUserId),
    );

    const share = document.createElement('span');
    share.textContent = formatExpenseAmount(shareById.get(id));

    item.append(name, share);
    list.append(item);
  });

  refs.expensePreview.replaceChildren(summary, note, list);
}

async function onExpenseSubmit(event) {
  event.preventDefault();
  if (refs.expenseSubmit?.disabled) return;

  resetExpenseErrors();

  const title = refs.expenseTitle?.value.trim() ?? '';
  const description = refs.expenseDescription?.value.trim() ?? '';
  const amount = parseRialAmount(refs.expenseAmount?.value);
  const memberIds = getSelectedExpenseMemberIds();

  let firstInvalid = null;

  if (!title) {
    setFieldError(
      refs.expenseTitle,
      refs.expenseTitleError,
      MESSAGES.expenseTitleRequired,
    );
    firstInvalid = refs.expenseTitle;
  } else if (title.length > MAX_EXPENSE_TITLE_LENGTH) {
    setFieldError(
      refs.expenseTitle,
      refs.expenseTitleError,
      MESSAGES.expenseTitleTooLong,
    );
    firstInvalid = refs.expenseTitle;
  }

  if (description.length > MAX_EXPENSE_DESCRIPTION_LENGTH) {
    setFieldError(
      refs.expenseDescription,
      refs.expenseDescriptionError,
      MESSAGES.expenseDescriptionTooLong,
    );
    firstInvalid ??= refs.expenseDescription;
  }

  if (amount === null) {
    setFieldError(
      refs.expenseAmount,
      refs.expenseAmountError,
      MESSAGES.expenseAmountInvalid,
    );
    firstInvalid ??= refs.expenseAmount;
  }

  if (memberIds.length === 0) {
    setExpenseMembersError(MESSAGES.expenseMembersRequired);
    firstInvalid ??= refs.expenseMembers?.querySelector('input');
  }

  if (firstInvalid) {
    firstInvalid.focus();
    return;
  }

  if (!state.detailId) return;

  setBusy(refs.expenseSubmit, true, 'در حال ثبت…', 'ثبت هزینه');

  try {
    await createGroupExpense(state.detailId, {
      title,
      description: description || undefined,
      amount,
      payerId: state.expensePayerId,
      memberIds,
    });

    hideDialog(refs.expenseDialog);
    refs.expenseForm?.reset();
    showToast(MESSAGES.expenseCreated, 'success');

    // Re-read the authoritative list so the new row, totals, and payer label
    // all come from the server.
    loadExpenses(state.detailId);
  } catch (error) {
    if (handleUnauthorized(error)) return;
    setFormError(expenseSubmitErrorMessage(error));
  } finally {
    setBusy(refs.expenseSubmit, false, 'در حال ثبت…', 'ثبت هزینه');
  }
}

function resetExpenseErrors() {
  setFieldError(refs.expenseTitle, refs.expenseTitleError, '');
  setFieldError(refs.expenseDescription, refs.expenseDescriptionError, '');
  setFieldError(refs.expenseAmount, refs.expenseAmountError, '');
  setExpenseMembersError('');
  setFormError('');
}

function setExpenseMembersError(message) {
  if (!refs.expenseMembersError) return;
  refs.expenseMembersError.textContent = message;

  const fieldset = refs.expenseMembers?.closest('fieldset');
  if (!fieldset) return;
  if (message) {
    fieldset.setAttribute('aria-invalid', 'true');
  } else {
    fieldset.removeAttribute('aria-invalid');
  }
}

function setFormError(message) {
  if (!refs.expenseFormError) return;
  refs.expenseFormError.textContent = message;
}

function expenseSubmitErrorMessage(error) {
  if (error instanceof ApiError) {
    if (error.status === 0) return error.message;
    if (error.status === 400) {
      return error.message || MESSAGES.expenseAmountInvalid;
    }
    if (error.status === 403) return MESSAGES.expenseForbidden;
    if (error.status === 404) {
      return `${MESSAGES.groupNotFound}. ${MESSAGES.groupNotFoundHint}`;
    }
    if (error.status >= 500) return MESSAGES.serverError;
  }

  return error instanceof Error && error.message
    ? error.message
    : MESSAGES.expenseCreateFailed;
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
  if (Array.isArray(group?.members)) return group.members.length;

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
