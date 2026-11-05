/**
 * Bo dieu khien chinh: dieu huong man hinh, choi voi may, 2 nguoi cung may,
 * online qua ma phong, cai dat, am thanh va PWA.
 */
import { applyI18n, setLang, t } from './i18n.js';
import {
  loadProfile,
  saveProfile,
  loadSettings,
  saveSettings,
  loadScores,
  saveScores,
  resetScoresForSize,
  loadSession,
  saveSession,
  clearSession,
} from './storage.js';
import {
  catAvatar,
  catFace,
  mascotSVG,
  pawSVG,
  yarnSVG,
  fishSVG,
  bellSVG,
  AVATAR_KEYS,
} from '../assets/cats.js';
import * as audio from './audio.js';
import {
  initBoard,
  setBoardSize,
  renderBoard,
  setBoardLabel,
  resetBoardFocus,
  focusFirstCell,
  shakeCell,
  showWinLine,
  clearWinLine,
  burstConfetti,
  toast,
  setBanner,
  setLoading,
  showEmoteBubble,
  clearEmoteBubble,
  showSleepZ,
  updateTimer,
} from './ui.js';
import {
  initInfiniteBoard,
  startInfiniteSession,
  stopInfiniteSession,
  setInfiniteVisible,
  renderInfinite,
  resetInfiniteView,
  focusInfiniteBoard,
  shakeInfinite,
  refreshInfiniteText,
} from './infinite-board.js';
import {
  BOARD_CONFIGS,
  INFINITE,
  INFINITE_SIZE,
  cellKey,
  createBoard,
  createInfiniteState,
  getInfiniteEmptyCells,
  getResult,
  infiniteResult,
  isInfiniteSize,
  isInRegion,
  infiniteStateFromMoves,
  isValidBoardSize,
  isValidSize,
  place,
  placeInfinite,
  otherPlayer,
  winLengthFor,
} from './game-core.js';
import { createAIClient } from './ai-client.js';
import { OnlineClient } from './online.js';
import { api } from './api.js';

const SCREENS = [
  'home',
  'auth',
  'profile',
  'history',
  'stats',
  'ai-setup',
  'local-setup',
  'lobby',
  'room',
  'game',
];
const BOARD_SIZES = [...Object.keys(BOARD_CONFIGS).map(Number), INFINITE_SIZE];
const AI_SEARCH_TIME = 800;
const PIECE_THEME = { A: 'orange', B: 'gray' };
const DIFFICULTY_THEME = { easy: 'cream', medium: 'gray', hard: 'tabby' };
const EMOTES = new Set(['😺', '😹', '😿', '🐟', '🧶', '👏']);
const SESSION_TTL = 3 * 60 * 60 * 1000;
const REPLACED_FLAG = 'mmc.replaced';

const ERROR_KEY_BY_CODE = {
  notYourTurn: 'notYourTurn',
  cellTaken: 'cellTaken',
  invalidMove: 'invalidMove',
  gameNotPlaying: 'gameNotPlaying',
  notInRoom: 'notInRoom',
  alreadyInRoom: 'alreadyInRoom',
  roomLimit: 'roomLimit',
  rateLimit: 'rateLimit',
  emoteCooldown: 'emoteCooldown',
  invalidEmote: 'invalidEmote',
  opponentOffline: 'opponentOffline',
  rejoinFailed: 'rejoinFailed',
  roomNotFound: 'roomNotFound',
  roomFull: 'roomFull',
  invalidCode: 'invalidCode',
  invalidSize: 'invalidSize',
  invalidCoord: 'invalidCoord',
  coordOutsideRegion: 'coordOutsideRegion',
  moveLimit: 'moveLimit',
  accountInRoom: 'accountInRoom',
  AUTH_REQUIRED: 'authRequired',
  INVALID_CREDENTIALS: 'invalidCredentials',
  USERNAME_TAKEN: 'usernameTaken',
  INVALID_USERNAME: 'invalidUsername',
  INVALID_PASSWORD: 'invalidPassword',
  WEAK_PASSWORD: 'weakPassword',
  INVALID_AVATAR: 'invalidAvatar',
  INVALID_DISPLAY_NAME: 'invalidDisplayName',
  WRONG_PASSWORD: 'wrongPassword',
  RATE_LIMITED: 'rateLimited',
  CSRF_REJECTED: 'csrfRejected',
  INVALID_JSON: 'invalidJson',
  BODY_TOO_LARGE: 'bodyTooLarge',
  INVALID_SIZE: 'invalidSize',
  UNSUPPORTED_MEDIA_TYPE: 'unsupportedMediaType',
  NOTHING_TO_UPDATE: 'nothingToUpdate',
  NETWORK: 'networkError',
  MATCH_NOT_FOUND: 'matchNotFound',
  INVALID_RESULT_FILTER: 'invalidResultFilter',
  SERVER_ERROR: 'serverError',
};

const $ = (id) => document.getElementById(id);

const state = {
  screen: 'home',
  mode: '',
  profile: loadProfile(),
  settings: loadSettings(),
  scores: loadScores(),
  scoreViewSize: 3,
  game: null,
  account: { user: null, loading: true },
  auth: { tab: 'login', avatar: 'orange', busy: false },
  pendingRoom: null,
  pendingInvite: null,
  history: { items: [], page: 0, hasMore: false, loading: false, size: '', result: '' },
  stats: null,
  replay: { match: null, index: 0, timer: null, speed: 1, playing: false },
  ai: {
    difficulty: 'easy',
    firstChoice: 'random',
    symbol: 'B',
    thinking: false,
    timer: null,
    token: 0,
  },
  online: {
    roomId: null,
    playerKey: null,
    roomState: null,
    youSymbol: null,
    pendingMove: null,
    finishReason: null,
    celebratedKey: null,
    lastBoardCount: null,
    lastEmoteAt: 0,
    rematchPending: false,
    rematchToastShown: false,
    rejoining: false,
  },
};

let lobbyBusy = false;
let lobbyStatusKind = '';
let avatarButtons = [];
let onlineTimerId = null;
let onlineTimerDeadline = 0;
let onlineTimerTotal = 30000;
let lastServerError = { code: '', at: 0 };

const net = new OnlineClient({
  onConnect: handleOnlineConnect,
  onDisconnect: handleOnlineDisconnect,
  onConnectError: handleOnlineConnectError,
  onEvent: handleOnlineEvent,
});

const aiClient = createAIClient();

// ---------------------------------------------------------------------------
// Tien ich
// ---------------------------------------------------------------------------
function stripName(raw) {
  return Array.from(
    String(raw ?? '')
      .normalize('NFC')
      .replace(/[\u0000-\u001F\u007F<>]/g, '')
      .replace(/\s{2,}/g, ' ')
  )
    .slice(0, 12)
    .join('');
}

function cleanName(raw) {
  return stripName(raw).trim();
}

function normalizeRoomCode(raw) {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5);
}

function currentProfile() {
  const user = state.account.user;
  if (user) {
    return {
      name: cleanName(user.displayName) || user.username,
      avatar: AVATAR_KEYS.includes(user.avatar) ? user.avatar : 'orange',
    };
  }
  return {
    name: cleanName(state.profile.name) || t('defaultName'),
    avatar: AVATAR_KEYS.includes(state.profile.avatar) ? state.profile.avatar : 'orange',
  };
}

function displayName(symbol) {
  if (state.mode === 'online') {
    const player = state.online.roomState?.players?.find((item) => item.symbol === symbol);
    if (player?.name) return player.name;
    return symbol === 'A' ? t('orangeCat') : t('grayCat');
  }
  if (state.mode === 'replay' && state.replay.match) {
    const player = state.replay.match.players?.[symbol];
    if (player) return player.deleted ? t('deletedPlayer') : player.name;
  }
  if (symbol === 'A') return currentProfile().name;
  if (state.mode === 'ai') return t('aiName');
  return t('localGuest');
}

function focusElement(el) {
  if (!el) return;
  requestAnimationFrame(() => {
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  });
}

function readFlag(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeFlag(key, value) {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    /* che do rieng tu: bo qua */
  }
}

function prefersReducedMotion() {
  return state.settings.reduceMotion || document.body.classList.contains('reduce-motion');
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function apiErrorMessage(error) {
  const code = error?.code;
  if (code === 'RATE_LIMITED' && error.retryAfter) {
    return t('rateLimitedWait', { s: error.retryAfter });
  }
  const key = ERROR_KEY_BY_CODE[code];
  if (key) return t(key);
  if (code === 'NETWORK' || code === 'HTTP_0') return t('networkError');
  return t('serverError');
}

function setFormMessage(id, message, kind = 'error') {
  const el = $(id);
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || '';
  el.className = kind === 'success' ? 'form-success' : 'form-error';
}

function setAuthBusy(busy) {
  state.auth.busy = busy;
  $('login-submit').disabled = busy;
  $('register-submit').disabled = busy;
  $('btn-auth-guest').disabled = busy;
  $('login-submit').textContent = busy ? t('processing') : t('login');
  $('register-submit').textContent = busy ? t('processing') : t('register');
}

function passwordStrength(password) {
  const value = String(password || '');
  if (!value) return { score: 0, label: '', className: '' };
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/[0-9]/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  if (score <= 2) return { score: 1, label: t('strengthWeak'), className: 'weak' };
  if (score <= 4) return { score: 2, label: t('strengthMedium'), className: 'medium' };
  return { score: 3, label: t('strengthStrong'), className: 'strong' };
}

function updatePasswordStrength() {
  const input = $('register-password');
  const fill = $('password-strength-fill');
  const text = $('password-strength-text');
  if (!input || !fill || !text) return;
  const result = passwordStrength(input.value);
  fill.className = `strength-fill ${result.className}`;
  fill.style.width = `${result.score * 33.33}%`;
  text.textContent = result.label;
  text.className = `strength-text ${result.className}`;
}

function showAuthError(kind, message) {
  setFormMessage(kind === 'login' ? 'login-error' : 'register-error', message, 'error');
}

function switchAuthTab(tab) {
  state.auth.tab = tab === 'register' ? 'register' : 'login';
  const login = state.auth.tab === 'login';
  $('login-form').hidden = !login;
  $('register-form').hidden = login;
  $('auth-tab-login').setAttribute('aria-selected', String(login));
  $('auth-tab-register').setAttribute('aria-selected', String(!login));
  showAuthError('login', '');
  showAuthError('register', '');
  focusElement(login ? $('login-username') : $('register-username'));
}

function renderAuthAvatars() {
  const list = $('auth-avatar-list');
  if (!list) return;
  list.textContent = '';
  AVATAR_KEYS.forEach((key, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'avatar-btn';
    button.dataset.avatar = key;
    button.setAttribute('aria-pressed', String(state.auth.avatar === key));
    button.setAttribute('aria-label', t('avatarAria', { n: index + 1 }));
    button.innerHTML = catAvatar(key);
    button.addEventListener('click', () => {
      state.auth.avatar = key;
      list.querySelectorAll('.avatar-btn').forEach((item) => {
        item.setAttribute('aria-pressed', String(item.dataset.avatar === key));
      });
    });
    list.appendChild(button);
  });
}

function openAuth(tab = 'login') {
  showAuthError('login', '');
  showAuthError('register', '');
  refreshAuthInviteNote();
  state.auth.avatar = currentProfile().avatar;
  renderAuthAvatars();
  $('login-form').reset();
  $('register-form').reset();
  $('login-remember').checked = true;
  $('register-remember').checked = true;
  $('register-password').value = '';
  updatePasswordStrength();
  showScreen('auth');
  switchAuthTab(tab);
}

function refreshAuthInviteNote() {
  const note = $('auth-invite-note');
  if (!note) return;
  if (state.pendingRoom) {
    note.hidden = false;
    note.textContent = t('inviteAuthNote', { code: state.pendingRoom });
  } else {
    note.hidden = true;
    note.textContent = '';
  }
}

function renderAccountUI() {
  const user = state.account.user;
  $('account-guest').hidden = Boolean(user);
  $('account-signed').hidden = !user;
  if (user) {
    $('account-avatar').innerHTML = catAvatar(user.avatar);
    $('account-display-name').textContent = user.displayName;
    $('account-username').textContent = `@${user.username}`;
  }

  const nameInput = $('name-input');
  if (nameInput) {
    nameInput.disabled = Boolean(user);
    nameInput.title = user ? t('nameLocked') : '';
  }
  avatarButtons.forEach((button) => {
    button.disabled = Boolean(user);
  });

  if (user) {
    $('profile-avatar-preview').innerHTML = catAvatar(user.avatar);
    $('profile-display-name').textContent = user.displayName;
    $('profile-username').textContent = `@${user.username}`;
  }
  syncNameInput();
  renderLobbyProfile();
}

async function refreshAccount() {
  state.account.loading = true;
  try {
    const response = await api.me();
    state.account.user = response?.user || null;
  } catch {
    state.account.user = null;
  }
  state.account.loading = false;
  renderAccountUI();
  return state.account.user;
}

function handleAuthSuccess(user) {
  state.account.user = user;
  state.stats = null;
  renderAccountUI();
  audio.play('join');
  toast(t('welcomeUser', { name: user.displayName }), 'success', 2200);
  const pending = state.pendingRoom;
  if (pending) {
    state.pendingRoom = null;
    openInviteRoom(pending);
    return;
  }
  goHome();
}

async function logoutAccount() {
  try {
    await api.logout();
  } catch {
    /* van xoa trang thai tai khoan o client */
  }
  state.account.user = null;
  state.stats = null;
  state.history = { items: [], page: 0, hasMore: false, loading: false, size: '', result: '' };
  renderAccountUI();
  if (['profile', 'history', 'stats', 'auth'].includes(state.screen)) goHome();
  toast(t('loggedOut'), 'info', 2200);
}

function openProfile() {
  if (!state.account.user) {
    openAuth('login');
    return;
  }
  const user = state.account.user;
  $('profile-avatar-preview').innerHTML = catAvatar(user.avatar);
  $('profile-display-name').textContent = user.displayName;
  $('profile-username').textContent = `@${user.username}`;
  $('profile-name-input').value = user.displayName;
  setFormMessage('profile-error', '');
  setFormMessage('profile-success', '');
  setFormMessage('password-error', '');
  setFormMessage('password-success', '');
  setFormMessage('delete-error', '');
  $('current-password').value = '';
  $('new-password').value = '';
  $('delete-password').value = '';
  renderProfileAvatars(user.avatar);
  showScreen('profile');
  focusElement($('profile-name-input'));
}

let profileAvatar = 'orange';

function renderProfileAvatars(selected) {
  profileAvatar = AVATAR_KEYS.includes(selected) ? selected : 'orange';
  const list = $('profile-avatar-list');
  if (!list) return;
  list.textContent = '';
  AVATAR_KEYS.forEach((key, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'avatar-btn';
    button.dataset.avatar = key;
    button.setAttribute('aria-pressed', String(profileAvatar === key));
    button.setAttribute('aria-label', t('avatarAria', { n: index + 1 }));
    button.innerHTML = catAvatar(key);
    button.addEventListener('click', () => {
      profileAvatar = key;
      list.querySelectorAll('.avatar-btn').forEach((item) => {
        item.setAttribute('aria-pressed', String(item.dataset.avatar === key));
      });
      $('profile-avatar-preview').innerHTML = catAvatar(key);
    });
    list.appendChild(button);
  });
}

function sizeLabel(size) {
  return size === INFINITE_SIZE ? t('scoresInfinite') : `${size}×${size}`;
}

function resultBadge(outcome) {
  if (outcome === 'win') return { key: 'wins', className: 'win' };
  if (outcome === 'loss') return { key: 'losses', className: 'loss' };
  return { key: 'draws', className: 'draw' };
}

function formatDate(ms) {
  try {
    return new Intl.DateTimeFormat(state.settings.lang === 'en' ? 'en' : 'vi', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
}

function renderHistoryFilters() {
  const select = $('history-size');
  if (!select) return;
  const current = state.history.size;
  select.textContent = '';
  const all = document.createElement('option');
  all.value = '';
  all.textContent = t('allSizes');
  select.appendChild(all);
  for (const size of BOARD_SIZES) {
    const option = document.createElement('option');
    option.value = String(size);
    option.textContent = sizeLabel(size);
    select.appendChild(option);
  }
  select.value = current;
}

function renderHistory() {
  const list = $('history-list');
  if (!list) return;
  list.textContent = '';
  const items = state.history.items;
  $('history-empty').hidden = items.length > 0 || state.history.loading;
  $('history-more').hidden = !state.history.hasMore;

  for (const match of items) {
    const row = document.createElement('article');
    row.className = 'history-row';

    const avatar = document.createElement('span');
    avatar.className = 'history-avatar';
    avatar.innerHTML = catAvatar(match.opponent.avatar);
    avatar.setAttribute('aria-hidden', 'true');

    const copy = document.createElement('div');
    copy.className = 'history-copy';
    const name = document.createElement('strong');
    name.textContent = match.opponent.deleted ? t('deletedPlayer') : match.opponent.name;
    const meta = document.createElement('small');
    meta.textContent = `${formatDate(match.endedAt)} · ${sizeLabel(match.size)} · ${t(
      'replayMoveCount',
      { n: match.totalMoves }
    )}`;
    copy.append(name, meta);

    const badgeInfo = resultBadge(match.outcome);
    const badge = document.createElement('span');
    badge.className = `history-badge ${badgeInfo.className}`;
    badge.textContent = t(badgeInfo.key);

    const view = document.createElement('button');
    view.type = 'button';
    view.className = 'btn mini secondary';
    view.textContent = t('viewReplay');
    view.addEventListener('click', () => openReplay(match.id));

    row.append(avatar, copy, badge, view);
    list.appendChild(row);
  }
}

async function loadHistory(reset = false) {
  if (!state.account.user) {
    openAuth('login');
    return;
  }
  if (state.history.loading) return;
  if (reset) {
    state.history.items = [];
    state.history.page = 0;
    state.history.hasMore = false;
  }
  state.history.loading = true;
  $('history-more').disabled = true;
  $('history-status').hidden = false;
  $('history-status').textContent = t('loading');
  try {
    const response = await api.history({
      page: state.history.page + 1,
      limit: 10,
      size: state.history.size,
      result: state.history.result,
    });
    state.history.items.push(...(response.items || []));
    state.history.page = response.page;
    state.history.hasMore = response.hasMore === true;
    $('history-status').hidden = true;
  } catch (error) {
    $('history-status').hidden = false;
    $('history-status').textContent = apiErrorMessage(error);
    if (error.code === 'AUTH_REQUIRED') {
      state.account.user = null;
      renderAccountUI();
      openAuth('login');
    }
  } finally {
    state.history.loading = false;
    $('history-more').disabled = false;
    renderHistory();
    renderHistoryFilters();
  }
}

function openHistory() {
  if (!state.account.user) {
    openAuth('login');
    return;
  }
  showScreen('history');
  renderHistoryFilters();
  loadHistory(true);
  focusElement($('history-size'));
}

async function loadStatsPage() {
  if (!state.account.user) {
    openAuth('login');
    return;
  }
  const status = $('stats-status');
  status.hidden = false;
  status.textContent = t('loading');
  try {
    const response = await api.stats();
    state.stats = response.stats;
    renderStats();
    status.hidden = true;
  } catch (error) {
    status.textContent = apiErrorMessage(error);
    if (error.code === 'AUTH_REQUIRED') {
      state.account.user = null;
      renderAccountUI();
      openAuth('login');
    }
  }
}

function statCard(value, label, className = '') {
  const card = document.createElement('div');
  card.className = `stat-card ${className}`;
  const strong = document.createElement('strong');
  strong.textContent = String(value);
  const span = document.createElement('span');
  span.textContent = label;
  card.append(strong, span);
  return card;
}

function renderStats() {
  const summary = $('stats-summary');
  const table = $('stats-table');
  if (!summary || !table) return;
  summary.textContent = '';
  table.textContent = '';
  const stats = state.stats || { total: 0, wins: 0, losses: 0, draws: 0, winRate: 0, bySize: {} };
  summary.append(
    statCard(stats.total, t('totalMatches')),
    statCard(stats.wins, t('wins'), 'win'),
    statCard(stats.draws, t('draws'), 'draw'),
    statCard(stats.losses, t('losses'), 'loss'),
    statCard(`${stats.winRate}%`, t('winRate'))
  );

  const heading = document.createElement('h3');
  heading.className = 'section-title';
  heading.textContent = t('statsBySize');
  table.appendChild(heading);

  const sizes = [...BOARD_SIZES];
  for (const size of sizes) {
    const entry = stats.bySize[String(size)] || { wins: 0, losses: 0, draws: 0 };
    const total = entry.wins + entry.losses + entry.draws;
    if (!total) continue;
    const row = document.createElement('div');
    row.className = 'stats-row';
    const label = document.createElement('strong');
    label.textContent = sizeLabel(size);
    const detail = document.createElement('span');
    detail.textContent = `${t('wins')} ${entry.wins} · ${t('draws')} ${
      entry.draws
    } · ${t('losses')} ${entry.losses}`;
    row.append(label, detail);
    table.appendChild(row);
  }
  if (table.children.length === 1) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = t('statsEmpty');
    table.appendChild(empty);
  }
}

function openStats() {
  if (!state.account.user) {
    openAuth('login');
    return;
  }
  showScreen('stats');
  renderStats();
  loadStatsPage();
  focusElement($('stats-back'));
}

const LOCAL_HOST_RE =
  /^(localhost|127\.0\.0\.1|\[::1\]|::1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i;

function isLocalOnlyHost() {
  return LOCAL_HOST_RE.test(window.location.hostname);
}

function inviteUrlFor(code) {
  return inviteUrl(code);
}

async function ensureOnline() {
  if (net.connected) return;
  const start = Date.now();
  let delay = 1200;
  let announced = false;
  while (Date.now() - start < 90_000) {
    try {
      await net.connect();
      return;
    } catch {
      if (state.screen === 'lobby' || state.screen === 'auth') {
        setLobbyStatus(t('wakingServer'), 'info');
        announced = true;
      }
      await sleep(delay);
      delay = Math.min(Math.round(delay * 1.6), 10_000);
    }
  }
  if (announced) setLobbyStatus(t('serverAsleep'), 'error');
  throw new Error('connect-timeout');
}

function showInviteDialog(room) {
  $('invite-avatar').innerHTML = catAvatar(room.hostAvatar);
  $('invite-host').textContent = room.hostName || t('orangeCat');
  $('invite-size').textContent =
    room.size === INFINITE_SIZE
      ? t('roomSizeInfoInfinite')
      : t('roomSizeInfo', { size: room.size, n: room.winLength });
  const note = $('invite-note');
  if (isLocalOnlyHost()) {
    note.hidden = false;
    note.textContent = t('inviteLocalNote');
  } else {
    note.hidden = true;
    note.textContent = '';
  }
  $('invite-error').hidden = true;
  $('invite-error').textContent = '';
  $('invite-join').disabled = room.full === true;
  if (room.full) {
    $('invite-error').hidden = false;
    $('invite-error').textContent = t('roomFull');
  }
  state.pendingInvite = room;
  openDialog('dialog-invite');
}

async function openInviteRoom(code) {
  const roomId = normalizeRoomCode(code);
  if (roomId.length !== 5) {
    stripRoomParam();
    goHome({ focus: false });
    toast(t('invalidCode'), 'error', 3000);
    return;
  }
  showScreen('lobby');
  renderLobbyProfile();
  $('room-input').value = roomId;
  setLobbyStatus(t('connecting'), 'info');
  try {
    await ensureOnline();
    const response = await net.roomInfo(roomId);
    if (!response?.ok) {
      clearLobbyStatus();
      stripRoomParam();
      goHome({ focus: false });
      toast(errorMessageFor(response?.code), 'error', 3200);
      return;
    }
    clearLobbyStatus();
    showInviteDialog(response.room);
  } catch {
    setLobbyStatus(t('serverAsleep'), 'error');
  }
}

async function joinInviteRoom() {
  const room = state.pendingInvite;
  if (!room) return;
  $('invite-join').disabled = true;
  $('invite-error').hidden = true;
  try {
    await ensureOnline();
    const response = await net.joinRoom(room.roomId, currentProfile());
    if (!response?.ok) {
      $('invite-error').hidden = false;
      $('invite-error').textContent = errorMessageFor(response?.code);
      $('invite-join').disabled = false;
      return;
    }
    const dialog = $('dialog-invite');
    state.pendingInvite = null;
    if (dialog.open) dialog.close();
    handleJoinSuccess(response);
  } catch {
    $('invite-error').hidden = false;
    $('invite-error').textContent = t('networkError');
    $('invite-join').disabled = false;
  }
}

function leaveInvite() {
  const dialog = $('dialog-invite');
  state.pendingInvite = null;
  if (dialog.open) dialog.close();
  state.pendingRoom = null;
  stripRoomParam();
  goHome();
}

// ---------------------------------------------------------------------------
// Tai khoan
// ---------------------------------------------------------------------------
async function loginFlow(event) {
  event.preventDefault();
  if (state.auth.busy) return;
  const username = $('login-username').value.trim();
  const password = $('login-password').value;
  showAuthError('login', '');
  setAuthBusy(true);
  try {
    const response = await api.login({
      username,
      password,
      remember: $('login-remember').checked,
    });
    $('login-password').value = '';
    handleAuthSuccess(response.user);
  } catch (error) {
    showAuthError('login', apiErrorMessage(error));
    audio.play('error');
  } finally {
    setAuthBusy(false);
  }
}

async function registerFlow(event) {
  event.preventDefault();
  if (state.auth.busy) return;
  const username = $('register-username').value.trim();
  const displayName = $('register-display-name').value.trim();
  const password = $('register-password').value;
  showAuthError('register', '');
  setAuthBusy(true);
  try {
    const response = await api.register({
      username,
      displayName,
      password,
      avatar: state.auth.avatar,
      remember: $('register-remember').checked,
    });
    $('register-password').value = '';
    updatePasswordStrength();
    handleAuthSuccess(response.user);
  } catch (error) {
    showAuthError('register', apiErrorMessage(error));
    audio.play('error');
  } finally {
    setAuthBusy(false);
  }
}

function guestFlow() {
  const pending = state.pendingRoom;
  state.pendingRoom = null;
  if (pending) {
    openInviteRoom(pending);
    return;
  }
  stripRoomParam();
  goHome();
}

async function saveProfileFlow() {
  const user = state.account.user;
  if (!user) return;
  const displayName = cleanName($('profile-name-input').value);
  setFormMessage('profile-error', '');
  setFormMessage('profile-success', '');
  $('profile-save').disabled = true;
  try {
    const response = await api.updateProfile({ displayName, avatar: profileAvatar });
    state.account.user = response.user;
    renderAccountUI();
    $('profile-name-input').value = response.user.displayName;
    setFormMessage('profile-success', t('profileSaved'), 'success');
    toast(t('profileSaved'), 'success', 2000);
  } catch (error) {
    setFormMessage('profile-error', apiErrorMessage(error), 'error');
  } finally {
    $('profile-save').disabled = false;
  }
}

async function changePasswordFlow(event) {
  event.preventDefault();
  setFormMessage('password-error', '');
  setFormMessage('password-success', '');
  const currentPassword = $('current-password').value;
  const newPassword = $('new-password').value;
  $('password-submit').disabled = true;
  try {
    await api.changePassword({ currentPassword, newPassword });
    $('current-password').value = '';
    $('new-password').value = '';
    setFormMessage('password-success', t('passwordChanged'), 'success');
    toast(t('passwordChanged'), 'success', 2600);
  } catch (error) {
    setFormMessage('password-error', apiErrorMessage(error), 'error');
  } finally {
    $('password-submit').disabled = false;
  }
}

async function deleteAccountFlow() {
  const user = state.account.user;
  if (!user) return;
  if (!window.confirm(t('deleteAccountConfirm'))) return;
  setFormMessage('delete-error', '');
  $('delete-account').disabled = true;
  try {
    await api.deleteAccount({ password: $('delete-password').value });
    state.account.user = null;
    state.stats = null;
    state.history = { items: [], page: 0, hasMore: false, loading: false, size: '', result: '' };
    renderAccountUI();
    goHome();
    toast(t('accountDeleted'), 'success', 2600);
  } catch (error) {
    setFormMessage('delete-error', apiErrorMessage(error), 'error');
  } finally {
    $('delete-account').disabled = false;
  }
}

function togglePasswordVisibility(button) {
  const input = $(button.dataset.togglePassword);
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button.setAttribute('aria-pressed', String(show));
  button.setAttribute('aria-label', t('showPassword'));
}

// ---------------------------------------------------------------------------
// Xem lai van (replay)
// ---------------------------------------------------------------------------
function stopReplayPlayback() {
  if (state.replay.timer !== null) {
    window.clearTimeout(state.replay.timer);
    state.replay.timer = null;
  }
  state.replay.playing = false;
  const button = $('replay-play');
  if (button) button.textContent = '▶';
}

function replayExpressions(match) {
  return (symbol) => {
    if (match.result === 'draw') return match.result ? 'sleep' : 'normal';
    if (!match.result) return 'normal';
    return symbol === match.result ? 'win' : 'lose';
  };
}

function enterReplay(match, returnTo = 'history') {
  stopReplayPlayback();
  state.replay = {
    match,
    index: 0,
    timer: null,
    speed: Number($('replay-speed').value) || 1,
    playing: false,
    returnTo,
  };
  enterGameScreen('replay', match.size);
  $('replay-bar').hidden = false;
  $('game-record').hidden = true;
  $('result-card').hidden = true;
  $('emote-bar').hidden = true;
  $('replay-range').max = String(match.moves.length);
  $('replay-speed').value = String(state.replay.speed);
  const sizeText = sizeLabel(match.size);
  $('game-rule').textContent = t('replayRule', { size: sizeText });
  renderReplayFrame();
}

function renderReplayFrame() {
  const replay = state.replay;
  const match = replay.match;
  if (!match) return;
  const total = match.moves.length;
  const index = Math.max(0, Math.min(total, replay.index));
  replay.index = index;
  const atEnd = index >= total;
  const prefix = match.moves.slice(0, index);
  const last = prefix.length ? prefix[prefix.length - 1] : null;
  const expressionFor = replayExpressions(match);

  if (match.size === INFINITE_SIZE) {
    const built = infiniteStateFromMoves(prefix);
    renderInfinite({
      cells: built.cells,
      moves: built.moves,
      region: built.region,
      lastMove: last ? { x: last.x, y: last.y } : null,
      winLine: atEnd ? match.winLine : null,
      locked: true,
      preview: null,
      maxMoves: INFINITE.maxMoves,
      drawLimit: false,
      expressionFor,
    });
    refreshInfiniteText();
  } else {
    const size = Number(match.size);
    const board = createBoard(size);
    for (const move of prefix) {
      const cellIndex = Number(move.i);
      if (Number.isInteger(cellIndex) && cellIndex >= 0 && cellIndex < board.length) {
        board[cellIndex] = move.s === 'B' ? 'B' : 'A';
      }
    }
    renderBoard(board, {
      locked: true,
      preview: null,
      expressionFor,
      lastMove: last ? Number(last.i) : null,
    });
    setBoardLabel(t('boardLabel', { size }));
    if (atEnd && match.winLine) showWinLine(match.winLine);
    else clearWinLine();
  }

  const finished = atEnd;
  const draw = match.result === 'draw';
  const winner = match.result;
  const cardFor = (symbol) => {
    const player = match.players?.[symbol] || {};
    return {
      name: player.deleted ? t('deletedPlayer') : player.name || t('orangeCat'),
      avatar: player.avatar || (symbol === 'A' ? 'orange' : 'gray'),
      tag: `${symbol === match.mySymbol ? t('youBadge') : t('opponentBadge')} · ${
        symbol === 'A' ? t('orangeCat') : t('grayCat')
      }`,
      score: null,
      online: false,
      active: false,
      winner: finished && !draw && winner === symbol,
      loser: finished && !draw && winner !== symbol,
    };
  };
  setPlayerCard('left', cardFor('A'));
  setPlayerCard('right', cardFor('B'));

  $('replay-range').value = String(index);
  $('replay-counter').textContent = `${index}/${total}`;
  if (finished) {
    const key = match.outcome === 'win' ? 'replayWin' : match.outcome === 'loss' ? 'replayLoss' : 'replayDraw';
    setStatus(t(key), match.outcome === 'win' ? 'win' : '');
  } else {
    setStatus(t('replayProgress', { n: index, total }), '');
  }
  updateModeLabel();
}

function setReplayIndex(next) {
  stopReplayPlayback();
  state.replay.index = next;
  renderReplayFrame();
}

function scheduleReplayStep() {
  stopReplayPlayback();
  const total = state.replay.match?.moves.length || 0;
  if (!total) return;
  if (state.replay.index >= total) state.replay.index = 0;
  state.replay.playing = true;
  $('replay-play').textContent = '❚❚';
  const delay = Math.max(120, Math.round(850 / (state.replay.speed || 1)));
  const step = () => {
    if (!state.replay.playing || !state.replay.match) return;
    const max = state.replay.match.moves.length;
    if (state.replay.index >= max) {
      stopReplayPlayback();
      return;
    }
    state.replay.index += 1;
    renderReplayFrame();
    if (state.replay.index >= max) {
      stopReplayPlayback();
      return;
    }
    state.replay.timer = window.setTimeout(step, delay);
  };
  if (state.replay.index >= total) renderReplayFrame();
  state.replay.timer = window.setTimeout(step, delay);
}

function toggleReplayPlayback() {
  if (state.replay.playing) stopReplayPlayback();
  else scheduleReplayStep();
}

function exitReplay() {
  stopReplayPlayback();
  const returnTo = state.replay.returnTo;
  state.replay.match = null;
  exitLocalGame();
  $('replay-bar').hidden = true;
  hideResult();
  clearWinLine();
  setStatus('', '');
  if (returnTo === 'history' && state.account.user) openHistory();
  else goHome();
}

async function openReplay(matchId) {
  setLoading(true, t('loading'));
  try {
    const response = await api.match(matchId);
    setLoading(false);
    if (!response?.match) {
      toast(t('matchNotFound'), 'error', 2800);
      return;
    }
    enterReplay(response.match, 'history');
  } catch (error) {
    setLoading(false);
    toast(apiErrorMessage(error), 'error', 3000);
    if (error.code === 'AUTH_REQUIRED') {
      state.account.user = null;
      renderAccountUI();
      openAuth('login');
    }
  }
}

// ---------------------------------------------------------------------------
// Chon co ban
// ---------------------------------------------------------------------------
function renderSizeGrid(id) {
  const grid = $(id);
  if (!grid) return;
  grid.textContent = '';

  for (const size of BOARD_SIZES) {
    const infinite = isInfiniteSize(size);
    const need = winLengthFor(size);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'size-btn';
    button.dataset.size = String(size);
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute(
      'aria-label',
      infinite ? t('infSizeAria') : t('sizeAria', { size, n: need })
    );

    const number = document.createElement('span');
    number.className = 'size-num';
    number.textContent = infinite ? '∞' : `${size}×${size}`;

    const rule = document.createElement('small');
    rule.className = 'size-rule';
    rule.textContent = infinite ? t('infRuleTiny') : t('sizeRuleShort', { n: need });

    button.append(number, rule);
    button.addEventListener('click', () => selectBoardSize(size));
    grid.appendChild(button);
  }
}

function selectBoardSize(size) {
  if (!isValidBoardSize(size)) {
    toast(t('invalidSize'), 'error', 2200);
    return;
  }
  state.settings.boardSize = size;
  saveSettings(state.settings);
  updateSizePickers();
  audio.play('click');
}

function updateSizePickers() {
  const size = state.settings.boardSize;
  const need = winLengthFor(size);
  const ruleText = isInfiniteSize(size)
    ? t('infRuleShort')
    : t('winRuleShort', { size, n: need });

  document.querySelectorAll('.size-btn').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.size === String(size)));
  });

  for (const id of ['ai-rule', 'local-rule', 'lobby-rule']) {
    const el = $(id);
    if (el) el.textContent = ruleText;
  }
}

function renderAllSizeGrids() {
  renderSizeGrid('ai-size-grid');
  renderSizeGrid('local-size-grid');
  renderSizeGrid('lobby-size-grid');
  updateSizePickers();
}

// ---------------------------------------------------------------------------
// Dieu huong
// ---------------------------------------------------------------------------
function showScreen(name) {
  for (const screen of SCREENS) {
    const el = $(`screen-${screen}`);
    if (el) el.hidden = screen !== name;
  }
  state.screen = name;
  document.body.dataset.screen = name;
  window.scrollTo(0, 0);
}

function setMode(mode) {
  state.mode = mode;
  document.body.dataset.mode = mode;
}

function goHome({ focus = true } = {}) {
  if (state.online.roomId) {
    leaveOnlineRoom();
    return;
  }
  if (state.replay.match) {
    stopReplayPlayback();
    state.replay.match = null;
    $('replay-bar').hidden = true;
  }
  exitLocalGame();
  setMode('');
  setBanner('');
  $('emote-bar').hidden = true;
  $('left-dot').hidden = true;
  $('right-dot').hidden = true;
  $('turn-timer').hidden = true;
  clearEmoteBubbles();
  updateTimer(null);
  showScreen('home');
  if (focus) focusElement($('btn-ai'));
}

function openAISetup() {
  exitLocalGame();
  setMode('');
  setBanner('');
  $('emote-bar').hidden = true;
  clearEmoteBubbles();
  updateSetupSelection();
  updateSizePickers();
  showScreen('ai-setup');
  const selected = document.querySelector(
    `.difficulty-card[data-difficulty="${state.ai.difficulty}"]`
  );
  focusElement(selected);
}

function openLocalSetup() {
  exitLocalGame();
  setMode('');
  setBanner('');
  $('emote-bar').hidden = true;
  clearEmoteBubbles();
  updateSizePickers();
  showScreen('local-setup');
  const selected = document.querySelector(
    `#local-size-grid .size-btn[data-size="${state.settings.boardSize}"]`
  );
  focusElement(selected || $('start-local'));
}

function enterLobby() {
  exitLocalGame();
  setMode('');
  setBanner('');
  $('emote-bar').hidden = true;
  clearEmoteBubbles();
  renderLobbyProfile();
  clearLobbyStatus();
  updateSizePickers();
  showScreen('lobby');
  focusElement($('btn-create-room'));
  primeOnline();
}

function updateModeLabel() {
  let label = '';
  if (state.mode === 'ai') label = `${t('modeAI')} · ${t(state.ai.difficulty)}`;
  else if (state.mode === 'local') label = t('modeLocal');
  else if (state.mode === 'online') {
    label = t('modeOnline');
    if (state.online.roomId) label += ` · ${state.online.roomId}`;
  } else if (state.mode === 'replay') {
    label = t('modeReplay');
    if (state.replay.match?.size) label += ` · ${sizeLabel(state.replay.match.size)}`;
  }
  $('game-mode-label').textContent = label;
}

// ---------------------------------------------------------------------------
// Hinh anh / profile / avatar
// ---------------------------------------------------------------------------
function injectVisuals() {
  $('mascot').innerHTML = mascotSVG();
  $('brand-paw').innerHTML = pawSVG('#FFD43B');
  $('loading-cat').innerHTML = catAvatar('orange');
  $('room-cat').innerHTML = mascotSVG();

  document.querySelectorAll('[data-cat-theme]').forEach((el) => {
    el.innerHTML = catFace(el.dataset.catTheme, 'normal');
  });

  const decor = [
    { svg: pawSVG('#F0C39A'), style: 'top:7%;left:3%;width:56px;transform:rotate(-18deg)' },
    { svg: yarnSVG(), style: 'top:16%;right:5%;width:74px;transform:rotate(9deg)' },
    { svg: fishSVG(), style: 'bottom:12%;left:6%;width:66px;transform:rotate(-8deg)' },
    { svg: bellSVG(), style: 'bottom:18%;right:8%;width:52px;transform:rotate(12deg)' },
    { svg: pawSVG('#FFD6E0'), style: 'bottom:5%;left:44%;width:42px;transform:rotate(20deg)' },
    { svg: pawSVG('#8CE0C3'), style: 'top:48%;left:2%;width:34px;transform:rotate(-10deg)' },
  ];
  $('bg-decor').innerHTML = decor
    .map(
      (item) =>
        `<div class="decor" style="${item.style}" aria-hidden="true">${item.svg}</div>`
    )
    .join('');
}

function renderAvatarChoices() {
  const list = $('home-avatar-list');
  if (!list) return;
  const selected = currentProfile().avatar;
  list.innerHTML = '';
  avatarButtons = AVATAR_KEYS.map((key, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'avatar-btn';
    button.dataset.avatar = key;
    button.setAttribute('aria-pressed', String(selected === key));
    button.setAttribute('aria-label', t('avatarAria', { n: index + 1 }));
    button.disabled = Boolean(state.account.user);
    button.innerHTML = catAvatar(key);
    button.addEventListener('click', () => selectAvatar(key));
    list.appendChild(button);
    return button;
  });
}

function selectAvatar(key) {
  if (!AVATAR_KEYS.includes(key) || state.account.user) return;
  state.profile.avatar = key;
  saveProfile(currentProfile());
  avatarButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.avatar === key));
  });
  renderLobbyProfile();
  audio.play('click');
}

function renderLobbyProfile() {
  const profile = currentProfile();
  $('lobby-avatar').innerHTML = catAvatar(profile.avatar);
  $('lobby-name').textContent = profile.name;
}

function syncNameInput() {
  const input = $('name-input');
  if (!input) return;
  const user = state.account.user;
  if (user) {
    input.value = cleanName(user.displayName) || user.username;
    return;
  }
  const name = cleanName(state.profile.name) || t('defaultName');
  state.profile.name = name;
  input.value = name;
}

function updateSetupSelection() {
  document.querySelectorAll('.difficulty-card').forEach((button) => {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.difficulty === state.ai.difficulty)
    );
  });
  document.querySelectorAll('#first-row .choice-btn').forEach((button) => {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.first === state.ai.firstChoice)
    );
  });
}

// ---------------------------------------------------------------------------
// Ve ban co va the nguoi choi
// ---------------------------------------------------------------------------
function setPlayerCard(side, data) {
  const card = $(`p-${side}`);
  if (!card) return;
  $(`${side}-avatar`).innerHTML = catAvatar(data.avatar || (side === 'left' ? 'orange' : 'gray'));
  $(`${side}-name`).textContent =
    data.name || t(side === 'left' ? 'orangeCat' : 'grayCat');
  $(`${side}-tag`).textContent = data.tag || '';

  const scoreEl = $(`${side}-score`);
  const showScore = data.score !== null && data.score !== undefined;
  scoreEl.hidden = !showScore;
  if (showScore) scoreEl.textContent = String(data.score);

  const dot = $(`${side}-dot`);
  dot.hidden = data.online !== true;
  dot.classList.toggle('off', data.online === true && data.connected === false);

  card.classList.toggle('active', data.active === true);
  card.classList.toggle('winner', data.winner === true);
  card.classList.toggle('loser', data.loser === true);
}

function setCardsForLocal() {
  const game = state.game;
  if (!game) return;
  const aiMode = state.mode === 'ai';
  const finished = game.finished;
  const draw = game.draw === true;
  const winner = game.winner;
  const local = state.scores.local[game.size] || { A: 0, B: 0, draw: 0 };

  setPlayerCard('left', {
    name: displayName('A'),
    avatar: currentProfile().avatar,
    tag: `${t('youBadge')} · ${t('orangeCat')}`,
    score: state.mode === 'local' ? local.A : null,
    active: !finished && game.turn === 'A',
    winner: finished && !draw && winner === 'A',
    loser: finished && !draw && winner === 'B',
    online: false,
  });

  setPlayerCard('right', {
    name: aiMode ? t('aiName') : t('localGuest'),
    avatar: 'gray',
    tag: t('grayCat'),
    score: state.mode === 'local' ? local.B : null,
    active: !finished && game.turn === 'B',
    winner: finished && !draw && winner === 'B',
    loser: finished && !draw && winner === 'A',
    online: false,
  });
}

function setStatus(text, tone = '') {
  const el = $('game-status');
  el.textContent = text;
  el.className = tone ? `game-status ${tone}` : 'game-status';
}

function updateRecordLocal() {
  const el = $('game-record');
  if (!state.game || !(state.mode === 'ai' || state.mode === 'local')) {
    el.hidden = true;
    return;
  }
  if (state.mode === 'ai') {
    const record =
      state.scores.ai[state.game.size]?.[state.ai.difficulty] || { w: 0, d: 0, l: 0 };
    el.textContent = t('recordAI', record);
  } else {
    const local = state.scores.local[state.game.size] || { A: 0, B: 0, draw: 0 };
    el.textContent = t('recordLocalFull', {
      a: displayName('A'),
      wa: local.A,
      b: displayName('B'),
      wb: local.B,
      d: local.draw,
    });
  }
  el.hidden = false;
}

function clearEmoteBubbles() {
  clearEmoteBubble($('p-left'));
  clearEmoteBubble($('p-right'));
}

function setActionButton(button, spec) {
  if (!button) return;
  if (!spec) {
    button.hidden = true;
    button.textContent = '';
    button.disabled = false;
    button.onclick = null;
    button.title = '';
    button.classList.remove('pulse');
    return;
  }
  button.hidden = false;
  button.textContent = spec.label;
  button.disabled = spec.disabled === true;
  button.title = spec.title || '';
  button.classList.toggle('pulse', spec.pulse === true);
  button.onclick = (event) => {
    event.preventDefault();
    if (!button.disabled && typeof spec.handler === 'function') spec.handler();
  };
}

function applyResultActions(actions = {}) {
  setActionButton($('act-primary'), actions.primary);
  setActionButton($('act-secondary'), actions.secondary);
  setActionButton($('act-tertiary'), actions.tertiary);
}

function showResult(text, actions) {
  const card = $('result-card');
  const wasHidden = card.hidden;
  $('result-text').textContent = text;
  applyResultActions(actions);
  card.hidden = false;
  if (wasHidden && typeof card.scrollIntoView === 'function') {
    card.scrollIntoView({
      block: 'nearest',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }
}

function hideResult() {
  const card = $('result-card');
  card.hidden = true;
  $('result-text').textContent = '';
  applyResultActions({});
}

function hideRecord() {
  $('game-record').hidden = true;
}

function expressionForFinished(game, symbol) {
  if (!game.finished) return 'normal';
  if (game.draw) return 'sleep';
  return symbol === game.winner ? 'win' : 'lose';
}

function resultTextForLocal() {
  const game = state.game;
  if (!game) return '';
  if (game.draw) return game.limit ? t('maxMovesTitle') : t('drawTitle');
  return t('winTitle', { name: displayName(game.winner) });
}

function actionsForLocal() {
  const aiMode = state.mode === 'ai';
  return {
    primary: {
      label: t('playAgain'),
      handler: () => {
        if (aiMode) startAIGame();
        else startLocalGame(state.game?.starter || 'A', state.game?.size);
      },
    },
    secondary: aiMode
      ? {
          label: t('changeDifficulty'),
          handler: () => openAISetup(),
        }
      : {
          label: t('swapStarter'),
          handler: () => {
            const nextStarter = state.game?.starter === 'A' ? 'B' : 'A';
            startLocalGame(nextStarter, state.game?.size);
          },
        },
    tertiary: {
      label: t('home'),
      handler: () => goHome(),
    },
  };
}

function enterGameScreen(mode, size) {
  cancelAiTimer();
  const infinite = isInfiniteSize(size);
  setMode(mode);
  if (infinite) {
    setBoardSize(3);
    setInfiniteVisible(true);
    startInfiniteSession();
  } else {
    setInfiniteVisible(false);
    stopInfiniteSession();
    setBoardSize(size);
  }
  updateModeLabel();
  updateSoundButton();
  if (!infinite) setBoardLabel(t('boardLabel', { size }));
  $('game-rule').textContent = infinite
    ? t('infRuleFull')
    : t('winRule', { n: winLengthFor(size) });
  $('emote-bar').hidden = mode !== 'online';
  $('game-record').hidden = true;
  $('result-card').hidden = true;
  $('turn-timer').hidden = true;
  $('left-dot').hidden = mode !== 'online';
  $('right-dot').hidden = mode !== 'online';
  clearWinLine();
  clearEmoteBubbles();
  setStatus('', '');
  setBanner('');
  showScreen('game');
  if (infinite) resetInfiniteView();
  else resetBoardFocus();
}

// ---------------------------------------------------------------------------
// Choi voi may / 2 nguoi cung may
// ---------------------------------------------------------------------------
function cancelAiTimer() {
  state.ai.token += 1;
  aiClient.cancel();
  if (state.ai.timer !== null) {
    window.clearTimeout(state.ai.timer);
    state.ai.timer = null;
  }
  state.ai.thinking = false;
}

function exitLocalGame() {
  cancelAiTimer();
  stopInfiniteSession();
  setInfiniteVisible(false);
  state.game = null;
  clearWinLine();
  hideResult();
  hideRecord();
  setStatus('', '');
}

function startAIGame() {
  cancelAiTimer();
  state.game = null;
  const size = state.settings.boardSize;
  const infinite = isInfiniteSize(size);
  const first =
    state.ai.firstChoice === 'random'
      ? Math.random() < 0.5
        ? 'A'
        : 'B'
      : state.ai.firstChoice === 'human'
        ? 'A'
        : 'B';

  state.game = {
    ...(infinite ? createInfiniteState() : { board: createBoard(size) }),
    size,
    winLength: winLengthFor(size),
    turn: first,
    starter: first,
    finished: false,
    winner: null,
    winLine: null,
    draw: false,
    limit: false,
    lastMove: null,
  };

  enterGameScreen('ai', size);
  renderLocalGame();
  if (infinite) focusInfiniteBoard();
  else focusFirstCell();
  audio.play('join');

  if (first === 'B') scheduleAIMove();
}

function startLocalGame(starter = 'A', size = state.settings.boardSize) {
  cancelAiTimer();
  const safeSize = isValidBoardSize(size) ? size : state.settings.boardSize;
  const infinite = isInfiniteSize(safeSize);
  const first = starter === 'B' ? 'B' : 'A';
  state.game = {
    ...(infinite ? createInfiniteState() : { board: createBoard(safeSize) }),
    size: safeSize,
    winLength: winLengthFor(safeSize),
    turn: first,
    starter: first,
    finished: false,
    winner: null,
    winLine: null,
    draw: false,
    limit: false,
    lastMove: null,
  };

  enterGameScreen('local', safeSize);
  renderLocalGame();
  if (infinite) focusInfiniteBoard();
  else focusFirstCell();
  audio.play('join');
}

function renderLocalGame() {
  const game = state.game;
  if (!game) return;
  if (isInfiniteSize(game.size)) {
    renderInfiniteLocalGame();
    return;
  }
  const aiMode = state.mode === 'ai';
  const locked =
    game.finished || (aiMode && (state.ai.thinking || game.turn !== 'A'));
  const preview = locked ? null : aiMode ? 'A' : game.turn;

  renderBoard(game.board, {
    locked,
    preview,
    expressionFor: (symbol) => expressionForFinished(game, symbol),
    lastMove: game.lastMove,
  });
  setBoardLabel(t('boardLabel', { size: game.size }));
  $('game-rule').textContent = t('winRule', { n: game.winLength });
  setCardsForLocal();
  updateRecordLocal();
  updateModeLabel();

  if (game.finished && game.winLine) showWinLine(game.winLine);
  else clearWinLine();

  if (game.finished) {
    setStatus('', '');
    showResult(resultTextForLocal(), actionsForLocal());
    return;
  }

  hideResult();
  if (aiMode) {
    setStatus(
      game.turn === 'B' ? t('aiThinking', { name: t('aiName') }) : t('yourTurn'),
      ''
    );
  } else {
    setStatus(t('turnLocal', { name: displayName(game.turn) }), '');
  }
}

function renderInfiniteLocalGame() {
  const game = state.game;
  if (!game) return;
  const aiMode = state.mode === 'ai';
  const locked =
    game.finished || (aiMode && (state.ai.thinking || game.turn !== 'A'));
  const preview = locked ? null : aiMode ? 'A' : game.turn;

  setInfiniteVisible(true);
  renderInfinite({
    cells: game.cells,
    moves: game.moves,
    region: game.region,
    lastMove: game.lastMove,
    winLine: game.winLine,
    locked,
    preview,
    maxMoves: INFINITE.maxMoves,
    drawLimit: game.limit,
    expressionFor: (symbol) => expressionForFinished(game, symbol),
  });
  refreshInfiniteText();
  $('game-rule').textContent = t('infRuleFull');
  setCardsForLocal();
  updateRecordLocal();
  updateModeLabel();

  if (game.finished) {
    setStatus('', '');
    showResult(resultTextForLocal(), actionsForLocal());
    return;
  }

  hideResult();
  if (aiMode) {
    setStatus(
      game.turn === 'B' ? t('aiThinking', { name: t('aiName') }) : t('yourTurn'),
      ''
    );
  } else {
    setStatus(t('turnLocal', { name: displayName(game.turn) }), '');
  }
}

function onLocalCell(index, y) {
  const game = state.game;
  if (!game || game.finished) return;

  if (isInfiniteSize(game.size)) {
    const x = index;
    const key = cellKey(x, y);
    if (game.cells.has(key)) {
      shakeInfinite(x, y);
      audio.play('error');
      toast(t('cellTaken'), 'error', 1600);
      return;
    }

    if (state.mode === 'ai') {
      if (state.ai.thinking || game.turn !== 'A') {
        shakeInfinite(x, y);
        audio.play('error');
        toast(t('notYourTurn'), 'error', 1600);
        return;
      }
      playLocalMove('A', x, y);
    } else {
      playLocalMove(game.turn, x, y);
    }
    return;
  }

  if (game.board[index]) {
    shakeCell(index);
    audio.play('error');
    toast(t('cellTaken'), 'error', 1600);
    return;
  }

  if (state.mode === 'ai') {
    if (state.ai.thinking || game.turn !== 'A') {
      shakeCell(index);
      audio.play('error');
      toast(t('notYourTurn'), 'error', 1600);
      return;
    }
    playLocalMove('A', index);
  } else {
    playLocalMove(game.turn, index);
  }
}

function playLocalMove(symbol, index, y) {
  const game = state.game;
  if (!game || game.finished || game.turn !== symbol) return false;

  if (isInfiniteSize(game.size)) {
    if (!placeInfinite(game, index, y, symbol)) return false;
    game.lastMove = { x: index, y };

    audio.play('meow');
    const result = infiniteResult(game);
    if (result.finished) {
      game.limit = result.limit === true;
      finishLocalRound(result);
      return true;
    }

    game.turn = otherPlayer(symbol);
    renderLocalGame();
    if (state.mode === 'ai' && game.turn === 'B') scheduleAIMove();
    return true;
  }

  if (!place(game.board, index, symbol, game.size)) return false;
  game.lastMove = index;

  audio.play('meow');
  const result = getResult(game.board, game.size, game.winLength);

  if (result.finished) {
    finishLocalRound(result);
    return true;
  }

  game.turn = otherPlayer(symbol);
  renderLocalGame();

  if (state.mode === 'ai' && game.turn === 'B') scheduleAIMove();
  return true;
}

function finishLocalRound(result) {
  const game = state.game;
  if (!game) return;

  game.finished = true;
  game.winner = result.winner;
  game.winLine = result.line;
  game.draw = result.draw === true;
  if (result.limit === true) game.limit = true;

  cancelAiTimer();

  if (state.mode === 'ai') {
    const record = state.scores.ai[game.size][state.ai.difficulty];
    if (game.draw) record.d += 1;
    else if (game.winner === 'A') record.w += 1;
    else record.l += 1;
  } else if (state.mode === 'local') {
    const local = state.scores.local[game.size];
    if (game.draw) local.draw += 1;
    else local[game.winner] += 1;
  }

  saveScores(state.scores);
  renderLocalGame();
  renderScores();
  celebrateLocal(game);
}

function celebrateLocal(game) {
  if (game.draw) {
    audio.play('draw');
    showSleepZ();
    return;
  }
  const youWon = game.winner === 'A';
  if (state.mode === 'ai') {
    audio.play(youWon ? 'win' : 'lose');
    if (youWon) burstConfetti();
  } else {
    audio.play('win');
    burstConfetti();
  }
}

function scheduleAIMove() {
  cancelAiTimer();
  const game = state.game;
  if (!game || state.mode !== 'ai' || game.finished || game.turn !== 'B') return;

  state.ai.thinking = true;
  renderLocalGame();

  const token = state.ai.token;
  const delay = 350 + Math.floor(Math.random() * 400);

  state.ai.timer = window.setTimeout(async () => {
    state.ai.timer = null;
    const current = state.game;
    if (
      token !== state.ai.token ||
      !current ||
      state.mode !== 'ai' ||
      current.finished ||
      current.turn !== 'B'
    ) {
      state.ai.thinking = false;
      return;
    }

    if (isInfiniteSize(current.size)) {
      let move = await aiClient.chooseInfinite({
        moves: current.moves.map((item) => ({ ...item })),
        region: { ...current.region },
        me: 'B',
        opponent: 'A',
        difficulty: state.ai.difficulty,
        winLength: current.winLength,
        timeLimit: AI_SEARCH_TIME,
      });

      if (token !== state.ai.token) return;
      const latest = state.game;
      if (
        !latest ||
        latest !== current ||
        state.mode !== 'ai' ||
        latest.finished ||
        latest.turn !== 'B'
      ) {
        state.ai.thinking = false;
        return;
      }

      state.ai.thinking = false;
      const valid =
        move &&
        Number.isInteger(move.x) &&
        Number.isInteger(move.y) &&
        isInRegion(latest.region, move.x, move.y) &&
        !latest.cells.has(cellKey(move.x, move.y));
      if (!valid) {
        const empties = getInfiniteEmptyCells(latest.cells, latest.region);
        move = empties.length
          ? empties[Math.floor(Math.random() * empties.length)]
          : null;
      }
      if (move) playLocalMove('B', move.x, move.y);
      else renderLocalGame();
      return;
    }

    const index = await aiClient.choose({
      board: current.board,
      me: 'B',
      opponent: 'A',
      difficulty: state.ai.difficulty,
      size: current.size,
      winLength: current.winLength,
      timeLimit: AI_SEARCH_TIME,
    });

    if (token !== state.ai.token) return;
    const latest = state.game;
    if (
      !latest ||
      latest !== current ||
      state.mode !== 'ai' ||
      latest.finished ||
      latest.turn !== 'B'
    ) {
      state.ai.thinking = false;
      return;
    }

    state.ai.thinking = false;
    if (
      Number.isInteger(index) &&
      index >= 0 &&
      index < latest.board.length &&
      latest.board[index] === null
    ) {
      playLocalMove('B', index);
    } else {
      renderLocalGame();
    }
  }, delay);
}

// ---------------------------------------------------------------------------
// Online
// ---------------------------------------------------------------------------
function setLobbyStatus(message, type = 'error') {
  const el = $('lobby-status');
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    el.removeAttribute('data-type');
    lobbyStatusKind = '';
    return;
  }
  el.hidden = false;
  el.textContent = message;
  el.dataset.type = type;
  lobbyStatusKind = type;
}

function clearLobbyStatus() {
  setLobbyStatus('');
}

function setLobbyBusy(busy) {
  lobbyBusy = busy;
  $('btn-create-room').disabled = busy;
  $('btn-join-room').disabled = busy;
}

function errorMessageFor(code) {
  const key = ERROR_KEY_BY_CODE[code];
  return key ? t(key) : t('serverError');
}

function showServerError(code, fallback) {
  const now = Date.now();
  if (code === lastServerError.code && now - lastServerError.at < 1200) return;
  lastServerError = { code: code || '', at: now };
  const key = ERROR_KEY_BY_CODE[code];
  const message = key ? t(key) : fallback && typeof fallback === 'string' ? fallback : t('serverError');
  toast(message, 'error', 2800);
  audio.play('error');
}

async function primeOnline() {
  if (net.connected || lobbyBusy) return;
  setLobbyStatus(t('connecting'), 'info');
  try {
    await net.connect();
    if (!lobbyBusy && lobbyStatusKind === 'info' && state.screen === 'lobby') {
      clearLobbyStatus();
    }
  } catch {
    if (!lobbyBusy && state.screen === 'lobby') {
      setLobbyStatus(t('genericError'), 'error');
    }
  }
}

async function createRoomFlow() {
  if (lobbyBusy) return;
  setLobbyBusy(true);
  clearLobbyStatus();
  setLobbyStatus(t('connecting'), 'info');

  try {
    await net.connect();
    const response = await net.createRoom(currentProfile(), state.settings.boardSize);
    if (!response || response.ok !== true) {
      setLobbyStatus(errorMessageFor(response?.code), 'error');
      return;
    }
    handleJoinSuccess(response);
  } catch {
    setLobbyStatus(t('genericError'), 'error');
  } finally {
    setLobbyBusy(false);
  }
}

async function joinRoomFlow() {
  if (lobbyBusy) return;
  const input = $('room-input');
  const code = normalizeRoomCode(input.value);
  input.value = code;

  if (code.length !== 5) {
    setLobbyStatus(t('invalidCode'), 'error');
    input.focus();
    return;
  }

  setLobbyBusy(true);
  clearLobbyStatus();
  setLobbyStatus(t('connecting'), 'info');

  try {
    await net.connect();
    const response = await net.joinRoom(code, currentProfile());
    if (!response || response.ok !== true) {
      setLobbyStatus(errorMessageFor(response?.code), 'error');
      return;
    }
    handleJoinSuccess(response);
  } catch {
    setLobbyStatus(t('genericError'), 'error');
  } finally {
    setLobbyBusy(false);
  }
}

function handleJoinSuccess(response) {
  state.online.roomId = response.roomId;
  state.online.playerKey = response.playerKey;
  state.online.roomState = response.state || null;
  state.online.pendingMove = null;
  state.online.finishReason = null;
  state.online.celebratedKey = null;
  state.online.lastBoardCount = null;
  state.online.lastEmoteAt = 0;
  state.online.rematchPending = false;
  state.online.rematchToastShown = false;

  saveSession(response.roomId, response.playerKey);
  writeFlag(REPLACED_FLAG, null);
  stripRoomParam();
  clearLobbyStatus();
  setBanner('');
  audio.play('join');

  if (response.state) applyOnlineState(response.state, { initial: true });
}

function applyOnlineState(next, options = {}) {
  if (!next || next.id !== state.online.roomId) return;
  const previous = state.online.roomState;
  state.online.roomState = next;
  state.online.pendingMove = null;

  const you = next.players?.find((player) => player.isYou);
  if (you) state.online.youSymbol = you.symbol;

  if (next.status === 'waiting') {
    showWaitingRoom(next, options);
  } else {
    if (previous?.status === 'finished' && next.status === 'playing') {
      resetOnlineRoundState();
    }
    if (state.screen !== 'game' || state.mode !== 'online') {
      enterOnlineGameScreen();
    }
    updateOnlineTimer(next);
    syncOnlineView();
  }

  const filled = isInfiniteSize(next.size)
    ? Number(next.moveCount ?? next.moves?.length ?? 0)
    : (next.board || []).reduce((count, cell) => count + (cell ? 1 : 0), 0);
  if (
    !options.initial &&
    state.online.lastBoardCount !== null &&
    filled > state.online.lastBoardCount
  ) {
    audio.play('meow');
  }
  state.online.lastBoardCount = filled;
}

function showWaitingRoom(next, options = {}) {
  setMode('online');
  state.online.lastBoardCount = 0;
  const wasRoom = state.screen === 'room';
  showScreen('room');
  updateRoomInfo();
  if (!wasRoom || options.initial) focusElement($('btn-copy'));
}

function enterOnlineGameScreen() {
  cancelAiTimer();
  state.game = null;
  const room = state.online.roomState;
  const size = isValidBoardSize(room?.size) ? room.size : 3;
  const infinite = isInfiniteSize(size);
  setMode('online');
  if (infinite) {
    setBoardSize(3);
    setInfiniteVisible(true);
    startInfiniteSession();
  } else {
    setInfiniteVisible(false);
    stopInfiniteSession();
    setBoardSize(size);
  }
  updateModeLabel();
  updateSoundButton();
  if (!infinite) setBoardLabel(t('boardLabel', { size }));
  $('game-rule').textContent = infinite
    ? t('infRuleFull')
    : t('winRule', {
        n: room?.winLength || winLengthFor(size),
      });
  $('emote-bar').hidden = false;
  $('game-record').hidden = true;
  $('result-card').hidden = true;
  $('left-dot').hidden = false;
  $('right-dot').hidden = false;
  $('turn-timer').hidden = true;
  clearWinLine();
  clearEmoteBubbles();
  setStatus('', '');
  setBanner('');
  showScreen('game');
  if (infinite) resetInfiniteView();
  else resetBoardFocus();
}

function syncOnlineView() {
  const next = state.online.roomState;
  if (!next || next.status === 'waiting') return;

  if (next.youVotedRematch) state.online.rematchPending = false;

  const you = next.players.find((player) => player.isYou);
  const opponent = next.players.find((player) => !player.isYou);
  const youSymbol = you?.symbol || state.online.youSymbol || 'A';
  state.online.youSymbol = youSymbol;

  const playing = next.status === 'playing';
  const finished = next.status === 'finished';
  const draw = next.winner === 'draw';
  const winner = next.winner;
  const opponentConnected = opponent ? opponent.connected !== false : false;

  const cardFor = (symbol) => {
    const player = next.players.find((item) => item.symbol === symbol);
    const isYou = player?.isYou === true;
    return {
      name: player?.name || (symbol === 'A' ? t('orangeCat') : t('grayCat')),
      avatar: player?.avatar || (symbol === 'A' ? 'orange' : 'gray'),
      tag: `${isYou ? t('youBadge') : t('opponentBadge')} · ${
        symbol === 'A' ? t('orangeCat') : t('grayCat')
      }`,
      score: next.score?.[symbol] ?? 0,
      online: true,
      connected: player ? player.connected !== false : false,
      active: playing && next.turn === symbol,
      winner: finished && !draw && winner === symbol,
      loser: finished && !draw && winner !== symbol,
    };
  };

  setPlayerCard('left', cardFor('A'));
  setPlayerCard('right', cardFor('B'));

  const locked =
    !playing || next.turn !== youSymbol || state.online.pendingMove !== null;
  const infinite = isInfiniteSize(next.size);
  const size = isValidBoardSize(next.size) ? next.size : 3;
  if (infinite) {
    renderInfinite({
      moves: Array.isArray(next.moves) ? next.moves : [],
      region: next.region,
      lastMove: next.lastMove,
      winLine: next.winLine,
      locked,
      preview: playing && next.turn === youSymbol ? youSymbol : null,
      maxMoves: next.maxMoves,
      drawLimit: state.online.finishReason === 'maxMoves' || isInfiniteLimitDraw(next),
      expressionFor: (symbol) => {
        if (!finished) return 'normal';
        if (draw) return 'sleep';
        return symbol === winner ? 'win' : 'lose';
      },
    });
    refreshInfiniteText();
    $('game-rule').textContent = t('infRuleFull');
  } else {
    renderBoard(next.board, {
      locked,
      preview: playing && next.turn === youSymbol ? youSymbol : null,
      expressionFor: (symbol) => {
        if (!finished) return 'normal';
        if (draw) return 'sleep';
        return symbol === winner ? 'win' : 'lose';
      },
      lastMove: next.lastMove,
    });
    setBoardLabel(t('boardLabel', { size }));
    $('game-rule').textContent = t('winRule', {
      n: next.winLength || winLengthFor(size),
    });
  }

  if (!infinite) {
    if (finished && next.winLine) showWinLine(next.winLine);
    else clearWinLine();
  }

  updateModeLabel();

  if (finished) {
    setStatus('', '');
    showResult(onlineResultText(), onlineActions(next, opponentConnected));
    if (
      next.rematchVotes > 0 &&
      !next.youVotedRematch &&
      !state.online.rematchToastShown
    ) {
      state.online.rematchToastShown = true;
      toast(t('rematchAsked'), 'info', 2800);
    }
  } else {
    hideResult();
    if (!opponentConnected) setStatus(t('oppDisconnectedStatus'), '');
    else if (next.turn === youSymbol) setStatus(t('yourTurn'), '');
    else setStatus(t('waitOpponent', { name: displayName(next.turn) }), '');
  }
}

function isInfiniteLimitDraw(roomState) {
  if (!roomState || roomState.winner !== 'draw') return false;
  const max = Number(roomState.maxMoves);
  const count = Number(roomState.moveCount ?? roomState.moves?.length ?? 0);
  return max > 0 && count >= max;
}

function onlineResultText() {
  const next = state.online.roomState;
  if (!next) return '';
  if (state.online.finishReason === 'maxMoves' || isInfiniteLimitDraw(next)) {
    return t('maxMovesTitle');
  }
  if (next.winner === 'draw') return t('drawTitle');
  const name = displayName(next.winner);
  if (state.online.finishReason === 'abandon') return t('abandonTitle', { name });
  return t('winTitle', { name });
}

function onlineActions(next, opponentConnected) {
  const youVoted = next.youVotedRematch === true || state.online.rematchPending;
  const disabled = youVoted || !opponentConnected;
  return {
    primary: {
      label: youVoted ? t('rematchWaiting') : t('rematch'),
      disabled,
      pulse: !youVoted && opponentConnected && next.rematchVotes > 0,
      title: !opponentConnected ? t('opponentOffline') : '',
      handler: voteRematch,
    },
    secondary: null,
    tertiary: {
      label: t('leaveRoom'),
      handler: () => leaveOnlineRoom(),
    },
  };
}

function voteRematch() {
  const next = state.online.roomState;
  if (!next || next.status !== 'finished' || state.online.rematchPending) return;
  const opponent = next.players.find((player) => !player.isYou);
  if (opponent && opponent.connected === false) {
    toast(t('opponentOffline'), 'error', 2400);
    return;
  }

  state.online.rematchPending = true;
  syncOnlineView();

  net
    .rematch(state.online.roomId)
    .then((response) => {
      if (!response?.ok) {
        state.online.rematchPending = false;
        syncOnlineView();
        showServerError(response?.code, response?.error);
      }
    })
    .catch(() => {
      state.online.rematchPending = false;
      syncOnlineView();
      toast(t('genericError'), 'error');
    });
}

function onOnlineCell(index) {
  const next = state.online.roomState;
  if (!next || next.status !== 'playing') return;
  if (state.online.pendingMove !== null) return;

  if (next.turn !== state.online.youSymbol) {
    shakeCell(index);
    audio.play('error');
    toast(t('notYourTurn'), 'error', 1600);
    return;
  }

  if (next.board[index]) {
    shakeCell(index);
    audio.play('error');
    toast(t('cellTaken'), 'error', 1600);
    return;
  }

  const value = Number(index);
  if (!Number.isInteger(value) || value < 0 || value >= next.board.length) return;

  state.online.pendingMove = value;
  syncOnlineView();

  net
    .move(state.online.roomId, value)
    .then((response) => {
      if (!response?.ok) {
        state.online.pendingMove = null;
        shakeCell(value);
        audio.play('error');
        showServerError(response?.code, response?.error);
        syncOnlineView();
      }
    })
    .catch(() => {
      state.online.pendingMove = null;
      syncOnlineView();
      toast(t('genericError'), 'error');
    });
}

function onOnlineInfiniteCell(x, y) {
  const next = state.online.roomState;
  if (!next || next.status !== 'playing') return;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return;
  if (state.online.pendingMove !== null) return;

  if (next.turn !== state.online.youSymbol) {
    shakeInfinite(x, y);
    audio.play('error');
    toast(t('notYourTurn'), 'error', 1600);
    return;
  }

  if (!isInRegion(next.region, x, y)) {
    shakeInfinite(x, y);
    audio.play('error');
    toast(t('coordOutsideRegion'), 'error', 1800);
    return;
  }

  const built = infiniteStateFromMoves(next.moves);
  if (built.cells.has(cellKey(x, y))) {
    shakeInfinite(x, y);
    audio.play('error');
    toast(t('cellTaken'), 'error', 1600);
    return;
  }

  state.online.pendingMove = { x, y };
  syncOnlineView();

  net
    .move(state.online.roomId, { x, y })
    .then((response) => {
      if (!response?.ok) {
        state.online.pendingMove = null;
        shakeInfinite(x, y);
        audio.play('error');
        showServerError(response?.code, response?.error);
        syncOnlineView();
      }
    })
    .catch(() => {
      state.online.pendingMove = null;
      syncOnlineView();
      toast(t('genericError'), 'error');
    });
}

function resetOnlineRoundState() {
  state.online.finishReason = null;
  state.online.celebratedKey = null;
  state.online.rematchPending = false;
  state.online.rematchToastShown = false;
  state.online.pendingMove = null;
  if (isInfiniteSize(state.online.roomState?.size)) resetInfiniteView();
  hideResult();
  clearWinLine();
  clearEmoteBubbles();
}

function handleOnlineEvent(event, payload) {
  switch (event) {
    case 'room:state':
      applyOnlineState(payload);
      break;
    case 'game:over':
      handleGameOver(payload);
      break;
    case 'game:restart':
      resetOnlineRoundState();
      audio.play('join');
      syncOnlineView();
      break;
    case 'game:timeout':
      toast(t('timeUpToast'), 'info', 2600);
      break;
    case 'emote:received':
      handleEmoteReceived(payload);
      break;
    case 'room:opponent-disconnected':
      toast(t('opponentDisconnected'), 'error', 3200);
      break;
    case 'room:opponent-reconnected':
      toast(t('opponentReconnected'), 'success', 2200);
      audio.play('join');
      break;
    case 'room:closed':
      handleRoomClosed(payload?.reason);
      break;
    case 'room:replaced':
      handleTabReplaced();
      break;
    case 'error:message':
      showServerError(payload?.code, payload?.message);
      break;
    default:
      break;
  }
}

function handleGameOver(payload) {
  const next = state.online.roomState;
  if (!next) return;

  state.online.finishReason = payload?.reason || 'win';
  const filled = isInfiniteSize(next.size)
    ? Number(next.moveCount ?? next.moves?.length ?? 0)
    : (next.board || []).join('');
  const key = `${next.id}:${filled}:${next.winner}`;

  if (state.online.celebratedKey !== key) {
    state.online.celebratedKey = key;
    const winner = payload?.winner ?? next.winner;
    if (winner === 'draw') {
      audio.play('draw');
      showSleepZ();
    } else if (winner === state.online.youSymbol) {
      audio.play('win');
      if (payload?.reason !== 'abandon') burstConfetti();
    } else {
      audio.play('lose');
    }
  }

  syncOnlineView();
}

function handleEmoteReceived(payload) {
  const emote = payload?.emote;
  if (!EMOTES.has(emote)) return;
  const symbol = payload?.symbol;
  const card = symbol === 'A' ? $('p-left') : symbol === 'B' ? $('p-right') : null;
  if (card) showEmoteBubble(card, emote);
  audio.play('emote');
}

function sendEmote(emote) {
  if (!EMOTES.has(emote)) return;
  const next = state.online.roomState;
  if (state.mode !== 'online' || !state.online.roomId || !next) return;
  if (next.status !== 'playing' && next.status !== 'finished') return;

  const now = Date.now();
  if (now - state.online.lastEmoteAt < 2000) {
    toast(t('emoteCooldown'), 'error', 1600);
    return;
  }
  state.online.lastEmoteAt = now;

  const youSymbol = state.online.youSymbol;
  const card = youSymbol === 'A' ? $('p-left') : $('p-right');
  showEmoteBubble(card, emote);
  audio.play('emote');
  setEmoteButtonsDisabled(true);
  window.setTimeout(() => setEmoteButtonsDisabled(false), 2000);

  net
    .sendEmote(state.online.roomId, emote)
    .then((response) => {
      if (!response?.ok) {
        if (response?.code === 'emoteCooldown') state.online.lastEmoteAt = Date.now();
        showServerError(response?.code, response?.error);
      }
    })
    .catch(() => {
      toast(t('genericError'), 'error');
    });
}

function setEmoteButtonsDisabled(disabled) {
  document.querySelectorAll('.emote-btn').forEach((button) => {
    button.disabled = disabled;
  });
}

function handleOnlineConnect() {
  if (!state.online.roomId || !state.online.playerKey) {
    if (!lobbyBusy && lobbyStatusKind === 'info' && state.screen === 'lobby') {
      clearLobbyStatus();
    }
    return;
  }
  if (state.online.rejoining) return;

  state.online.rejoining = true;
  setBanner(t('reconnecting'), 'warn');

  net
    .rejoin(state.online.roomId, state.online.playerKey)
    .then((response) => {
      if (!response?.ok) {
        endOnlineSession();
        goHome({ focus: false });
        toast(t('roomExpired'), 'error', 3400);
        return;
      }
      saveSession(state.online.roomId, state.online.playerKey);
      setBanner('');
      audio.play('join');
      toast(t('connectedToast'), 'success', 1800);
      applyOnlineState(response.state);
    })
    .catch(() => {
      setBanner(t('connLost'), 'error');
    })
    .finally(() => {
      state.online.rejoining = false;
    });
}

function handleOnlineDisconnect() {
  if (!state.online.roomId) return;
  stopOnlineTimer();
  updateTimer(null);
  setBanner(t('connLost'), 'error');
  state.online.pendingMove = null;
}

function handleOnlineConnectError() {
  if (state.online.roomId) {
    setBanner(t('connLost'), 'error');
    return;
  }
  if (state.screen === 'lobby' && !lobbyBusy && lobbyStatusKind !== 'error') {
    setLobbyStatus(t('genericError'), 'error');
  }
}

function handleRoomClosed(reason) {
  if (!state.online.roomId) return;
  endOnlineSession();
  goHome({ focus: false });
  const message =
    reason === 'left'
      ? t('opponentLeft')
      : reason === 'expired'
        ? t('roomExpired')
        : t('roomClosed');
  toast(message, reason === 'left' ? 'info' : 'error', 3200);
}

function handleTabReplaced() {
  if (!state.online.roomId) return;
  writeFlag(REPLACED_FLAG, '1');
  endOnlineSession({ clearSaved: false });
  goHome({ focus: false });
  toast(t('tabReplaced'), 'info', 4200);
}

function endOnlineSession({ clearSaved = true } = {}) {
  state.online.roomId = null;
  state.online.playerKey = null;
  state.online.roomState = null;
  state.online.youSymbol = null;
  state.online.pendingMove = null;
  state.online.finishReason = null;
  state.online.celebratedKey = null;
  state.online.lastBoardCount = null;
  state.online.rematchPending = false;
  state.online.rematchToastShown = false;
  stopOnlineTimer();
  stopInfiniteSession();
  setInfiniteVisible(false);
  updateTimer(null);
  clearWinLine();
  hideResult();
  clearEmoteBubbles();
  setBanner('');
  $('emote-bar').hidden = true;
  $('turn-timer').hidden = true;
  setEmoteButtonsDisabled(false);
  if (state.mode === 'online') setMode('');
  if (clearSaved) clearSession();
}

function leaveOnlineRoom({ confirm = false } = {}) {
  if (confirm && !window.confirm(t('leaveConfirm'))) return;
  const roomId = state.online.roomId;
  if (!roomId) {
    goHome();
    return;
  }

  endOnlineSession();
  if (net.connected) net.leave(roomId).catch(() => {});
  goHome({ focus: true });
  toast(t('roomLeft'), 'info', 2200);
}

function updateRoomInfo() {
  const roomId = state.online.roomId;
  if (!roomId) return;
  $('room-code').textContent = roomId;
  $('room-link').textContent = inviteUrl(roomId);

  const room = state.online.roomState;
  const info = $('room-size-info');
  if (room && isInfiniteSize(room.size)) {
    info.textContent = t('roomSizeInfoInfinite');
  } else if (room && isValidSize(room.size)) {
    info.textContent = t('roomSizeInfo', {
      size: room.size,
      n: room.winLength || winLengthFor(room.size),
    });
  } else {
    info.textContent = '';
  }
}

function inviteUrl(code) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code);
  return url.href;
}

function stripRoomParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('room')) return;
  url.searchParams.delete('room');
  const next = `${url.pathname}${url.search ? url.search : ''}${url.hash}`;
  try {
    window.history.replaceState(null, '', next);
  } catch {
    /* bo qua */
  }
}

function startOnlineTimer(leftMs, totalMs) {
  stopOnlineTimer();
  onlineTimerTotal = totalMs || 30000;
  onlineTimerDeadline = Date.now() + Math.max(0, leftMs);

  const tick = () => {
    const left = onlineTimerDeadline - Date.now();
    updateTimer(Math.max(0, left), onlineTimerTotal);
    if (left <= 0) stopOnlineTimer();
  };

  tick();
  onlineTimerId = window.setInterval(tick, 250);
}

function stopOnlineTimer() {
  if (onlineTimerId !== null) {
    window.clearInterval(onlineTimerId);
    onlineTimerId = null;
  }
}

function updateOnlineTimer(next) {
  if (next.status === 'playing') {
    $('turn-timer').hidden = false;
    if (next.turnEndsIn === null || next.turnEndsIn === undefined) {
      stopOnlineTimer();
      updateTimer(null);
    } else {
      startOnlineTimer(next.turnEndsIn, next.turnMs);
    }
  } else {
    stopOnlineTimer();
    $('turn-timer').hidden = true;
    const fallback = isInfiniteSize(next.size) ? 45000 : 30000;
    updateTimer(0, next.turnMs || fallback);
  }
}

async function tryResumeSession() {
  const session = loadSession();
  if (!session) return false;
  if (Date.now() - session.at > SESSION_TTL) {
    clearSession();
    return false;
  }
  if (readFlag(REPLACED_FLAG) === '1') return false;

  setLoading(true, t('loading'));
  try {
    await net.connect();
    const response = await net.rejoin(session.roomId, session.playerKey);
    if (!response?.ok || !response.state) {
      clearSession();
      setLoading(false);
      toast(t('rejoinFailed'), 'error', 3000);
      return false;
    }

    state.online.roomId = response.roomId || session.roomId;
    state.online.playerKey = session.playerKey;
    state.online.roomState = response.state;
    state.online.pendingMove = null;
    state.online.finishReason = null;
    state.online.celebratedKey = null;
    state.online.lastBoardCount = null;

    saveSession(state.online.roomId, session.playerKey);
    setLoading(false);
    setBanner('');
    applyOnlineState(response.state, { initial: true });
    return true;
  } catch {
    setLoading(false);
    toast(t('genericError'), 'error', 3200);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Am thanh / cai dat / bang diem
// ---------------------------------------------------------------------------
function updateSoundButton() {
  const button = $('game-sound');
  if (!button) return;
  button.textContent = state.settings.sound ? '🔊' : '🔇';
  button.setAttribute('aria-pressed', String(state.settings.sound));
  button.setAttribute('aria-label', t('sound'));
}

function toggleSound() {
  state.settings.sound = !state.settings.sound;
  audio.setEnabled(state.settings.sound);
  if (state.settings.sound) {
    audio.unlock();
    audio.play('meow');
  }
  saveSettings(state.settings);
  updateSoundButton();
  const checkbox = $('set-sound');
  if (checkbox) checkbox.checked = state.settings.sound;
}

function populateSettings() {
  $('set-sound').checked = state.settings.sound;
  $('set-music').checked = state.settings.music;
  $('set-motion').checked = state.settings.reduceMotion;
  $('set-lang').value = state.settings.lang;
  updateSoundButton();
}

function applyLanguage(lang) {
  state.settings.lang = lang === 'en' ? 'en' : 'vi';
  saveSettings(state.settings);
  setLang(state.settings.lang);
  applyI18n(document);

  renderAvatarChoices();
  renderLobbyProfile();
  renderAllSizeGrids();
  renderScoreSizeOptions();
  renderScores();
  refreshInfiniteText();
  updateSoundButton();
  renderAuthAvatars();
  updatePasswordStrength();
  refreshAuthInviteNote();
  if (state.account.user) renderAccountUI();
  else syncNameInput();

  if (state.screen === 'lobby') clearLobbyStatus();
  if (state.screen === 'room') updateRoomInfo();
  if (state.screen === 'history') {
    renderHistoryFilters();
    renderHistory();
  }
  if (state.screen === 'stats') renderStats();
  if (state.screen === 'profile' && state.account.user) {
    renderProfileAvatars(profileAvatar);
    $('profile-name-input').value = state.account.user.displayName;
  }
  if (state.pendingInvite && $('dialog-invite').open) {
    showInviteDialog(state.pendingInvite);
  }

  if (state.screen === 'game') {
    updateModeLabel();
    if (state.mode === 'online' && state.online.roomState) syncOnlineView();
    else if (state.mode === 'replay' && state.replay.match) renderReplayFrame();
    else if (state.game) renderLocalGame();
  }
}

function scoreRow({ avatar, name, stats }) {
  const row = document.createElement('div');
  row.className = 'score-row';

  const avatarEl = document.createElement('span');
  avatarEl.className = 'score-avatar';
  avatarEl.innerHTML = catAvatar(avatar);

  const nameEl = document.createElement('span');
  nameEl.className = 'score-name';
  nameEl.textContent = name;

  const statsEl = document.createElement('span');
  statsEl.className = 'score-stats';

  for (const stat of stats) {
    const statEl = document.createElement('span');
    statEl.className = `stat ${stat.type}`;
    const value = document.createElement('b');
    value.textContent = String(stat.value);
    statEl.append(value, document.createTextNode(stat.label));
    statsEl.appendChild(statEl);
  }

  row.append(avatarEl, nameEl, statsEl);
  return row;
}

function scoreGroup(title, rows) {
  const group = document.createElement('div');
  group.className = 'score-group';
  const heading = document.createElement('h3');
  heading.textContent = title;
  group.appendChild(heading);
  rows.forEach((row) => group.appendChild(row));
  return group;
}

function renderScoreSizeOptions() {
  const select = $('scores-size');
  if (!select) return;
  select.textContent = '';
  for (const size of BOARD_SIZES) {
    const option = document.createElement('option');
    option.value = String(size);
    option.textContent = isInfiniteSize(size)
      ? t('scoresInfinite')
      : `${size}×${size} · ${t('sizeRuleShort', { n: winLengthFor(size) })}`;
    select.appendChild(option);
  }
  select.value = String(state.scoreViewSize);
}

function renderScores() {
  const body = $('scores-body');
  if (!body) return;
  body.textContent = '';

  const size = isValidBoardSize(state.scoreViewSize) ? state.scoreViewSize : 3;
  const aiBucket = state.scores.ai[size] || {};
  const localBucket = state.scores.local[size] || { A: 0, B: 0, draw: 0 };

  const aiRows = ['easy', 'medium', 'hard'].map((difficulty) => {
    const record = aiBucket[difficulty] || { w: 0, d: 0, l: 0 };
    return scoreRow({
      avatar: DIFFICULTY_THEME[difficulty],
      name: t(difficulty),
      stats: [
        { value: record.w, label: t('wins'), type: 'win' },
        { value: record.d, label: t('draws'), type: 'draw' },
        { value: record.l, label: t('losses'), type: 'loss' },
      ],
    });
  });

  const localRows = [
    scoreRow({
      avatar: currentProfile().avatar,
      name: displayName('A'),
      stats: [{ value: localBucket.A, label: t('wins'), type: 'win' }],
    }),
    scoreRow({
      avatar: 'gray',
      name: t('localGuest'),
      stats: [{ value: localBucket.B, label: t('wins'), type: 'win' }],
    }),
    scoreRow({
      avatar: 'calico',
      name: t('draws'),
      stats: [{ value: localBucket.draw, label: t('draws'), type: 'draw' }],
    }),
  ];

  const heading = document.createElement('p');
  heading.className = 'scores-size-note';
  heading.textContent = isInfiniteSize(size)
    ? t('infRuleSize')
    : t('winRuleShort', { size, n: winLengthFor(size) });

  body.append(
    heading,
    scoreGroup(t('vsAI'), aiRows),
    scoreGroup(t('localMode'), localRows)
  );

  const reset = $('btn-reset-scores');
  if (reset) {
    reset.textContent = isInfiniteSize(size)
      ? t('resetScoresInfinite')
      : t('resetScoresSize', { size });
  }
}

function openDialog(id) {
  const dialog = $(id);
  if (!dialog) return;
  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
}

// ---------------------------------------------------------------------------
// Copy / share
// ---------------------------------------------------------------------------
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* roi xuong phuong an du phong */
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

async function copyRoomCode() {
  const code = state.online.roomId;
  if (!code) return;
  if (await copyText(code)) toast(t('copiedCode'), 'success', 2200);
  else toast(t('copyFailed'), 'error', 3000);
}

async function shareRoomLink() {
  const code = state.online.roomId;
  if (!code) return;
  const url = inviteUrl(code);
  const text = t('shareText', { code });

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: t('shareTitle'), text, url });
      return;
    } catch (error) {
      if (error && error.name === 'AbortError') return;
    }
  }

  if (await copyText(url)) toast(t('copiedLink'), 'success', 2400);
  else toast(t('copyFailed'), 'error', 3000);
}

// ---------------------------------------------------------------------------
// Xu ly o co
// ---------------------------------------------------------------------------
function handleCell(index, y) {
  if (state.mode === 'online') {
    if (isInfiniteSize(state.online.roomState?.size)) onOnlineInfiniteCell(index, y);
    else onOnlineCell(index);
    return;
  }
  if (state.mode === 'ai' || state.mode === 'local') onLocalCell(index, y);
}

// ---------------------------------------------------------------------------
// Gan su kien
// ---------------------------------------------------------------------------
function setupAccountEvents() {
  $('btn-login-home').addEventListener('click', () => openAuth('login'));
  $('btn-register-home').addEventListener('click', () => openAuth('register'));
  $('btn-logout').addEventListener('click', logoutAccount);
  document.querySelectorAll('[data-account]').forEach((button) => {
    button.addEventListener('click', () => {
      const which = button.dataset.account;
      if (which === 'profile') openProfile();
      else if (which === 'history') openHistory();
      else if (which === 'stats') openStats();
    });
  });

  $('auth-back').addEventListener('click', () => {
    state.pendingRoom = null;
    stripRoomParam();
    goHome();
  });
  $('auth-tab-login').addEventListener('click', () => switchAuthTab('login'));
  $('auth-tab-register').addEventListener('click', () => switchAuthTab('register'));
  document.querySelectorAll('[data-toggle-password]').forEach((button) => {
    button.addEventListener('click', () => togglePasswordVisibility(button));
  });
  $('register-password').addEventListener('input', updatePasswordStrength);
  $('login-form').addEventListener('submit', loginFlow);
  $('register-form').addEventListener('submit', registerFlow);
  $('btn-auth-guest').addEventListener('click', guestFlow);

  $('profile-back').addEventListener('click', () => goHome());
  $('profile-save').addEventListener('click', saveProfileFlow);
  $('password-form').addEventListener('submit', changePasswordFlow);
  $('delete-account').addEventListener('click', deleteAccountFlow);

  $('history-back').addEventListener('click', () => goHome());
  $('history-size').addEventListener('change', (event) => {
    state.history.size = event.target.value;
    loadHistory(true);
  });
  $('history-result').addEventListener('change', (event) => {
    state.history.result = event.target.value;
    loadHistory(true);
  });
  $('history-more').addEventListener('click', () => loadHistory(false));

  $('stats-back').addEventListener('click', () => goHome());

  $('invite-join').addEventListener('click', joinInviteRoom);
  $('invite-home').addEventListener('click', leaveInvite);
  $('dialog-invite').addEventListener('close', () => {
    if (state.pendingInvite) {
      state.pendingInvite = null;
      stripRoomParam();
      if (state.screen === 'lobby') goHome();
    }
  });
}

function setupReplayEvents() {
  $('replay-first').addEventListener('click', () => setReplayIndex(0));
  $('replay-prev').addEventListener('click', () =>
    setReplayIndex(Math.max(0, state.replay.index - 1))
  );
  $('replay-next').addEventListener('click', () => {
    const total = state.replay.match?.moves.length || 0;
    setReplayIndex(Math.min(total, state.replay.index + 1));
  });
  $('replay-last').addEventListener('click', () =>
    setReplayIndex(state.replay.match?.moves.length || 0)
  );
  $('replay-play').addEventListener('click', toggleReplayPlayback);
  $('replay-range').addEventListener('input', (event) => {
    stopReplayPlayback();
    state.replay.index = Number(event.target.value) || 0;
    renderReplayFrame();
  });
  $('replay-speed').addEventListener('change', (event) => {
    state.replay.speed = Number(event.target.value) || 1;
    if (state.replay.playing) scheduleReplayStep();
  });
  $('replay-exit').addEventListener('click', exitReplay);
}

function setupHomeEvents() {
  $('btn-ai').addEventListener('click', openAISetup);
  $('btn-local').addEventListener('click', openLocalSetup);
  $('btn-online').addEventListener('click', enterLobby);

  $('btn-settings').addEventListener('click', () => {
    populateSettings();
    openDialog('dialog-settings');
  });
  $('btn-howto').addEventListener('click', () => openDialog('dialog-howto'));
  $('btn-scores').addEventListener('click', () => {
    renderScoreSizeOptions();
    renderScores();
    openDialog('dialog-scores');
  });

  const nameInput = $('name-input');
  nameInput.addEventListener('input', () => {
    const stripped = stripName(nameInput.value);
    if (nameInput.value !== stripped) nameInput.value = stripped;
    state.profile.name = stripped;
    saveProfile({ name: stripped, avatar: state.profile.avatar });
    renderLobbyProfile();
  });
  nameInput.addEventListener('blur', () => {
    const name = cleanName(nameInput.value) || t('defaultName');
    nameInput.value = name;
    state.profile.name = name;
    saveProfile(currentProfile());
    renderLobbyProfile();
  });
}

function setupSetupEvents() {
  $('ai-setup-back').addEventListener('click', () => goHome());

  document.querySelectorAll('.difficulty-card').forEach((button) => {
    button.addEventListener('click', () => {
      state.ai.difficulty = button.dataset.difficulty || 'easy';
      updateSetupSelection();
      audio.play('click');
    });
  });

  document.querySelectorAll('#first-row .choice-btn').forEach((button) => {
    button.addEventListener('click', () => {
      state.ai.firstChoice = button.dataset.first || 'random';
      updateSetupSelection();
      audio.play('click');
    });
  });

  $('start-ai').addEventListener('click', startAIGame);
}

function setupLocalSetupEvents() {
  $('local-setup-back').addEventListener('click', () => goHome());
  $('start-local').addEventListener('click', () => startLocalGame('A'));
}

function setupLobbyEvents() {
  $('lobby-back').addEventListener('click', () => goHome());
  $('btn-create-room').addEventListener('click', createRoomFlow);
  $('join-form').addEventListener('submit', (event) => {
    event.preventDefault();
    joinRoomFlow();
  });

  const roomInput = $('room-input');
  roomInput.addEventListener('input', () => {
    const normalized = normalizeRoomCode(roomInput.value);
    if (roomInput.value !== normalized) roomInput.value = normalized;
    if (lobbyStatusKind === 'error') clearLobbyStatus();
  });
}

function setupRoomEvents() {
  $('room-back').addEventListener('click', () => leaveOnlineRoom({ confirm: true }));
  $('btn-leave-room').addEventListener('click', () => leaveOnlineRoom());
  $('btn-copy').addEventListener('click', copyRoomCode);
  $('btn-share').addEventListener('click', shareRoomLink);
}

function setupGameEvents() {
  $('game-back').addEventListener('click', () => {
    if (state.mode === 'online' && state.online.roomId) {
      leaveOnlineRoom({ confirm: true });
      return;
    }
    goHome();
  });

  $('game-sound').addEventListener('click', toggleSound);

  document.querySelectorAll('.emote-btn').forEach((button) => {
    button.addEventListener('click', () => sendEmote(button.dataset.emote));
  });
}

function setupDialogs() {
  document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => {
      const dialog = $(button.dataset.close);
      if (dialog) dialog.close();
    });
  });

  document.querySelectorAll('dialog.modal').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  $('set-sound').addEventListener('change', (event) => {
    state.settings.sound = event.target.checked;
    audio.setEnabled(state.settings.sound);
    if (state.settings.sound) {
      audio.unlock();
      audio.play('meow');
    }
    saveSettings(state.settings);
    updateSoundButton();
  });

  $('set-music').addEventListener('change', (event) => {
    state.settings.music = event.target.checked;
    audio.unlock();
    audio.setMusicEnabled(state.settings.music);
    saveSettings(state.settings);
  });

  $('set-motion').addEventListener('change', (event) => {
    state.settings.reduceMotion = event.target.checked;
    document.body.classList.toggle('reduce-motion', state.settings.reduceMotion);
    saveSettings(state.settings);
  });

  $('set-lang').addEventListener('change', (event) => {
    applyLanguage(event.target.value);
  });

  $('btn-reset-scores').addEventListener('click', () => {
    const size = isValidBoardSize(state.scoreViewSize) ? state.scoreViewSize : 3;
    const infinite = isInfiniteSize(size);
    const confirmText = infinite
      ? t('resetConfirmInfinite')
      : t('resetConfirmSize', { size });
    if (!window.confirm(confirmText)) return;
    state.scores = resetScoresForSize(state.scores, size);
    renderScores();
    if (state.screen === 'game' && state.game && state.game.size === size) {
      setCardsForLocal();
      updateRecordLocal();
    }
    toast(
      infinite ? t('resetDoneInfinite') : t('resetDoneSize', { size }),
      'success',
      2200
    );
  });

  const scoresSize = $('scores-size');
  if (scoresSize) {
    scoresSize.addEventListener('change', (event) => {
      const raw = event.target.value;
      const next = raw === INFINITE_SIZE ? INFINITE_SIZE : Number(raw);
      state.scoreViewSize = isValidBoardSize(next) ? next : 3;
      renderScores();
    });
  }
}

function setupAudioUnlock() {
  const unlock = () => {
    audio.unlock();
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', unlock);
  };
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
}

function setupNetworkWatchers() {
  window.addEventListener('offline', () => {
    if (state.online.roomId) setBanner(t('connLost'), 'error');
  });
  window.addEventListener('online', () => {
    if (state.online.roomId) setBanner(t('reconnecting'), 'warn');
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// ---------------------------------------------------------------------------
// Khoi dong
// ---------------------------------------------------------------------------
async function routeInitial() {
  const params = new URLSearchParams(window.location.search);
  const rawRoom = params.get('room');
  if (rawRoom !== null && rawRoom.trim() !== '') {
    const code = normalizeRoomCode(rawRoom);
    if (code.length !== 5) {
      stripRoomParam();
      goHome({ focus: false });
      toast(t('invalidCode'), 'error', 3000);
      return;
    }
    if (!state.account.user) {
      state.pendingRoom = code;
      openAuth('login');
      return;
    }
    await openInviteRoom(code);
    return;
  }

  const resumed = await tryResumeSession();
  if (!resumed) {
    showScreen('home');
    state.screen = 'home';
  }
}

function init() {
  state.profile = loadProfile();
  state.settings = loadSettings();
  state.scores = loadScores();

  setLang(state.settings.lang);
  applyI18n(document);
  document.body.classList.toggle('reduce-motion', state.settings.reduceMotion);

  audio.setEnabled(state.settings.sound);
  audio.setMusicEnabled(state.settings.music);

  injectVisuals();
  renderAvatarChoices();
  renderAuthAvatars();
  syncNameInput();
  renderLobbyProfile();
  populateSettings();
  renderAllSizeGrids();
  renderScoreSizeOptions();
  renderScores();
  updateSetupSelection();
  updateSoundButton();
  renderAccountUI();

  initBoard({
    size: state.settings.boardSize,
    catFor: (symbol, expression) =>
      catFace(PIECE_THEME[symbol] || 'orange', expression),
    labelFor: (index, value) => {
      const size =
        state.mode === 'online'
          ? isValidSize(state.online.roomState?.size)
            ? state.online.roomState.size
            : 3
          : state.game?.size || state.settings.boardSize;
      const row = Math.floor(index / size) + 1;
      const col = (index % size) + 1;
      if (!value) return t('cellEmpty', { row, col });
      return t('cellTakenName', { row, col, name: displayName(value) });
    },
    onCell: handleCell,
  });

  initInfiniteBoard({
    catFor: (symbol, expression) =>
      catFace(PIECE_THEME[symbol] || 'orange', expression),
    nameFor: displayName,
    onCell: handleCell,
  });

  setupHomeEvents();
  setupAccountEvents();
  setupSetupEvents();
  setupLocalSetupEvents();
  setupLobbyEvents();
  setupRoomEvents();
  setupGameEvents();
  setupReplayEvents();
  setupDialogs();
  setupAudioUnlock();
  setupNetworkWatchers();
  registerServiceWorker();

  refreshAccount().finally(routeInitial);
}

init();
