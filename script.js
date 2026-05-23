const screens = {
  onboard: document.querySelector("#screen-onboard"),
  home: document.querySelector("#screen-home"),
  group: document.querySelector("#screen-group"),
  camera: document.querySelector("#screen-camera"),
  rank: document.querySelector("#screen-rank"),
  profile: document.querySelector("#screen-profile"),
  billing: document.querySelector("#screen-billing"),
  create: document.querySelector("#screen-create"),
  success: document.querySelector("#screen-success"),
};

const state = {
  user: {
    id: "user_demo",
    name: "Jij",
    email: "",
    initial: "Y",
  },
  supabase: {
    url: "",
    anonKey: "",
    userId: "",
    email: "",
    sessionActive: false,
    ready: false,
  },
  groups: {},
  membersByGroup: {},
  activeGroupId: "",
  group: {
    id: "group_demo",
    name: "Team Iron Pact",
    deadline: "22:00",
    feeLabel: "EUR 10",
    destinationLabel: "Platform fee, geen cash-out",
    membersCount: 4,
  },
  apiBase: "",
  streak: 11,
  verifiedCount: 6,
  todayChecks: 2,
  activeExerciseIndex: 2,
  tracePercent: 0,
  traceCleanMs: 0,
  traceRequiredMs: 10_000,
  traceLastTickAt: 0,
  trust: 92,
  form: 88,
  visionMode: "demo",
  cameraPaused: false,
  sheetAction: null,
  sheetLastFocus: null,
  paymentSetup: false,
  feeDestination: "platform",
  onboardingMode: "setup",
  onboardingReturnTo: "home",
  onboardingGroupMode: "create",
  sheetSecondaryAction: null,
  lastBackendSyncAt: 0,
  lastBackendGroupSaveAt: 0,
  lastBackendCheckinAt: 0,
  onboardingComplete: false,
  successKind: "workout",
  lastCheckoutSessionId: "",
  stripeCustomerId: "",
  stripeSubscriptionId: "",
  stripePaymentMethodId: "",
  stripeSetupIntentId: "",
  stripeReady: false,
  lastSetupSessionId: "",
  paymentMandateSetup: false,
  createDraftGroupId: "",
  createDraftJoinCode: "",
  createDraftHydrated: false,
  inviteGroupPayload: null,
  apiStatusKind: "bad",
};

const STORAGE_KEY = "pressure.mvp.v1";
const API_BASE_KEY = "pressureApiBase";
const SUPABASE_URL_KEY = "pressureSupabaseUrl";
const SUPABASE_ANON_KEY = "pressureSupabaseAnonKey";
const ONBOARD_DRAFT_KEY = "pressureOnboardingDraftV1";
const CREATE_DRAFT_KEY = "pressureCreateDraftV1";
const LEDGER_STORAGE_KEY = "pressure.ledger.v1";

function loadCreateDraft() {
  try {
    const raw = localStorage.getItem(CREATE_DRAFT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      name: String(parsed.name || "").trim(),
      deadline: String(parsed.deadline || "").trim(),
      feeLabel: String(parsed.feeLabel || "").trim(),
      destinationLabel: String(parsed.destinationLabel || "").trim(),
    };
  } catch {
    return null;
  }
}

function clearCreateDraft() {
  try {
    localStorage.removeItem(CREATE_DRAFT_KEY);
  } catch {
    // ignore
  }
}

function saveCreateDraft(payload) {
  try {
    localStorage.setItem(CREATE_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota
  }
}

function loadLedgerStore() {
  try {
    const raw = localStorage.getItem(LEDGER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveLedgerStore(next) {
  const store = loadLedgerStore();
  const merged = { ...store, ...next };
  try {
    localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // ignore quota
  }
  return merged;
}

function normalizeLedgerEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || raw.entry_id || "").trim() || newId("led");
  const groupId = String(raw.groupId || raw.group_id || "").trim();
  if (!groupId) return null;
  const createdAt = String(raw.createdAt || raw.created_at || "").trim() || new Date().toISOString();
  const kind = String(raw.kind || "note").trim();
  const userId = String(raw.userId || raw.user_id || "").trim();
  const displayName = String(raw.displayName || raw.display_name || "").trim();
  const amountCents = Number(raw.amountCents ?? raw.amount_cents ?? 0) || 0;
  const currency = String(raw.currency || "eur").trim().toLowerCase();
  const description = String(raw.description || "").trim();
  const status = String(raw.status || "ok").trim();
  const paymentIntentId = String(raw.paymentIntentId || raw.payment_intent_id || "").trim();
  return {
    id,
    groupId,
    createdAt,
    kind,
    userId,
    displayName,
    amountCents,
    currency,
    description,
    status,
    paymentIntentId,
  };
}

function ledgerEntriesForGroup(groupId) {
  const store = loadLedgerStore();
  const entries = store?.[groupId];
  return Array.isArray(entries) ? entries.map(normalizeLedgerEntry).filter(Boolean) : [];
}

function upsertLedgerEntryLocal(entry) {
  const normalized = normalizeLedgerEntry(entry);
  if (!normalized) return null;
  const existing = ledgerEntriesForGroup(normalized.groupId);
  const next = [normalized, ...existing.filter((item) => item && item.id !== normalized.id)];
  next.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  saveLedgerStore({ [normalized.groupId]: next.slice(0, 250) });
  return normalized;
}

function loadModel() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveModel(next) {
  const current = loadModel() || {};
  const merged = { ...current, ...next };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // ignore storage quota errors in prototype
  }
  return merged;
}

function ensureIds() {
  if (!state.user.id) state.user.id = newId("user");
  if (!state.group.id) state.group.id = newId("group");
  if (!state.activeGroupId) state.activeGroupId = state.group.id;
}

function newId(prefix) {
  const uuid =
    globalThis.crypto?.randomUUID?.bind(globalThis.crypto) ||
    (() => `${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`);
  return `${prefix}_${uuid()}`;
}

function normalizeSupabaseUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    return url.origin;
  } catch {
    return "";
  }
}

function normalizeSupabaseAnonKey(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value.length < 20) return "";
  return value;
}

function supabaseConfigured() {
  return Boolean(state.supabase?.url && state.supabase?.anonKey);
}

let supabaseClientPromise = null;
async function getSupabaseClient() {
  if (!supabaseConfigured()) return null;
  if (supabaseClientPromise) return supabaseClientPromise;
  supabaseClientPromise = (async () => {
    const mod = await import("https://esm.sh/@supabase/supabase-js@2");
    return mod.createClient(state.supabase.url, state.supabase.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  })();
  return supabaseClientPromise;
}

async function refreshSupabaseSession({ silent = true } = {}) {
  const client = await getSupabaseClient();
  if (!client) {
    state.supabase.sessionActive = false;
    state.supabase.ready = false;
    persistCoreState();
    syncSupabaseStatusPill();
    return null;
  }
  try {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const session = data?.session || null;
    state.supabase.sessionActive = Boolean(session?.access_token);
    state.supabase.userId = String(session?.user?.id || "");
    state.supabase.email = String(session?.user?.email || "");
    state.supabase.ready = true;
    persistCoreState();
    syncSupabaseStatusPill();
    if (!silent && !state.supabase.sessionActive) {
      showSheet({
        label: "Supabase",
        title: "Log in om te syncen",
        message: "Supabase is ingesteld, maar je bent niet ingelogd. Gebruik magic link login in onboarding.",
      });
    }
    return session;
  } catch (error) {
    console.warn("supabase_session_failed", error);
    state.supabase.sessionActive = false;
    state.supabase.ready = false;
    persistCoreState();
    syncSupabaseStatusPill();
    if (!silent) {
      showSheet({
        label: "Supabase",
        title: "Supabase niet bereikbaar",
        message: "Controleer Supabase URL/anon key en probeer opnieuw.",
      });
    }
    return null;
  }
}

function syncSupabaseStatusPill() {
  const pill = document.querySelector("#onboard-supabase-pill");
  if (!(pill instanceof HTMLElement)) return;
  if (!supabaseConfigured()) {
    pill.textContent = "Uit";
    pill.className = "small-pill neutral";
    return;
  }
  if (state.supabase.sessionActive) {
    pill.textContent = "Ingelogd";
    pill.className = "small-pill ok";
    return;
  }
  if (state.supabase.ready) {
    pill.textContent = "Klaar";
    pill.className = "small-pill neutral";
    return;
  }
  pill.textContent = "Ongetest";
  pill.className = "small-pill neutral";
}

function localJoinCodeFromGroupId(groupId) {
  const raw = String(groupId || "").trim();
  if (!raw) return "";
  const normalized = raw.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const tail = normalized.slice(-6) || Math.random().toString(16).slice(2, 8);
  return `code_local_${tail.padStart(6, "0")}`;
}

function ensureLocalJoinCodeForGroupId(groupId) {
  const id = String(groupId || "").trim();
  if (!id) return "";
  const existing = String(state.groups?.[id]?.joinCode || state.groups?.[id]?.join_code || "").trim();
  if (existing && existing !== id) return existing;
  const joinCode = localJoinCodeFromGroupId(id);
  if (!joinCode) return "";
  state.groups[id] = { ...(state.groups[id] || {}), joinCode };
  if (state.group?.id === id) state.group = { ...state.group, joinCode };
  persistCoreState();
  return joinCode;
}

function findLocalGroupByCode(rawCode) {
  const code = String(rawCode || "").trim();
  if (!code) return null;
  if (state.groups?.[code]) return state.groups[code];
  const groups = Object.values(state.groups || {});
  return groups.find((group) => String(group?.joinCode || group?.join_code || "").trim() === code) || null;
}

function normalizeStoredGroups(value) {
  if (!value) return {};
  if (Array.isArray(value)) {
    return value.reduce((acc, group) => {
      if (group?.id) acc[group.id] = group;
      return acc;
    }, {});
  }
  if (typeof value === "object") return { ...value };
  return {};
}

function normalizeBackendGroup(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = raw.id || raw.group_id || raw.groupId;
  if (!id) return null;
  const joinCode = String(raw.joinCode || raw.join_code || "").trim();
  return {
    id,
    name: raw.name || "Nieuwe groep",
    deadline: raw.deadline || "22:00",
    feeLabel: raw.feeLabel || raw.fee_label || "EUR 10",
    destinationLabel: raw.destinationLabel || raw.destination_label || "Platform fee, geen cash-out",
    membersCount: Number(raw.membersCount ?? raw.members_count ?? 4) || 4,
    joinCode,
  };
}

function normalizeBackendProfile(raw) {
  if (!raw || typeof raw !== "object") return null;
  const userId = String(raw.user_id || raw.userId || raw.id || "").trim();
  if (!userId) return null;
  const name = String(raw.name || "").trim();
  const email = String(raw.email || "").trim();
  const stripeCustomerId = String(raw.stripe_customer_id || raw.stripeCustomerId || "").trim();
  const stripeSubscriptionId = String(raw.stripe_subscription_id || raw.stripeSubscriptionId || "").trim();
  const stripePaymentMethodId = String(raw.stripe_payment_method_id || raw.stripePaymentMethodId || "").trim();
  return { userId, name, email, stripeCustomerId, stripeSubscriptionId, stripePaymentMethodId };
}

function upsertGroup(group) {
  if (!group?.id) return;
  state.groups[group.id] = { ...(state.groups[group.id] || {}), ...group };
}

function normalizeStoredMembers(value) {
  if (!value || typeof value !== "object") return {};
  const next = {};
  Object.entries(value).forEach(([groupId, members]) => {
    if (!groupId) return;
    if (!members || typeof members !== "object") return;
    next[groupId] = { ...members };
  });
  return next;
}

function normalizeMember(raw) {
  if (!raw || typeof raw !== "object") return null;
  const userId = String(raw.userId || raw.user_id || "").trim();
  const groupId = String(raw.groupId || raw.group_id || "").trim();
  if (!userId || !groupId) return null;
  const displayName = String(raw.displayName || raw.display_name || "Lid").trim() || "Lid";
  const initial = String(raw.initial || initialFromName(displayName) || "Y").trim() || "Y";
  return { groupId, userId, displayName, initial };
}

function upsertMemberLocal(member) {
  const normalized = normalizeMember(member);
  if (!normalized) return;
  const bucket = (state.membersByGroup[normalized.groupId] ||= {});
  bucket[normalized.userId] = { ...(bucket[normalized.userId] || {}), ...normalized };
}

function currentGroupMembers() {
  const bucket = state.membersByGroup?.[state.group.id];
  if (!bucket || typeof bucket !== "object") return [];
  return Object.values(bucket).filter((member) => member?.userId);
}

function ensureSelfMemberLocal() {
  upsertMemberLocal({
    groupId: state.group.id,
    userId: state.user.id,
    displayName: state.user.name || "Jij",
    initial: state.user.initial || initialFromName(state.user.name) || "Y",
  });
  const roster = currentGroupMembers();
  if (roster.length) {
    state.group.membersCount = roster.length;
    upsertGroup(state.group);
  }
}

function setActiveGroup(groupId, { announce = true } = {}) {
  const next = state.groups[groupId];
  if (!next) return;
  state.group = { ...state.group, ...next, id: groupId };
  state.activeGroupId = groupId;
  ensureSelfMemberLocal();
  persistCoreState();
  syncGroupUI();
  syncLedgerUI();
  syncLedgerFromBackend({ silent: true });
  if (state.apiBase) {
    syncMembersFromBackend({ silent: true });
    syncCheckinsFromBackend({ silent: true });
    const joinCode = String(state.group.joinCode || state.group.join_code || "").trim();
    if (!joinCode) ensureInviteCodeFromBackend(state.group.id, { silent: true });
  }
  updateInvitePreview();
  updateHome();
  updateCamera();
  if (announce) {
    showSheet({
      label: "Groep",
      title: `Actief: ${state.group.name}`,
      message: `Deadline ${state.group.deadline}. Fee ${state.group.feeLabel}.`,
    });
  }
}

function sortedGroups() {
  return Object.values(state.groups)
    .filter((group) => group?.id)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "nl"));
}

function initialFromName(name) {
  const trimmed = String(name || "").trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : "Y";
}

function normalizeApiBase(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}

function encodeInvitePayload(payload) {
  try {
    const json = JSON.stringify(payload || {});
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    const b64 = btoa(binary);
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  } catch {
    return "";
  }
}

function decodeInvitePayload(raw) {
  try {
    const value = String(raw || "").trim();
    if (!value) return null;
    if (value.length > 512) return null;
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function currentInviteGroupSnapshot({ groupId } = {}) {
  const fallback = state.group || {};
  const id = String(groupId || fallback.id || "").trim();
  if (!id) return null;

  const fromForm = {
    name: document.querySelector("#group-name-input")?.value,
    deadline: document.querySelector("#deadline-input")?.value,
    feeLabel: document.querySelector("#fee-input")?.value,
    destinationLabel: document.querySelector("#destination-input")?.value,
  };

  const name = String(fromForm.name || fallback.name || "Nieuwe groep").trim();
  const deadline = String(fromForm.deadline || fallback.deadline || "22:00").trim();
  const feeLabel = String(fromForm.feeLabel || fallback.feeLabel || "EUR 10").trim();
  const destinationLabel = String(fromForm.destinationLabel || fallback.destinationLabel || "Platform fee, geen cash-out").trim();

  return { v: 1, id, name, deadline, feeLabel, destinationLabel };
}

function buildJoinInviteLink({ groupId, joinCode, apiBase = "" } = {}) {
  const code = String(joinCode || groupId || "").trim();
  if (!code) return "";

  const url = new URL(window.location.href);
  url.searchParams.set("join", code);

  const payload = currentInviteGroupSnapshot({ groupId });
  const encoded = encodeInvitePayload(payload);
  if (encoded) url.searchParams.set("g", encoded);
  else url.searchParams.delete("g");

  const normalizedApiBase = normalizeApiBase(apiBase);
  const includeApiBase = normalizedApiBase && !/localhost|127\.0\.0\.1/i.test(normalizedApiBase);
  if (includeApiBase) {
    url.searchParams.set("apiBase", normalizedApiBase);
  } else {
    url.searchParams.delete("apiBase");
  }

  url.hash = "#onboard";
  return url.toString();
}

async function copyToClipboard(text) {
  const value = String(text || "");
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.top = "-1000px";
      textarea.style.left = "-1000px";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function currentInviteGroupId() {
  const createNew = Boolean(document.querySelector("#create-new-toggle")?.checked);
  if (createNew && state.createDraftGroupId) return state.createDraftGroupId;
  return state.group?.id || "";
}

function currentInviteJoinCode() {
  const groupId = currentInviteGroupId();
  if (!groupId) return "";
  const creatingNew = Boolean(document.querySelector("#create-new-toggle")?.checked);
  if (creatingNew && state.createDraftGroupId === groupId) {
    return state.createDraftJoinCode || localJoinCodeFromGroupId(groupId) || groupId;
  }
  const joinCode = String(state.groups?.[groupId]?.joinCode || state.groups?.[groupId]?.join_code || "").trim();
  if (joinCode) return joinCode;
  if (!state.apiBase) return ensureLocalJoinCodeForGroupId(groupId) || groupId;
  return groupId;
}

function syncInviteLinkUI() {
  const groupId = currentInviteGroupId();
  const joinCode = currentInviteJoinCode();
  const link = groupId ? buildJoinInviteLink({ groupId, joinCode, apiBase: state.apiBase }) : "";

  const createInput = document.querySelector("#invite-link-input");
  if (createInput instanceof HTMLInputElement) createInput.value = link;
  const groupInput = document.querySelector("#group-invite-link-input");
  if (groupInput instanceof HTMLInputElement) groupInput.value = link;

  setText("#invite-code", joinCode || "code_...");
  setText("#group-code-pill", joinCode || "code_...");
}

async function copyCurrentInviteLink() {
  const groupId = currentInviteGroupId();
  let joinCode = currentInviteJoinCode();
  if (state.apiBase && groupId && joinCode === groupId) {
    const created = await ensureInviteCodeFromBackend(groupId, { silent: true });
    if (created) joinCode = created;
  }
  if (!state.apiBase && groupId && joinCode === groupId) {
    joinCode = ensureLocalJoinCodeForGroupId(groupId) || joinCode;
  }
  const link = groupId ? buildJoinInviteLink({ groupId, joinCode, apiBase: state.apiBase }) : "";
  if (!link) return;
  const ok = await copyToClipboard(link);
  showSheet({
    label: "Invite",
    title: ok ? "Link gekopieerd" : "Kopiëren mislukt",
    message: ok ? "De invite link staat op je clipboard." : "Browser blokkeerde clipboard. Selecteer de link en kopieer handmatig.",
  });
}

function consumeJoinInviteFromUrl() {
  const url = new URL(window.location.href);
  const join = url.searchParams.get("join")?.trim() || "";
  const apiBase = normalizeApiBase(url.searchParams.get("apiBase") || url.searchParams.get("api") || "");
  const groupPayload = decodeInvitePayload(url.searchParams.get("g") || "");
  if (!join) return null;

  url.searchParams.delete("join");
  url.searchParams.delete("apiBase");
  url.searchParams.delete("api");
  url.searchParams.delete("g");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);

  return { join, apiBase, groupPayload };
}

function extractJoinInviteFromText(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;

  const maybeUrl = text.startsWith("http://") || text.startsWith("https://") ? text : `https://${text}`;
  if (!/(\?|#).*(^|[?&#])join=/.test(maybeUrl) && !text.includes("/?join=") && !text.includes("&join=")) return null;

  try {
    const url = new URL(maybeUrl);
    const searchJoin = url.searchParams.get("join")?.trim() || "";
    const searchApi = url.searchParams.get("apiBase") || url.searchParams.get("api") || "";
    const searchPayload = decodeInvitePayload(url.searchParams.get("g") || "");

    let hashJoin = "";
    let hashApi = "";
    let hashPayload = null;
    if (!searchJoin && url.hash) {
      const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
      const [, hashQuery = ""] = hash.split("?");
      if (hashQuery) {
        const params = new URLSearchParams(hashQuery);
        hashJoin = params.get("join")?.trim() || "";
        hashApi = params.get("apiBase") || params.get("api") || "";
        hashPayload = decodeInvitePayload(params.get("g") || "");
      }
    }

    const join = searchJoin || hashJoin;
    if (!join) return null;
    const apiBase = normalizeApiBase(searchApi || hashApi || "");
    const groupPayload = searchPayload || hashPayload;
    return { join, apiBase, groupPayload };
  } catch {
    return null;
  }
}

function hydrateOnboardingFromInviteText(rawText) {
  const invite = extractJoinInviteFromText(rawText);
  if (!invite?.join) return null;

  const codeField = document.querySelector("#onboard-group-code");
  if (codeField) codeField.value = invite.join;

  if (invite.apiBase) {
    const apiField = document.querySelector("#onboard-api-base");
    if (apiField) apiField.value = invite.apiBase;
    state.apiBase = invite.apiBase;
    localStorage.setItem(API_BASE_KEY, invite.apiBase);
  }

  if (invite.groupPayload) state.inviteGroupPayload = invite.groupPayload;
  return invite;
}

function parseHashRoute(hashValue = window.location.hash) {
  const raw = String(hashValue || "");
  if (!raw || raw === "#") return { screen: "home", params: new URLSearchParams() };
  const trimmed = raw.startsWith("#") ? raw.slice(1) : raw;
  const [screenRaw, queryRaw] = trimmed.split("?");
  const screen = screenRaw || "home";
  const params = new URLSearchParams(queryRaw || "");
  return { screen, params };
}

const api = {
  get base() {
    return state.apiBase;
  },
  async request(path, init) {
    if (!this.base) throw new Error("no_api_base");
    const url = `${this.base}${path}`;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 6500);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        let detail = "";
        try {
          const payload = await response.json();
          detail = String(payload?.detail || payload?.error || "").trim();
        } catch {
          detail = "";
        }
        const suffix = detail ? `:${detail}` : "";
        throw new Error(`${response.status}:${path}${suffix}`);
      }
      return response.json();
    } catch (error) {
      if (String(error?.name || "") === "AbortError") throw new Error(`timeout:${path}`);
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  },
  post(path, body) {
    return this.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },
  delete(path) {
    return this.request(path, { method: "DELETE" });
  },
  get(path) {
    return this.request(path, { method: "GET" });
  },
};

function setApiStatus(kind, label) {
  const pill = document.querySelector("#api-status-pill");
  if (!pill) return;
  pill.classList.remove("ok", "bad", "neutral");
  pill.classList.add(kind);
  pill.textContent = label;
  state.apiStatusKind = kind;
  syncOnboardingBackendActions();
  syncOnboardingBillingActions();
}

function setProfileApiStatus(kind, label) {
  const pill = document.querySelector("#profile-api-pill");
  if (!pill) return;
  pill.classList.remove("ok", "bad", "neutral");
  pill.classList.add(kind);
  pill.textContent = label;
}

function syncProfileBackendCard() {
  const field = document.querySelector("#profile-api-base");
  if (field instanceof HTMLInputElement) field.value = state.apiBase || "";

  if (!state.apiBase) {
    setProfileApiStatus("neutral", "Local");
    return;
  }

  const last = Math.max(state.lastBackendSyncAt || 0, state.lastBackendGroupSaveAt || 0, state.lastBackendCheckinAt || 0);
  if (last) {
    setProfileApiStatus("ok", `Synced ${formatShortTime(last)}`);
    return;
  }
  setProfileApiStatus("neutral", "Ongetest");
}

function syncOnboardingBackendActions() {
  const container = document.querySelector("#onboard-backend-actions");
  if (!container) return;
  const baseField = document.querySelector("#onboard-api-base");
  const base = normalizeApiBase(baseField?.value || state.apiBase || "");
  const enabled = Boolean(base) && (state.apiStatusKind === "ok" || state.apiStatusKind === "neutral");
  container.classList.toggle("hidden", !enabled);

  const syncButton = document.querySelector("#onboard-sync-groups");
  if (syncButton instanceof HTMLButtonElement) {
    syncButton.disabled = !enabled;
    syncButton.setAttribute("aria-disabled", syncButton.disabled ? "true" : "false");
  }
  const uploadButton = document.querySelector("#onboard-upload-groups");
  if (uploadButton instanceof HTMLButtonElement) {
    uploadButton.disabled = !enabled;
    uploadButton.setAttribute("aria-disabled", uploadButton.disabled ? "true" : "false");
  }

  const syncMembersButton = document.querySelector("#onboard-sync-members");
  if (syncMembersButton instanceof HTMLButtonElement) {
    syncMembersButton.disabled = !enabled;
    syncMembersButton.setAttribute("aria-disabled", syncMembersButton.disabled ? "true" : "false");
  }

  const uploadMembersButton = document.querySelector("#onboard-upload-members");
  if (uploadMembersButton instanceof HTMLButtonElement) {
    uploadMembersButton.disabled = !enabled;
    uploadMembersButton.setAttribute("aria-disabled", uploadMembersButton.disabled ? "true" : "false");
  }
}

function syncOnboardingBillingActions() {
  const container = document.querySelector("#onboard-billing-actions");
  if (!container) return;

  const hint = document.querySelector("#onboard-billing-hint");
  const baseField = document.querySelector("#onboard-api-base");
  const base = normalizeApiBase(baseField?.value || state.apiBase || "");
  const hasBackend = Boolean(base) && (state.apiStatusKind === "ok" || state.apiStatusKind === "neutral");

  const mandateReady = Boolean(state.paymentMandateSetup || state.stripePaymentMethodId);
  const passReady = Boolean(state.stripeSubscriptionId);
  const statusLabel = mandateReady ? "Mandate" : passReady ? "Pass" : "Demo";

  const pill = document.querySelector("#onboard-billing-pill");
  if (pill) {
    pill.classList.remove("ok", "bad", "neutral");
    pill.classList.add(hasBackend ? "ok" : "neutral");
    pill.textContent = statusLabel;
  }

  const enabled = Boolean(hasBackend && state.stripeReady);
  container.classList.toggle("hidden", !enabled);
  if (hint) hint.classList.toggle("hidden", !enabled);

  const button = document.querySelector("#onboard-open-billing");
  if (button instanceof HTMLButtonElement) {
    button.disabled = !enabled;
    button.setAttribute("aria-disabled", button.disabled ? "true" : "false");
  }
}

function setStripeStatus(kind, label) {
  const pill = document.querySelector("#stripe-health-pill");
  if (!pill) return;
  pill.classList.remove("ok", "bad", "neutral");
  pill.classList.add(kind);
  pill.textContent = label;
}

function setGroupSyncStatus(kind, label) {
  const pill = document.querySelector("#group-sync-pill");
  if (!pill) return;
  pill.classList.remove("ok", "bad", "neutral");
  pill.classList.add(kind);
  pill.textContent = label;
}

function formatShortTime(value) {
  const timestamp = Number(value || 0);
  if (!timestamp) return "";
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function syncGroupSyncPill() {
  if (!state.apiBase) {
    setGroupSyncStatus("neutral", "Local");
    return;
  }
  const last = Math.max(state.lastBackendSyncAt || 0, state.lastBackendGroupSaveAt || 0, state.lastBackendCheckinAt || 0);
  if (last) {
    const label =
      state.lastBackendSyncAt >= state.lastBackendGroupSaveAt && state.lastBackendSyncAt >= state.lastBackendCheckinAt
        ? "Synced"
        : state.lastBackendGroupSaveAt >= state.lastBackendCheckinAt
          ? "Saved"
          : "Check-in";
    setGroupSyncStatus("ok", `${label} ${formatShortTime(last)}`);
    return;
  }
  setGroupSyncStatus("neutral", "Ongetest");
}

async function testApiConnection(rawBase, { silent = false } = {}) {
  const base = normalizeApiBase(rawBase);
  if (!base) {
    setApiStatus("bad", "Offline");
    if (!silent) {
      showSheet({
        label: "API",
        title: "Geen API base ingevuld",
        message: "Zet een URL zoals http://localhost:8001 in om group sync + Stripe demo endpoints te testen.",
      });
    }
    return;
  }

  setApiStatus("neutral", "Test...");
  try {
    const healthResponse = await fetch(`${base}/api/health`, { method: "GET" });
    if (!healthResponse.ok) throw new Error(`health:${healthResponse.status}`);
    const health = await healthResponse.json();

    let payments = null;
    try {
      const paymentsResponse = await fetch(`${base}/api/payments/health`, { method: "GET" });
      if (paymentsResponse.ok) payments = await paymentsResponse.json();
    } catch {
      payments = null;
    }

    const groupsReady = Boolean(health?.features?.groups);
    const paymentsReady = Boolean(health?.features?.payments);
    const stripeReady = Boolean(payments?.stripe_ready);
    state.stripeReady = stripeReady;
    persistCoreState();
    syncOnboardingBillingActions();

    if (groupsReady && paymentsReady) {
      setApiStatus("ok", stripeReady ? "Stripe OK" : "API OK");
    } else if (groupsReady) {
      setApiStatus("neutral", "Groups OK");
    } else {
      setApiStatus("bad", "Partial");
    }

    if (!silent) {
      showSheet({
        label: "API check",
        title: "Backend bereikbaar",
        message: `Groups: ${groupsReady ? "ok" : "uit"}. Payments: ${paymentsReady ? "ok" : "uit"}. Stripe: ${
          stripeReady ? "ready" : "demo"
        }.`,
      });
    }
  } catch {
    setApiStatus("bad", "Offline");
    state.stripeReady = false;
    persistCoreState();
    syncOnboardingBillingActions();
    if (!silent) {
      showSheet({
        label: "API",
        title: "Backend niet bereikbaar",
        message: "Check of de server draait en CORS toestaat. UI blijft werken met localStorage demo state.",
      });
    }
  }
}

const localVisionEndpoint = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:8000/api/rfdetr/detect"
  : "";

const vision = {
  endpoint:
    window.PRESSURE_VISION_ENDPOINT ||
    localStorage.getItem("pressureVisionEndpoint") ||
    localVisionEndpoint,
  stream: null,
  timer: null,
  traceTimer: null,
  raf: null,
  lastDetections: [],
};

const exercises = [
  {
    title: "Goblet squat",
    short: "Geaccepteerd",
    instruction: "Plaats je hele lichaam in beeld en zak diep genoeg voor de check.",
    form: 96,
    trust: 95,
    lock: "Diepte en kniehoek goed",
  },
  {
    title: "Romanian deadlift",
    short: "Geaccepteerd",
    instruction: "Houd je rug neutraal en laat de heupbeweging zichtbaar zijn.",
    form: 93,
    trust: 94,
    lock: "Hip hinge stabiel",
  },
  {
    title: "Push-up hold",
    short: "10 sec live controle nodig",
    instruction: "Zorg dat schouders, heupen en voeten zichtbaar zijn. Houd 10 sec stabiel.",
    form: 88,
    trust: 92,
    lock: "Schouderhoek 10 sec vasthouden",
  },
  {
    title: "Walking lunge",
    short: "Vrij na oefening 3",
    instruction: "Stap rustig zodat de camera je stride en balans kan volgen.",
    form: 86,
    trust: 90,
    lock: "Stride symmetrie nodig",
  },
];

function setLiveStatus(message) {
  const liveStatus = document.querySelector("#live-status");
  if (liveStatus) liveStatus.textContent = message;
}

function setText(selector, text) {
  const element = document.querySelector(selector);
  if (element) element.textContent = text;
}

function isSheetOpen() {
  const sheet = document.querySelector("#action-sheet");
  return Boolean(sheet?.classList.contains("open"));
}

function setSheetBackdropState(open) {
  document.querySelectorAll(".screen, .bottom-nav").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.id === "action-sheet") return;
    if (open) {
      node.setAttribute("inert", "");
      node.setAttribute("aria-hidden", "true");
    } else {
      node.removeAttribute("inert");
      node.removeAttribute("aria-hidden");
    }
  });
}

function sheetFocusableElements(sheet) {
  if (!(sheet instanceof HTMLElement)) return [];
  const nodes = Array.from(
    sheet.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'),
  );
  return nodes.filter((node) => {
    if (!(node instanceof HTMLElement)) return false;
    if (node.closest("[aria-hidden='true']")) return false;
    if (node instanceof HTMLButtonElement) return !node.disabled;
    if (node instanceof HTMLInputElement) return !node.disabled;
    return !node.hasAttribute("disabled");
  });
}

function showSheet({
  label = "Update",
  title,
  message,
  primary = "Ok",
  secondary = "Sluiten",
  onPrimary = null,
  onSecondary = null,
}) {
  const sheet = document.querySelector("#action-sheet");
  if (!sheet) return;

  state.sheetLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  state.sheetAction = onPrimary;
  state.sheetSecondaryAction = onSecondary;
  setText("#sheet-label", label);
  setText("#sheet-title", title);
  setText("#sheet-message", message);
  setText("#sheet-primary", primary);
  setText("#sheet-secondary", secondary);
  sheet.classList.add("open");
  sheet.setAttribute("aria-hidden", "false");
  setSheetBackdropState(true);
  setLiveStatus(title);

  const primaryButton = document.querySelector("#sheet-primary");
  if (primaryButton instanceof HTMLElement) primaryButton.focus();
}

function closeSheet() {
  const sheet = document.querySelector("#action-sheet");
  if (!sheet) return;
  sheet.classList.remove("open");
  sheet.setAttribute("aria-hidden", "true");
  setSheetBackdropState(false);
  state.sheetAction = null;
  state.sheetSecondaryAction = null;
  if (state.sheetLastFocus instanceof HTMLElement) state.sheetLastFocus.focus();
  state.sheetLastFocus = null;
}

function resetToDemo() {
  state.user = { ...state.user, name: "Jij", email: "", initial: "Y" };
  state.group = { ...state.group, name: "Team Iron Pact", deadline: "22:00", feeLabel: "EUR 10" };
  state.groups = {};
  state.activeGroupId = state.group.id;
  upsertGroup(state.group);
  state.apiBase = "";
  localStorage.removeItem(API_BASE_KEY);
  localStorage.removeItem(ONBOARD_DRAFT_KEY);
  state.paymentSetup = false;
  state.feeDestination = "platform";
  state.onboardingMode = "setup";
  state.onboardingReturnTo = "home";
  state.onboardingComplete = false;
  persistCoreState();
  syncGroupUI();
  syncUserUI();
  syncPaymentModel();
  updateHome();
  updateCamera();
}

function loadOnboardingDraft() {
  try {
    const raw = localStorage.getItem(ONBOARD_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

let onboardingDraftTimer = null;
function scheduleOnboardingDraftSave() {
  if (onboardingDraftTimer) window.clearTimeout(onboardingDraftTimer);
  onboardingDraftTimer = window.setTimeout(() => {
    onboardingDraftTimer = null;
    const nameField = document.querySelector("#onboard-name");
    const emailField = document.querySelector("#onboard-email");
    const groupField = document.querySelector("#onboard-group-name");
    const groupCodeField = document.querySelector("#onboard-group-code");
    const deadlineField = document.querySelector("#onboard-deadline");
    const feeField = document.querySelector("#onboard-fee");
    const apiBaseField = document.querySelector("#onboard-api-base");
    const supabaseUrlField = document.querySelector("#onboard-supabase-url");
    const supabaseAnonField = document.querySelector("#onboard-supabase-anon");
    const mode = document.querySelector('input[name="onboardGroupMode"]:checked')?.value || "create";

    const payload = {
      version: 1,
      savedAt: Date.now(),
      mode,
      name: String(nameField?.value || "").trim(),
      email: String(emailField?.value || "").trim(),
      groupName: String(groupField?.value || "").trim(),
      groupCode: String(groupCodeField?.value || "").trim(),
      deadline: String(deadlineField?.value || "").trim(),
      fee: String(feeField?.value || "").trim(),
      apiBase: normalizeApiBase(String(apiBaseField?.value || "")),
      supabaseUrl: normalizeSupabaseUrl(String(supabaseUrlField?.value || "")),
      supabaseAnonKey: normalizeSupabaseAnonKey(String(supabaseAnonField?.value || "")),
    };

    try {
      localStorage.setItem(ONBOARD_DRAFT_KEY, JSON.stringify(payload));
    } catch {
      // localStorage is best-effort in some preview contexts.
    }
  }, 250);
}

function clearOnboardingDraft() {
  try {
    localStorage.removeItem(ONBOARD_DRAFT_KEY);
  } catch {
    // ignore
  }
}

function enterOnboarding({ mode = "setup", returnTo = "home" } = {}) {
  state.onboardingMode = mode;
  state.onboardingReturnTo = returnTo;
  const invite = state.pendingInvite;
  state.inviteGroupPayload = invite?.groupPayload || null;

  const backButton = document.querySelector("#onboard-back");
  if (backButton) backButton.classList.toggle("hidden", mode !== "edit");

  const submit = document.querySelector("#onboard-submit");
  if (submit) submit.textContent = mode === "edit" ? "Update setup" : "Start Pressure";

  const skip = document.querySelector("#skip-onboarding");
  if (skip) skip.textContent = mode === "edit" ? "Reset naar demo" : "Gebruik demo data";

  const nameField = document.querySelector("#onboard-name");
  const emailField = document.querySelector("#onboard-email");
  const groupField = document.querySelector("#onboard-group-name");
  const groupCodeField = document.querySelector("#onboard-group-code");
  const deadlineField = document.querySelector("#onboard-deadline");
  const feeField = document.querySelector("#onboard-fee");
  const apiBaseField = document.querySelector("#onboard-api-base");
  const supabaseUrlField = document.querySelector("#onboard-supabase-url");
  const supabaseAnonField = document.querySelector("#onboard-supabase-anon");

  const draft = mode === "setup" && !invite?.join ? loadOnboardingDraft() : null;

  if (nameField) nameField.value = draft?.name || state.user.name || "";
  if (emailField) emailField.value = draft?.email || state.user.email || "";
  if (groupField) groupField.value = invite?.groupPayload?.name || draft?.groupName || state.group.name || "";
  if (groupCodeField) groupCodeField.value = invite?.join || draft?.groupCode || "";
  if (deadlineField) deadlineField.value = invite?.groupPayload?.deadline || draft?.deadline || state.group.deadline || "22:00";
  if (feeField) feeField.value = invite?.groupPayload?.feeLabel || draft?.fee || state.group.feeLabel || "EUR 10";
  if (apiBaseField) apiBaseField.value = invite?.apiBase || draft?.apiBase || state.apiBase || "";
  if (supabaseUrlField) supabaseUrlField.value = draft?.supabaseUrl || state.supabase.url || "";
  if (supabaseAnonField) supabaseAnonField.value = state.supabase.anonKey || draft?.supabaseAnonKey || "";

  if (invite?.join) state.onboardingGroupMode = "join";
  else if (draft?.mode === "join" || draft?.mode === "create") state.onboardingGroupMode = draft.mode;
  const prefilledApiBase = normalizeApiBase(invite?.apiBase || draft?.apiBase || state.apiBase || "");
  setOnboardingGroupMode(state.onboardingGroupMode || "create", { focus: false });
  setApiStatus(prefilledApiBase ? "neutral" : "bad", prefilledApiBase ? "Ongetest" : "Offline");
  syncOnboardingBackendActions();
  showScreen("onboard");
  state.pendingInvite = null;
}

function setOnboardingGroupMode(mode, { focus = true } = {}) {
  const next = mode === "join" ? "join" : "create";
  state.onboardingGroupMode = next;

  const createRadio = document.querySelector("#onboard-group-mode-create");
  const joinRadio = document.querySelector("#onboard-group-mode-join");
  if (createRadio) createRadio.checked = next === "create";
  if (joinRadio) joinRadio.checked = next === "join";

  const createFields = document.querySelector("#onboard-create-fields");
  const joinFields = document.querySelector("#onboard-join-fields");
  if (createFields) createFields.classList.toggle("hidden", next !== "create");
  if (joinFields) joinFields.classList.toggle("hidden", next !== "join");

  const groupName = document.querySelector("#onboard-group-name");
  const deadline = document.querySelector("#onboard-deadline");
  const fee = document.querySelector("#onboard-fee");
  const groupCode = document.querySelector("#onboard-group-code");

  if (groupName) groupName.toggleAttribute("required", next === "create");
  if (deadline) deadline.toggleAttribute("required", next === "create");
  if (fee) fee.toggleAttribute("required", next === "create");
  if (groupCode) groupCode.toggleAttribute("required", next === "join");

  if (!focus) return;
  if (next === "join" && groupCode instanceof HTMLElement) groupCode.focus();
  if (next === "create" && groupName instanceof HTMLElement) groupName.focus();
}

function syncNav(activeName) {
  document.querySelectorAll(".bottom-nav button").forEach((button) => {
    const target = button.dataset.screenTarget;
    const active = target === activeName || (button.id === "nav-verify" && activeName === "camera");
    button.classList.toggle("active", active && button.id !== "nav-verify");
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}

function showScreen(name) {
  const screen = screens[name] || screens.home;
  Object.values(screens).forEach((item) => item.classList.remove("active"));
  screen.classList.add("active");
  Object.values(screens).forEach((item) => {
    item.scrollTop = 0;
  });

  const hash = name === "home" ? location.pathname : `#${name}`;
  if (name === "home") {
    history.replaceState(null, "", hash);
  } else if (!location.hash.startsWith(`#${name}`)) {
    history.replaceState(null, "", hash);
  }

  syncNav(name);
  setLiveStatus(`${name} geopend`);

  if (name === "camera") startVision();
  if (name === "profile") syncUserUI();
  if (name === "profile") syncProfileBackendCard();
  if (name === "billing") checkStripeHealth({ silent: true });
  if (name === "billing") bootstrapBillingScreen();
  if (name === "billing") syncLedgerFromBackend({ silent: true });
  if (name === "create") syncCreateScreenUI();
  if (name === "rank") renderLeaderboard();
  if (name === "group") {
    syncGroupSyncPill();
    syncCheckinsFromBackend({ silent: true });
  }
  if (name === "success") syncSuccessScreen();
  if (name === "billing") maybeNotifyBillingCancel();
  if (name === "billing") maybeNotifyBillingSetupCancel();
  if (name === "billing") handleBillingSetupReturnFromHash();

  if (screen instanceof HTMLElement) screen.focus();

  const frame = document.querySelector(".device-frame");
  if (frame) frame.classList.toggle("onboarding", name === "onboard");
}

let billingBootstrapTimer = null;
let lastBillingBootstrapAt = 0;
function bootstrapBillingScreen({ force = false } = {}) {
  if (!state.apiBase) return;
  if (!state.user?.email) return;
  const now = Date.now();
  if (!force && now - lastBillingBootstrapAt < 60_000) return;
  lastBillingBootstrapAt = now;

  if (billingBootstrapTimer) window.clearTimeout(billingBootstrapTimer);
  billingBootstrapTimer = window.setTimeout(async () => {
    billingBootstrapTimer = null;
    try {
      const needsStripeRehydrate = !(state.stripeCustomerId || state.stripeSubscriptionId || state.stripePaymentMethodId);
      await syncProfileFromBackend({ silent: true });
      if (needsStripeRehydrate) {
        await syncStripeIdsFromEmail({ silent: true });
        await syncProfileFromBackend({ silent: true });
      }
      syncPaymentModel();
    } catch {
      // Silent bootstrap; billing stays demo/local-first.
    }
  }, 50);
}

async function checkStripeHealth({ silent = false } = {}) {
  if (!state.apiBase) {
    setStripeStatus("bad", "Offline");
    state.stripeReady = false;
    persistCoreState();
    syncOnboardingBillingActions();
    if (!silent) {
      showSheet({
        label: "Stripe",
        title: "Geen API base ingesteld",
        message: "Zet in onboarding een backend URL om `/api/payments/health` te checken.",
      });
    }
    return;
  }

  setStripeStatus("neutral", "Test...");
  try {
    const payload = await api.get("/api/payments/health");
    const ready = Boolean(payload?.stripe_ready);
    state.stripeReady = ready;
    persistCoreState();
    syncOnboardingBillingActions();
    const liveDetected = Boolean(payload?.live_key_detected);
    const liveAllowed = Boolean(payload?.live_key_allowed);

    if (ready) {
      setStripeStatus("ok", "Stripe OK");
    } else if (liveDetected && !liveAllowed) {
      setStripeStatus("bad", "Live blocked");
    } else {
      setStripeStatus("neutral", "Demo");
    }

    if (!silent) {
      showSheet({
        label: "Stripe",
        title: ready ? "Stripe is ready" : "Stripe demo mode",
        message: ready
          ? `API version ${payload?.api_version || "?"}. Mode ${payload?.stripe_mode || "?"}.`
          : "Stripe keys ontbreken, deps ontbreken, of live key is geblokkeerd. UI blijft payment-safe.",
      });
    }
  } catch {
    setStripeStatus("bad", "Error");
    state.stripeReady = false;
    persistCoreState();
    syncOnboardingBillingActions();
    if (!silent) {
      showSheet({
        label: "Stripe",
        title: "Check mislukt",
        message: "Backend niet bereikbaar of endpoint faalde. UI blijft in demo mode.",
      });
    }
  }
}

function maybeNotifyBillingSetupCancel() {
  const { params } = parseHashRoute();
  if (params.get("setup_cancel") !== "1") return;
  history.replaceState(null, "", "#billing");
  showSheet({
    label: "Mandate",
    title: "Payment method setup geannuleerd",
    message: "Geen probleem. Je kunt later opnieuw starten. Zonder mandate kan de backend geen off-session miss fees verwerken.",
  });
}

function handleBillingSetupReturnFromHash() {
  const { screen, params } = parseHashRoute();
  if (screen !== "billing") return false;
  if (params.get("setup") !== "1") return false;
  const sessionId = (params.get("session_id") || params.get("session") || "").trim();
  if (!sessionId) return false;

  state.lastSetupSessionId = sessionId;
  persistCoreState();
  syncPaymentModel();
  history.replaceState(null, "", "#billing");
  fetchSetupSessionDetails(sessionId);
  return true;
}

async function fetchSetupSessionDetails(sessionId) {
  if (!state.apiBase) return;
  try {
    const payload = await api.get(`/api/payments/checkout-session/${encodeURIComponent(sessionId)}`);
    if (payload?.customer_id) state.stripeCustomerId = String(payload.customer_id);
    if (payload?.setup_intent_id) state.stripeSetupIntentId = String(payload.setup_intent_id);
    persistCoreState();
    syncPaymentModel();

    if (!state.stripeSetupIntentId) return;
    const intent = await api.get(`/api/payments/setup-intent/${encodeURIComponent(state.stripeSetupIntentId)}`);
    if (intent?.customer_id && !state.stripeCustomerId) state.stripeCustomerId = String(intent.customer_id);
    if (intent?.payment_method_id) state.stripePaymentMethodId = String(intent.payment_method_id);
    if (intent?.payment_method_id) state.paymentMandateSetup = true;
    persistCoreState();
    syncPaymentModel();
    upsertProfileToBackend({ silent: true });

    showSheet({
      label: intent?.mode === "stripe" ? "Stripe" : "Demo",
      title: "Payment method opgeslagen",
      message: state.stripePaymentMethodId
        ? `Payment method: ${state.stripePaymentMethodId}. Backend kan nu miss fees off-session chargen.`
        : `SetupIntent status: ${intent?.status || "ok"}.`,
    });
  } catch {
    showSheet({
      label: "Mandate",
      title: "Setup return onvolledig",
      message: "We konden de setup session niet ophalen. Check backend, CORS en Stripe keys. Je kunt ook via Customer Portal een payment method toevoegen.",
    });
  }
}

function remainingChecks() {
  return Math.max(0, exercises.length - state.todayChecks);
}

function currentExercise() {
  return exercises[state.activeExerciseIndex] || exercises[exercises.length - 1];
}

function renderHomeProgress(count) {
  const progress = document.querySelector("#home-progress");
  if (!progress) return;
  progress.setAttribute("aria-valuenow", String(count));

  [...progress.children].forEach((segment, index) => {
    const label = segment.querySelector("small");
    segment.className = "";

    if (index < count) {
      segment.classList.add("done");
      if (label) label.textContent = "Klaar";
      return;
    }

    if (index === count && count < exercises.length) {
      segment.classList.add("active");
      if (label) label.textContent = "Nu";
      return;
    }

    if (label) label.textContent = "Locked";
  });
}

function updateExerciseRows() {
  document.querySelectorAll(".exercise-row[data-exercise-index]").forEach((row) => {
    const index = Number(row.dataset.exerciseIndex);
    const status = row.querySelector("em");
    const small = row.querySelector("small");
    const exercise = exercises[index];

    row.classList.remove("done", "active", "locked");

    if (index < state.todayChecks) {
      row.classList.add("done");
      if (status) status.textContent = "Klaar";
      if (small) small.textContent = "Geaccepteerd";
      row.setAttribute("aria-label", `${exercise.title} klaar`);
      return;
    }

    if (index === state.activeExerciseIndex && state.todayChecks < exercises.length) {
      row.classList.add("active");
      if (status) status.textContent = "Start";
      if (small) small.textContent = exercise.short;
      row.setAttribute("aria-label", `${exercise.title} is nu aan de beurt`);
      return;
    }

    row.classList.add("locked");
    if (status) status.textContent = "Locked";
    if (small) small.textContent = `Vrij na oefening ${index}`;
    row.setAttribute("aria-label", `${exercise.title} locked`);
  });
}

function updateHome() {
  const current = currentExercise();
  const left = remainingChecks();

  setText("#hero-check-count", `${state.todayChecks}/4`);
  setText("#home-rank", "#2");
  setText("#streak-value", String(state.streak));
  setText("#profile-streak", String(state.streak));
  setText("#profile-left", String(left));
  setText("#profile-workouts", String(state.verifiedCount));
  setText("#group-user-status", `${state.todayChecks}/4 klaar`);
  setText("#rank-user-status", `${state.verifiedCount} workouts, 0 misses`);
  setText("#progress-pill", left === 0 ? "Compleet" : `${left} open`);

  setText(
    "#mission-copy",
    left === 0
      ? "Je workout telt. Je streak is beschermd en de groep ziet je verified check-in."
      : `Maak oefening ${state.activeExerciseIndex + 1} van 4 af voor 22:00. Commitment fee bij missen: EUR 10.`,
  );
  setText("#home-title", left === 0 ? "Workout telt vandaag" : `Nog ${left} check${left === 1 ? "" : "s"} tot je workout telt`);
  setText("#main-cta-label", left === 0 ? "Bekijk resultaat" : `Start oefening ${state.activeExerciseIndex + 1}`);
  setText("#next-exercise-label", current.title);
  setText("#next-exercise-copy", left === 0 ? "Alle oefeningen zijn geaccepteerd" : current.short);

  renderHomeProgress(state.todayChecks);
  updateExerciseRows();
}

function syncGroupUI() {
  setText("#home-group-title", state.group.name);
  setText("#group-title", state.group.name);
  setText("#invite-preview-title", state.group.name);
  setText("#group-subtitle", `${state.group.membersCount} leden, daily check-in`);
  setText("#home-deadline", state.group.deadline);
  setText("#home-fee", state.group.feeLabel);
  setText(
    "#group-rules-copy",
    `Deadline ${state.group.deadline}. Wie niet 4/4 haalt betaalt ${state.group.feeLabel} als platform fee. Winnaars krijgen rank en perks, geen cash-out.`,
  );

  const groupNameInput = document.querySelector("#group-name-input");
  if (groupNameInput) groupNameInput.value = state.group.name;
  const deadlineInput = document.querySelector("#deadline-input");
  if (deadlineInput) deadlineInput.value = state.group.deadline;
  const feeInput = document.querySelector("#fee-input");
  if (feeInput) feeInput.value = state.group.feeLabel;
  const destinationInput = document.querySelector("#destination-input");
  if (destinationInput) destinationInput.value = state.group.destinationLabel;

  renderGroupSelector();
  syncInviteLinkUI();
  syncGroupBackendButtonState();
}

function syncUserUI() {
  setText("#profile-avatar", state.user.initial || "Y");
  setText("#group-user-avatar", state.user.initial || "Y");
}

function renderGroupSelector() {
  const container = document.querySelector("#group-selector-list");
  if (!container) return;

  const groups = sortedGroups();
  if (!groups.length) {
    container.replaceChildren();
    return;
  }

  container.replaceChildren(
    ...groups.map((group) => {
      const button = document.createElement("button");
      const active = group.id === state.activeGroupId;
      button.type = "button";
      button.className = `group-option${active ? " active" : ""}`;
      button.dataset.groupId = group.id;
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.innerHTML = `
        <span>
          <strong>${group.name}</strong>
          <small>Deadline ${group.deadline} · Fee ${group.feeLabel}</small>
        </span>
        <em>${active ? "Actief" : "Kies"}</em>
      `;
      button.addEventListener("click", () => setActiveGroup(group.id));
      return button;
    }),
  );
}

function hydrateFromStorage() {
  const stored = loadModel();
  const apiBase =
    window.PRESSURE_API_BASE ||
    localStorage.getItem(API_BASE_KEY) ||
    stored?.apiBase ||
    "";

  if (stored?.user) state.user = { ...state.user, ...stored.user };
  if (stored?.onboardingComplete != null) state.onboardingComplete = Boolean(stored.onboardingComplete);
  state.groups = normalizeStoredGroups(stored?.groups);
  state.membersByGroup = normalizeStoredMembers(stored?.membersByGroup);
  if (stored?.onboardingGroupMode) state.onboardingGroupMode = stored.onboardingGroupMode;
  if (stored?.group) {
    const legacyGroup = normalizeBackendGroup(stored.group) || stored.group;
    if (legacyGroup?.id) state.groups[legacyGroup.id] = { ...legacyGroup };
  }

  const storedActive = stored?.activeGroupId || stored?.group?.id || "";
  if (storedActive && state.groups[storedActive]) {
    state.activeGroupId = storedActive;
    state.group = { ...state.group, ...state.groups[storedActive], id: storedActive };
  } else if (stored?.group) {
    state.group = { ...state.group, ...stored.group };
  }

  if (stored?.paymentSetup != null) state.paymentSetup = Boolean(stored.paymentSetup);
  if (stored?.feeDestination) state.feeDestination = stored.feeDestination;
  if (stored?.lastBackendSyncAt) state.lastBackendSyncAt = Number(stored.lastBackendSyncAt) || 0;
  if (stored?.lastBackendGroupSaveAt) state.lastBackendGroupSaveAt = Number(stored.lastBackendGroupSaveAt) || 0;
  if (stored?.lastBackendCheckinAt) state.lastBackendCheckinAt = Number(stored.lastBackendCheckinAt) || 0;
  if (stored?.lastCheckoutSessionId) state.lastCheckoutSessionId = String(stored.lastCheckoutSessionId || "");
  if (stored?.stripeCustomerId) state.stripeCustomerId = String(stored.stripeCustomerId || "");
  if (stored?.stripeSubscriptionId) state.stripeSubscriptionId = String(stored.stripeSubscriptionId || "");
  if (stored?.stripePaymentMethodId) state.stripePaymentMethodId = String(stored.stripePaymentMethodId || "");
  if (stored?.stripeSetupIntentId) state.stripeSetupIntentId = String(stored.stripeSetupIntentId || "");
  if (stored?.stripeReady != null) state.stripeReady = Boolean(stored.stripeReady);
  if (stored?.lastSetupSessionId) state.lastSetupSessionId = String(stored.lastSetupSessionId || "");
  if (stored?.paymentMandateSetup != null) state.paymentMandateSetup = Boolean(stored.paymentMandateSetup);
  if (stored?.createDraftGroupId) state.createDraftGroupId = String(stored.createDraftGroupId || "");
  if (stored?.createDraftJoinCode) state.createDraftJoinCode = String(stored.createDraftJoinCode || "");

  state.user.initial = state.user.initial || initialFromName(state.user.name);

  state.apiBase = normalizeApiBase(apiBase);
  if (state.apiBase) localStorage.setItem(API_BASE_KEY, state.apiBase);

  const supaUrl =
    normalizeSupabaseUrl(stored?.supabase?.url) || normalizeSupabaseUrl(localStorage.getItem(SUPABASE_URL_KEY) || "");
  const supaAnon =
    normalizeSupabaseAnonKey(stored?.supabase?.anonKey) ||
    normalizeSupabaseAnonKey(localStorage.getItem(SUPABASE_ANON_KEY) || "");
  state.supabase.url = supaUrl;
  state.supabase.anonKey = supaAnon;
  state.supabase.userId = String(stored?.supabase?.userId || "");
  state.supabase.email = String(stored?.supabase?.email || "");
  state.supabase.sessionActive = Boolean(stored?.supabase?.sessionActive);
  state.supabase.ready = Boolean(stored?.supabase?.ready);

  ensureIds();
  upsertGroup(state.group);
  ensureSelfMemberLocal();
  syncGroupSyncPill();
}

function persistCoreState() {
  saveModel({
    user: state.user,
    supabase: state.supabase,
    groups: state.groups,
    membersByGroup: state.membersByGroup,
    activeGroupId: state.activeGroupId,
    group: state.group,
    paymentSetup: state.paymentSetup,
    feeDestination: state.feeDestination,
    apiBase: state.apiBase,
    onboardingGroupMode: state.onboardingGroupMode,
    lastBackendSyncAt: state.lastBackendSyncAt,
    lastBackendGroupSaveAt: state.lastBackendGroupSaveAt,
    lastBackendCheckinAt: state.lastBackendCheckinAt,
    lastCheckoutSessionId: state.lastCheckoutSessionId,
    stripeCustomerId: state.stripeCustomerId,
    stripeSubscriptionId: state.stripeSubscriptionId,
    stripePaymentMethodId: state.stripePaymentMethodId,
    stripeSetupIntentId: state.stripeSetupIntentId,
    stripeReady: state.stripeReady,
    lastSetupSessionId: state.lastSetupSessionId,
    paymentMandateSetup: state.paymentMandateSetup,
    createDraftGroupId: state.createDraftGroupId,
    createDraftJoinCode: state.createDraftJoinCode,
    onboardingComplete: state.onboardingComplete,
  });
}

const demoRoster = [
  { userId: "user_mila", displayName: "Mila", initial: "M", checksCompleted: 4 },
  { userId: "user_timothy", displayName: "Timothy", initial: "T", checksCompleted: 0 },
  { userId: "user_layo", displayName: "Layo", initial: "L", checksCompleted: 3 },
];

function memberTone(member) {
  if (member.checksCompleted >= exercises.length) return "done";
  if (member.userId === state.user.id) return "active";
  if (member.checksCompleted === 0) return "warning";
  return "";
}

function memberStatusLabel(member) {
  if (member.checksCompleted >= exercises.length) return "Klaar";
  if (member.userId === state.user.id) return "Nu";
  if (member.checksCompleted === 0) return "Risico";
  return "Wacht";
}

function memberSubtitle(member) {
  if (member.checksCompleted >= exercises.length) return "4/4 klaar";
  return `${Math.max(0, member.checksCompleted)}/4 klaar`;
}

function buildRoster(checkins = []) {
  const localMembers = currentGroupMembers();
  const baseMembers = localMembers.length
    ? localMembers.map((member) => ({
        userId: member.userId,
        displayName: member.displayName,
        initial: member.initial,
        checksCompleted: member.userId === state.user.id ? state.todayChecks : 0,
      }))
    : demoRoster.map((member) => ({ ...member }));

  const base = [...baseMembers];
  if (!base.some((member) => member.userId === state.user.id)) {
    base.unshift({
      userId: state.user.id,
      displayName: state.user.name || "Jij",
      initial: state.user.initial || "Y",
      checksCompleted: state.todayChecks,
    });
  }

  const byId = new Map(base.map((member) => [member.userId, member]));
  checkins.forEach((raw) => {
    const userId = String(raw?.user_id || raw?.userId || "").trim();
    if (!userId) return;
    const checksCompleted = Number(raw?.checks_completed ?? raw?.checksCompleted ?? 0) || 0;
    const displayName = String(raw?.display_name || raw?.displayName || byId.get(userId)?.displayName || "Lid");
    const initial = String(raw?.initial || byId.get(userId)?.initial || initialFromName(displayName));
    const existing = byId.get(userId);
    const next = {
      userId,
      displayName,
      initial,
      checksCompleted,
      verified: Boolean(raw?.verified),
    };
    byId.set(userId, existing ? { ...existing, ...next } : next);
  });

  return [...byId.values()].sort((a, b) => {
    if (a.userId === state.user.id) return -1;
    if (b.userId === state.user.id) return 1;
    return String(a.displayName).localeCompare(String(b.displayName), "nl");
  });
}

function renderMemberList(checkins = []) {
  const container = document.querySelector("#member-list");
  if (!container) return;

  const roster = buildRoster(checkins);
  container.setAttribute("role", "list");
  container.replaceChildren(
    ...roster.map((member) => {
      const row = document.createElement("article");
      const tone = memberTone(member);
      row.className = `member-row ${tone}`.trim();
      row.setAttribute("role", "listitem");
      const avatarClass = tone === "warning" ? "avatar danger" : "avatar";
      row.innerHTML = `
        <div class="${avatarClass}">${member.initial || "Y"}</div>
        <div>
          <strong>${member.userId === state.user.id ? "Jij" : member.displayName}</strong>
          <span>${memberSubtitle(member)}</span>
        </div>
        <em>${memberStatusLabel(member)}</em>
      `;
      return row;
    }),
  );

  const remaining = roster.filter((member) => member.checksCompleted < exercises.length).length;
  setText("#group-hero-title", remaining === 1 ? "1 iemand moet nog checken" : `${remaining} mensen moeten nog checken`);
}

async function upsertCheckinToBackend({ silent = true } = {}) {
  if (!state.apiBase) return false;
  try {
    await api.post("/api/checkins", {
      group_id: state.group.id,
      user_id: state.user.id,
      display_name: state.user.name || "Jij",
      initial: state.user.initial || "Y",
      checks_completed: state.todayChecks,
      checks_total: exercises.length,
      verified: state.todayChecks >= exercises.length,
    });
    state.lastBackendCheckinAt = Date.now();
    persistCoreState();
    syncGroupSyncPill();
    return true;
  } catch {
    if (!silent) {
      showSheet({
        label: "Backend",
        title: "Check-in save failed",
        message: "Backend endpoint is niet bereikbaar of gaf een error. UI blijft lokaal werken.",
      });
    }
    return false;
  }
}

async function upsertMemberToBackend(member, { silent = true } = {}) {
  if (!state.apiBase) return false;
  const normalized = normalizeMember(member);
  if (!normalized) return false;
  try {
    await api.post("/api/members", {
      group_id: normalized.groupId,
      user_id: normalized.userId,
      display_name: normalized.displayName,
      initial: normalized.initial,
    });
    state.lastBackendGroupSaveAt = Date.now();
    persistCoreState();
    syncGroupSyncPill();
    return true;
  } catch {
    if (!silent) {
      showSheet({
        label: "Backend",
        title: "Member save failed",
        message: "Backend endpoint is niet bereikbaar of gaf een error. Local roster blijft leidend.",
      });
    }
    return false;
  }
}

async function upsertMemberToPersistence(member, { silent = true } = {}) {
  const supa = await upsertMemberToSupabase(member, { silent: true });
  const backend = await upsertMemberToBackend(member, { silent: true });
  if (!silent && !(supa || backend)) {
    showSheet({
      label: "Sync",
      title: "Geen persistence actief",
      message: "Zet Supabase (auth) of een API base aan om leden te syncen. Local roster blijft leidend.",
    });
  }
  return supa || backend;
}

async function upsertMemberToSupabase(member, { silent = true } = {}) {
  const normalized = normalizeMember(member);
  if (!normalized) return false;
  if (!supabaseConfigured()) return false;
  const session = await refreshSupabaseSession({ silent: true });
  if (!session) return false;
  try {
    const client = await getSupabaseClient();
    if (!client) return false;
    const payload = {
      group_id: normalized.groupId,
      user_id: normalized.userId,
      display_name: normalized.displayName,
      initial: normalized.initial,
      created_by: state.user.id,
    };
    const { error } = await client.from("members").upsert(payload, { onConflict: "group_id,user_id" });
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn("supabase_member_upsert_failed", error);
    if (!silent) {
      showSheet({
        label: "Supabase",
        title: "Member sync mislukt",
        message: "Supabase write faalde. Check RLS policies en of je ingelogd bent.",
      });
    }
    return false;
  }
}

async function syncMembersFromBackend({ silent = true } = {}) {
  if (!state.apiBase) return [];
  try {
    const payload = await api.get(`/api/members/${encodeURIComponent(state.group.id)}`);
    const members = Array.isArray(payload?.members) ? payload.members : [];
    members.map(normalizeMember).filter(Boolean).forEach(upsertMemberLocal);

    const roster = currentGroupMembers();
    if (roster.length) {
      state.group.membersCount = roster.length;
      upsertGroup(state.group);
    }
    state.lastBackendSyncAt = Date.now();
    persistCoreState();
    syncGroupUI();
    syncGroupSyncPill();
    return members;
  } catch {
    if (!silent) {
      showSheet({
        label: "Sync",
        title: "Members sync mislukt",
        message: "Backend niet bereikbaar of CORS blokkeert `/api/members/...`. Local roster blijft leidend.",
      });
    }
    return [];
  }
}

function mergeIfEmpty(currentValue, nextValue) {
  const current = String(currentValue || "").trim();
  const next = String(nextValue || "").trim();
  if (current) return currentValue;
  return next || currentValue;
}

async function upsertProfileToBackend({ silent = true } = {}) {
  if (!state.apiBase) return false;
  const userId = state.user?.id;
  if (!userId) return false;
  try {
    await api.post("/api/profiles", {
      user_id: userId,
      name: state.user?.name || "",
      email: state.user?.email || "",
      stripe_customer_id: state.stripeCustomerId || "",
      stripe_subscription_id: state.stripeSubscriptionId || "",
      stripe_payment_method_id: state.stripePaymentMethodId || "",
    });
    return true;
  } catch {
    if (!silent) {
      showSheet({
        label: "Backend",
        title: "Profile save failed",
        message: "Backend endpoint is niet bereikbaar of gaf een error. Local storage blijft leidend.",
      });
    }
    return false;
  }
}

async function syncProfileFromBackend({ silent = true } = {}) {
  if (!state.apiBase) return false;
  const userId = state.user?.id;
  if (!userId) return false;
  try {
    const payload = await api.get(`/api/profiles/${encodeURIComponent(userId)}`);
    const normalized = normalizeBackendProfile(payload?.profile);
    if (!normalized) return false;

    state.user = {
      ...state.user,
      name: mergeIfEmpty(state.user?.name, normalized.name),
      email: mergeIfEmpty(state.user?.email, normalized.email),
      initial: initialFromName(mergeIfEmpty(state.user?.name, normalized.name)),
    };
    state.stripeCustomerId = mergeIfEmpty(state.stripeCustomerId, normalized.stripeCustomerId);
    state.stripeSubscriptionId = mergeIfEmpty(state.stripeSubscriptionId, normalized.stripeSubscriptionId);
    state.stripePaymentMethodId = mergeIfEmpty(state.stripePaymentMethodId, normalized.stripePaymentMethodId);
    if (state.stripePaymentMethodId) state.paymentMandateSetup = true;

    persistCoreState();
    syncUserUI();
    syncPaymentModel();
    return true;
  } catch {
    if (!silent) {
      showSheet({
        label: "Backend",
        title: "Profile sync failed",
        message: "Backend endpoint is niet bereikbaar of gaf een error. Local storage blijft leidend.",
      });
    }
    return false;
  }
}

let profileSaveTimer = null;
function scheduleProfileSave() {
  if (!state.apiBase) return;
  if (profileSaveTimer) window.clearTimeout(profileSaveTimer);
  profileSaveTimer = window.setTimeout(() => {
    profileSaveTimer = null;
    upsertProfileToBackend({ silent: true });
  }, 600);
}

async function syncCheckinsFromBackend({ silent = true } = {}) {
  if (!state.apiBase) return [];
  try {
    const payload = await api.get(`/api/checkins/${encodeURIComponent(state.group.id)}/today`);
    const checkins = Array.isArray(payload?.checkins) ? payload.checkins : [];
    state.lastBackendSyncAt = Date.now();
    persistCoreState();
    syncGroupSyncPill();
    renderMemberList(checkins);
    return checkins;
  } catch {
    if (!silent) {
      showSheet({
        label: "Sync",
        title: "Check-ins sync mislukt",
        message: "Backend niet bereikbaar of CORS blokkeert `/api/checkins/...`. Demo lijst blijft zichtbaar.",
      });
    }
    renderMemberList([]);
    return [];
  }
}

function syncSuccessScreen() {
  const label = document.querySelector("#success-label");
  const title = document.querySelector("#success-title");
  const copy = document.querySelector("#success-copy");
  const fee = document.querySelector("#success-fee");
  const streak = document.querySelector("#success-streak");

  const kind = state.successKind || "workout";
  if (kind === "pass") {
    if (label) label.textContent = "Pressure Pass";
    if (title) title.textContent = "Checkout gelukt";
    if (copy) {
      copy.textContent = state.lastCheckoutSessionId
        ? `Je abonnement is gestart. Session: ${state.lastCheckoutSessionId}.`
        : "Je abonnement is gestart. Je groep kan nu miss fees off-session verwerken.";
    }
    if (fee) fee.textContent = "EUR 0";
    if (streak) streak.textContent = String(state.streak + 1);
    return;
  }

  if (label) label.textContent = "Workout telt";
  if (title) title.textContent = "4/4 checks gehaald";
  if (copy) copy.textContent = "Je streak is beschermd. De groep ziet dat je workout verified is.";
  if (fee) fee.textContent = "EUR 0";
  if (streak) streak.textContent = String(state.streak + 1);
}

function maybeNotifyBillingCancel() {
  const { params } = parseHashRoute();
  if (params.get("cancel") !== "1") return;
  history.replaceState(null, "", "#billing");
  showSheet({
    label: "Checkout",
    title: "Checkout geannuleerd",
    message: "Geen probleem. Je kunt later opnieuw starten. Demo state blijft actief zolang Stripe niet gekoppeld is.",
  });
}

function handleCheckoutReturnFromHash() {
  const { screen, params } = parseHashRoute();
  if (screen !== "success") return false;
  const kind = (params.get("kind") || "").trim().toLowerCase();
  if (kind !== "pass") return false;

  state.successKind = "pass";
  const sessionId = (params.get("session_id") || params.get("session") || "").trim();
  if (sessionId) state.lastCheckoutSessionId = sessionId;
  state.paymentSetup = true;
  persistCoreState();
  syncPaymentModel();
  history.replaceState(null, "", "#success");
  if (sessionId) fetchCheckoutSessionDetails(sessionId);
  return true;
}

async function fetchCheckoutSessionDetails(sessionId) {
  if (!state.apiBase) return;
  try {
    const payload = await api.get(`/api/payments/checkout-session/${encodeURIComponent(sessionId)}`);
    if (payload?.customer_id) state.stripeCustomerId = String(payload.customer_id);
    if (payload?.subscription_id) state.stripeSubscriptionId = String(payload.subscription_id);
    persistCoreState();
    syncPaymentModel();
    upsertProfileToBackend({ silent: true });
  } catch {
    // optional enrichment for portal access
  }
}

async function openCustomerPortal() {
  if (!state.apiBase) {
    showSheet({
      label: "Stripe",
      title: "Geen API base ingesteld",
      message: "Zet in onboarding een backend URL om het customer portal endpoint te gebruiken.",
    });
    return;
  }

  const button = document.querySelector("#billing-open-portal");
  if (button instanceof HTMLButtonElement) {
    button.disabled = true;
    button.textContent = "Portal laden...";
  }

  try {
    const email = state.user.email || "demo@example.com";
    const returnUrl = `${window.location.origin}${window.location.pathname}#billing`;
    const payload = await api.post("/api/payments/customer-portal", {
      stripe_customer_id: state.stripeCustomerId,
      email,
      return_url: returnUrl,
    });

    const portalUrl = payload?.portal_url;
    showSheet({
      label: payload?.mode === "stripe" ? "Stripe" : "Demo",
      title: "Customer portal klaar",
      message: portalUrl ? "Open Stripe portal om je abonnement en payment method te beheren." : "Geen portal URL ontvangen.",
      primary: "Open portal",
      secondary: "Sluiten",
      onPrimary: () => {
        if (portalUrl) openExternalUrl(portalUrl);
      },
    });
  } catch {
    showSheet({
      label: "Stripe",
      title: "Portal mislukt",
      message: "Backend endpoint faalde of Stripe is niet ready. UI blijft in demo mode.",
    });
  } finally {
    if (button instanceof HTMLButtonElement) {
      button.disabled = false;
      button.textContent = "Beheer abonnement (Stripe)";
    }
  }
}

async function syncStripeIdsFromEmail({ silent = false } = {}) {
  if (!state.apiBase) {
    if (!silent) {
      showSheet({
        label: "Stripe",
        title: "Geen API base ingesteld",
        message: "Zet in onboarding een backend URL om Stripe IDs te syncen.",
      });
    }
    return null;
  }

  const email = (state.user.email || "").trim();
  if (!email) {
    if (!silent) {
      showSheet({
        label: "Stripe",
        title: "Geen email bekend",
        message: "Vul een email in bij Profiel of onboarding zodat we je Stripe customer kunnen opzoeken.",
      });
    }
    return null;
  }

  const button = silent ? null : document.querySelector("#billing-sync-stripe");
  if (button instanceof HTMLButtonElement) {
    button.disabled = true;
    button.textContent = "Syncen...";
  }

  try {
    const payload = await api.get(`/api/payments/customer-lookup?email=${encodeURIComponent(email)}`);
    const customerId = String(payload?.customer_id || "").trim();
    const subscriptionId = String(payload?.subscription_id || "").trim();

    if (customerId) state.stripeCustomerId = customerId;
    if (subscriptionId) state.stripeSubscriptionId = subscriptionId;

    persistCoreState();
    syncPaymentModel();
    upsertProfileToBackend({ silent: true });

    if (!silent) {
      showSheet({
        label: payload?.mode === "stripe" ? "Stripe" : "Demo",
        title: customerId ? "Stripe IDs gesynced" : "Geen Stripe customer gevonden",
        message: customerId
          ? `Customer: ${customerId}${subscriptionId ? ` • Sub: ${subscriptionId}` : ""}.`
          : "Controleer of je checkout met hetzelfde email adres is afgerond.",
      });
    }

    return { customerId, subscriptionId, mode: payload?.mode || "demo" };
  } catch {
    if (!silent) {
      showSheet({
        label: "Stripe",
        title: "Sync mislukt",
        message: "Backend niet bereikbaar of endpoint faalde. Probeer opnieuw na een health check.",
      });
    }
    return null;
  } finally {
    if (button instanceof HTMLButtonElement) {
      button.disabled = false;
      button.textContent = "Sync Stripe IDs via email";
    }
  }
}

function syncCreateScreenUI() {
  const createNewToggle = document.querySelector("#create-new-toggle");
  const title = document.querySelector("#create-title");
  const label = document.querySelector("#screen-create .create-hero .section-label");
  const headline = document.querySelector("#screen-create .create-hero h1");
  const submit = document.querySelector('#create-group-form button[type="submit"]');
  const deleteButton = document.querySelector("#create-delete-group");
  const creatingNew = Boolean(createNewToggle?.checked);

  if (creatingNew && !state.createDraftGroupId) state.createDraftGroupId = newId("group");
  if (creatingNew && !state.createDraftJoinCode && state.createDraftGroupId) {
    state.createDraftJoinCode = localJoinCodeFromGroupId(state.createDraftGroupId);
  }
  if (!creatingNew) {
    state.createDraftGroupId = "";
    state.createDraftJoinCode = "";
    state.createDraftHydrated = false;
    clearCreateDraft();
  }

  if (creatingNew && !state.createDraftHydrated) {
    const draft = loadCreateDraft();
    const nameField = document.querySelector("#group-name-input");
    const deadlineField = document.querySelector("#deadline-input");
    const feeField = document.querySelector("#fee-input");
    const destinationField = document.querySelector("#destination-input");

    if (draft) {
      if (nameField instanceof HTMLInputElement && draft.name) nameField.value = draft.name;
      if (deadlineField instanceof HTMLSelectElement && draft.deadline) deadlineField.value = draft.deadline;
      if (feeField instanceof HTMLSelectElement && draft.feeLabel) feeField.value = draft.feeLabel;
      if (destinationField instanceof HTMLSelectElement && draft.destinationLabel) destinationField.value = draft.destinationLabel;
    }

    state.createDraftHydrated = true;
  }

  if (title) title.textContent = creatingNew ? "Groep maken" : "Groep bewerken";
  if (label) label.textContent = creatingNew ? "Nieuwe groep" : "Bewerk groep";
  if (headline) headline.textContent = creatingNew ? "Maak de regels eerst duidelijk." : "Update de regels voor je groep.";
  if (submit) submit.textContent = creatingNew ? "Maak groep live" : "Sla wijzigingen op";
  if (deleteButton) deleteButton.classList.toggle("hidden", creatingNew);
  syncInviteLinkUI();
}

function deleteGroupLocal(groupId) {
  const id = String(groupId || "").trim();
  if (!id) return false;

  if (state.groups?.[id]) delete state.groups[id];
  if (state.membersByGroup?.[id]) delete state.membersByGroup[id];

  const ledgerStore = loadLedgerStore();
  if (ledgerStore && typeof ledgerStore === "object" && ledgerStore[id]) {
    const next = { ...ledgerStore };
    delete next[id];
    try {
      localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota
    }
  }

  if (state.activeGroupId === id) {
    const fallback = sortedGroups()[0]?.id;
    if (fallback) {
      state.activeGroupId = fallback;
      state.group = { ...state.group, ...state.groups[fallback], id: fallback };
    } else {
      state.group = {
        ...state.group,
        id: newId("group"),
        name: "Nieuwe groep",
        deadline: "22:00",
        feeLabel: "EUR 10",
        destinationLabel: "Platform fee, geen cash-out",
        membersCount: 1,
      };
      state.activeGroupId = state.group.id;
      state.groups = { [state.group.id]: state.group };
    }
  }

  persistCoreState();
  syncGroupUI();
  syncLedgerUI();
  renderGroupSelector();
  updateInvitePreview();
  updateHome();
  updateCamera();
  syncGroupSyncPill();
  return true;
}

async function deleteGroupFromBackend(groupId, { silent = true } = {}) {
  if (!state.apiBase) return false;
  const id = String(groupId || "").trim();
  if (!id) return false;
  try {
    await api.delete(`/api/groups/${encodeURIComponent(id)}`);
    return true;
  } catch {
    if (!silent) {
      showSheet({
        label: "Backend",
        title: "Delete failed",
        message: "Backend endpoint is niet bereikbaar of gaf een error. Group is lokaal verwijderd.",
      });
    }
    return false;
  }
}

function updateCamera() {
  const current = currentExercise();
  setText("#camera-title", current.title);
  setText("#camera-step-label", `Oefening ${state.activeExerciseIndex + 1} van 4`);
  setText("#camera-instruction", current.instruction);
  setText("#form-score", `${state.form}%`);
  setText("#trust-score", `${state.trust}%`);
  setText("#angle-line", current.lock);

  const fill = document.querySelector("#trace-fill");
  const bar = document.querySelector(".trace-bar");
  if (fill) fill.style.width = `${state.tracePercent}%`;
  if (bar) bar.setAttribute("aria-valuenow", String(state.tracePercent));

  updateVisionUI(vision.lastDetections);
  updateTraceGateUI();
}

function addFeedItem(title, subtitle, tone = "") {
  const feed = document.querySelector("#feed-list");
  if (!feed) return;

  const row = document.createElement("article");
  row.className = `feed-row ${tone}`.trim();
  row.innerHTML = `
    <div class="avatar">${state.user.initial || "Y"}</div>
    <div>
      <strong>${title}</strong>
      <span>${subtitle}</span>
    </div>
    <small>nu</small>
  `;
  feed.prepend(row);
}

function openCamera() {
  if (state.todayChecks >= exercises.length) {
    state.successKind = "workout";
    showScreen("success");
    return;
  }
  showScreen("camera");
}

function handleExerciseClick(index) {
  if (index < state.todayChecks) {
    showSheet({
      label: "Al klaar",
      title: `${exercises[index].title} is geaccepteerd`,
      message: "Deze oefening telt al mee voor je workout van vandaag.",
    });
    return;
  }

  if (index === state.activeExerciseIndex) {
    openCamera();
    return;
  }

  showSheet({
    label: "Nog locked",
    title: "Rond eerst de vorige check af",
    message: `${exercises[index].title} opent zodra oefening ${state.activeExerciseIndex + 1} is geaccepteerd.`,
    primary: "Start huidige check",
    onPrimary: openCamera,
  });
}

function normalizeDetections(payload) {
  const source = Array.isArray(payload)
    ? payload
    : payload?.detections || payload?.predictions || [];

  return source
    .map((item) => {
      const label = item.label || item.class || item.class_name || item.name || "object";
      const confidence = Number(item.confidence ?? item.score ?? 0.8);
      const box = item.box || item.bbox || item.xyxy || item;

      let x = Number(box.x ?? box.left ?? box[0] ?? 0.32);
      let y = Number(box.y ?? box.top ?? box[1] ?? 0.22);
      let width = Number(box.width ?? box.w ?? ((box[2] ?? 0.78) - x));
      let height = Number(box.height ?? box.h ?? ((box[3] ?? 0.84) - y));

      if (x > 1 || y > 1 || width > 1 || height > 1) {
        const canvas = document.querySelector("#vision-overlay");
        x /= canvas.width || 390;
        y /= canvas.height || 844;
        width /= canvas.width || 390;
        height /= canvas.height || 844;
      }

      return { label, confidence, x, y, width, height };
    })
    .filter((item) => item.confidence >= 0.35);
}

function demoDetections() {
  const current = currentExercise();
  return [
    { label: "person", confidence: 0.96, x: 0.24, y: 0.18, width: 0.5, height: 0.68 },
    { label: "full body", confidence: current.title === "Walking lunge" ? 0.89 : 0.92, x: 0.18, y: 0.16, width: 0.62, height: 0.74 },
    { label: current.title.toLowerCase(), confidence: 0.86, x: 0.3, y: 0.34, width: 0.42, height: 0.38 },
  ];
}

function detectionLabel(detection) {
  return `${detection.label} ${Math.round(detection.confidence * 100)}%`;
}

function isPersonDetection(detection) {
  return detection.label.toLowerCase().includes("person");
}

function isFullBodyFrame(detection) {
  const bottom = detection.y + detection.height;
  return isPersonDetection(detection) && detection.height >= 0.54 && detection.y <= 0.36 && bottom >= 0.74;
}

function enrichDetections(detections) {
  const fullBodySource = detections.find(isFullBodyFrame);
  const alreadyHasBody = detections.some((item) => item.label.toLowerCase().includes("body"));

  if (!fullBodySource || alreadyHasBody) return detections;

  return [
    ...detections,
    {
      ...fullBodySource,
      label: "full body frame",
      confidence: Math.min(0.92, fullBodySource.confidence),
    },
  ];
}

function detectionTags(detections) {
  const bestByLabel = new Map();
  enrichDetections(detections).forEach((item) => {
    const key = item.label.toLowerCase();
    const current = bestByLabel.get(key);
    if (!current || item.confidence > current.confidence) bestByLabel.set(key, item);
  });

  return [...bestByLabel.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 4);
}

function updateVisionUI(detections = []) {
  const status = document.querySelector("#vision-status");
  const tags = document.querySelector("#vision-tags");
  const summary = document.querySelector("#vision-summary");
  if (!status || !tags || !summary) return;

  const detected = enrichDetections(detections.length ? detections : demoDetections());
  const tagItems = detectionTags(detected);
  const hasPerson = detected.some(isPersonDetection);
  const hasBody = detected.some((item) => item.label.toLowerCase().includes("body"));
  const mode = state.visionMode === "rfdetr" ? "RF-DETR live" : "Demo";

  status.className = "vision-status";
  if (hasPerson && hasBody) status.classList.add("live");
  if (!hasPerson) status.classList.add("warning");
  status.textContent = mode;

  tags.replaceChildren(
    ...tagItems.map((item) => {
      const tag = document.createElement("span");
      tag.textContent = detectionLabel(item);
      return tag;
    }),
  );

  summary.textContent =
    hasPerson && hasBody
      ? "Full body is zichtbaar. Deze check kan meetellen."
      : "Stap verder naar achteren tot je hele lichaam zichtbaar is.";

  setText("#form-score", hasBody ? `${state.form}%` : "Hold");
  setText("#trust-score", hasPerson ? `${state.trust}%` : "Laag");
}

function activeCameraScreen() {
  return Boolean(screens.camera?.classList.contains("active"));
}

function currentTraceDetections() {
  return enrichDetections(vision.lastDetections.length ? vision.lastDetections : demoDetections());
}

function traceDetectionState() {
  const detections = currentTraceDetections();
  const hasPerson = detections.some(isPersonDetection);
  const hasBody = detections.some((item) => item.label.toLowerCase().includes("body"));
  const canProgress = activeCameraScreen() && !state.cameraPaused && hasPerson && hasBody && state.todayChecks < exercises.length;
  return { detections, hasPerson, hasBody, canProgress };
}

function traceReady() {
  return state.traceCleanMs >= state.traceRequiredMs;
}

function setTraceLine(selector, mode, text) {
  const line = document.querySelector(selector);
  if (!line) return;
  line.classList.remove("okay", "warning", "blocked");
  line.classList.add(mode);
  line.textContent = text;
}

function updateTraceGateUI() {
  const { hasPerson, hasBody, canProgress } = traceDetectionState();
  const ready = traceReady();
  const leftMs = Math.max(0, state.traceRequiredMs - state.traceCleanMs);
  const leftSeconds = Math.ceil(leftMs / 1000);
  const progress = Math.min(100, Math.round((state.traceCleanMs / state.traceRequiredMs) * 100));
  state.tracePercent = progress;

  const fill = document.querySelector("#trace-fill");
  const bar = document.querySelector(".trace-bar");
  if (fill) fill.style.width = `${progress}%`;
  if (bar) bar.setAttribute("aria-valuenow", String(progress));

  setText("#trace-timer", ready ? "DONE" : `00:${String(leftSeconds).padStart(2, "0")}`);
  setText("#trace-hint", ready ? "Trace locked. Je kunt deze oefening nu accepteren." : "Blijf in beeld. De check opent pas na 10 seconden live trace.");
  setText("#motion-score", state.cameraPaused ? "Pauze" : ready ? "Ready" : canProgress ? "Live" : "Wacht");

  setTraceLine(
    "#full-body-line",
    hasPerson && hasBody ? "okay" : "blocked",
    hasPerson && hasBody ? "Full body zichtbaar" : "Zet je hele lichaam in beeld",
  );
  setTraceLine(
    "#movement-line",
    canProgress || ready ? "okay" : state.cameraPaused ? "warning" : "blocked",
    ready ? "10 sec live trace voltooid" : state.cameraPaused ? "Trace gepauzeerd" : canProgress ? "Live trace loopt" : "Trace wacht op live beeld",
  );
  setTraceLine(
    "#angle-line",
    ready ? "okay" : canProgress ? "warning" : "blocked",
    ready ? `${currentExercise().title} geaccepteerd door trace` : currentExercise().lock,
  );

  const acceptButton = document.querySelector("#simulate-verify");
  if (acceptButton instanceof HTMLButtonElement) {
    acceptButton.disabled = !ready;
    acceptButton.setAttribute("aria-disabled", acceptButton.disabled ? "true" : "false");
    acceptButton.classList.toggle("ready", ready);
    acceptButton.textContent = ready ? "Accepteer check" : `${leftSeconds}s nodig`;
  }
}

function resetTraceGate({ announce = false } = {}) {
  state.traceCleanMs = 0;
  state.traceLastTickAt = Date.now();
  state.tracePercent = 0;
  updateTraceGateUI();
  if (announce) setLiveStatus("Trace opnieuw gestart");
}

function tickTraceGate() {
  if (!activeCameraScreen()) {
    state.traceLastTickAt = Date.now();
    return;
  }

  const now = Date.now();
  const previous = state.traceLastTickAt || now;
  const delta = Math.min(600, Math.max(0, now - previous));
  state.traceLastTickAt = now;

  if (!traceReady()) {
    const { canProgress } = traceDetectionState();
    if (canProgress) {
      state.traceCleanMs = Math.min(state.traceRequiredMs, state.traceCleanMs + delta);
    } else if (!state.cameraPaused && state.traceCleanMs > 0) {
      state.traceCleanMs = Math.max(0, state.traceCleanMs - Math.round(delta * 0.35));
    }
  }

  updateTraceGateUI();
}

function startTraceGate() {
  state.traceLastTickAt = Date.now();
  updateTraceGateUI();
  if (!vision.traceTimer) {
    vision.traceTimer = window.setInterval(tickTraceGate, 400);
  }
}

function drawVisionOverlay(detections = []) {
  const canvas = document.querySelector("#vision-overlay");
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * scale);
  canvas.height = Math.round(rect.height * scale);

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(scale, scale);

  detections.forEach((detection) => {
    const x = detection.x * rect.width;
    const y = detection.y * rect.height;
    const width = detection.width * rect.width;
    const height = detection.height * rect.height;
    const label = detectionLabel(detection);

    ctx.strokeStyle = detection.label.toLowerCase().includes("person") ? "#ff5a00" : "#168a3a";
    ctx.lineWidth = 3;
    ctx.shadowColor = "rgba(0,0,0,0.24)";
    ctx.shadowBlur = 8;
    ctx.strokeRect(x, y, width, height);

    ctx.shadowBlur = 0;
    ctx.font = "900 11px Inter, sans-serif";
    const labelWidth = ctx.measureText(label).width + 14;
    ctx.fillStyle = "#050505";
    ctx.fillRect(x, Math.max(8, y - 27), labelWidth, 23);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, x + 7, Math.max(24, y - 11));
  });

  ctx.restore();
}

function drawVisionLoop() {
  const detections = vision.lastDetections.length ? enrichDetections(vision.lastDetections) : demoDetections();
  drawVisionOverlay(detections);
  vision.raf = requestAnimationFrame(drawVisionLoop);
}

function captureFrame() {
  const video = document.querySelector("#camera-video");
  if (!video || video.readyState < 2) return null;

  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 384;
  const context = canvas.getContext("2d");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

async function detectFrame() {
  if (state.cameraPaused) return;

  if (!vision.endpoint) {
    state.visionMode = "demo";
    vision.lastDetections = demoDetections();
    updateVisionUI(vision.lastDetections);
    return;
  }

  const image = captureFrame();
  if (!image) {
    state.visionMode = "demo";
    vision.lastDetections = demoDetections();
    updateVisionUI(vision.lastDetections);
    return;
  }

  try {
    const response = await fetch(vision.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image,
        exercise: currentExercise().title,
        confidence: 0.45,
      }),
    });

    if (!response.ok) throw new Error(`RF-DETR endpoint ${response.status}`);
    const payload = await response.json();
    const detections = normalizeDetections(payload);
    if (payload?.mode === "error" || !detections.length) {
      throw new Error(payload?.message || "RF-DETR returned no detections");
    }
    vision.lastDetections = detections;
    state.visionMode = "rfdetr";
  } catch {
    state.visionMode = "demo";
    vision.lastDetections = demoDetections();
  }

  updateVisionUI(vision.lastDetections);
  updateTraceGateUI();
}

async function startVision() {
  const video = document.querySelector("#camera-video");
  if (!video) return;

  if (!vision.raf) {
    vision.lastDetections = demoDetections();
    drawVisionLoop();
    updateVisionUI(vision.lastDetections);
  }

  if (!vision.timer) {
    detectFrame();
    vision.timer = window.setInterval(detectFrame, 1400);
  }
  startTraceGate();

  if (!vision.stream && navigator.mediaDevices?.getUserMedia) {
    try {
      vision.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      video.srcObject = vision.stream;
      video.classList.add("is-live");
      setLiveStatus("Camera preview actief");
    } catch {
      video.classList.remove("is-live");
      state.visionMode = "demo";
      setLiveStatus("Camera toestemming niet beschikbaar. Demo controle actief.");
    }
  }
}

async function acceptCurrentExercise() {
  if (!traceReady()) {
    const leftSeconds = Math.ceil(Math.max(0, state.traceRequiredMs - state.traceCleanMs) / 1000);
    showSheet({
      label: "Trace nodig",
      title: "Nog niet genoeg live bewijs",
      message: `Blijf nog ${leftSeconds} seconden volledig in beeld. Daarna opent de check automatisch.`,
    });
    return;
  }

  const current = currentExercise();
  addFeedItem(`${current.title} geaccepteerd`, `Trust score ${state.trust}%`, "good");

  if (state.activeExerciseIndex < exercises.length - 1) {
    state.todayChecks = Math.min(exercises.length, state.todayChecks + 1);
    state.activeExerciseIndex += 1;
    resetTraceGate();
    state.form = currentExercise().form;
    state.trust = currentExercise().trust;
    updateHome();
    updateCamera();
    await upsertCheckinToBackend({ silent: true });
    if (state.apiBase) {
      await syncCheckinsFromBackend({ silent: true });
    } else {
      renderMemberList([]);
    }
    showSheet({
      label: "Check klaar",
      title: `${current.title} telt mee`,
      message: `Oefening ${state.activeExerciseIndex + 1} is nu open. Nog ${remainingChecks()} check${remainingChecks() === 1 ? "" : "s"} tot je workout telt.`,
      primary: "Volgende check",
      onPrimary: openCamera,
    });
    return;
  }

  state.streak += 1;
  state.verifiedCount += 1;
  state.todayChecks = exercises.length;
  state.traceCleanMs = state.traceRequiredMs;
  state.tracePercent = 100;
  setText("#trace-timer", "DONE");
  setText("#motion-score", "Locked");
  setText("#success-streak", String(state.streak));
  addFeedItem("Jij hebt 4/4 gehaald", "Workout telt vandaag", "good");
  updateHome();
  updateCamera();
  await upsertCheckinToBackend({ silent: true });
  if (state.apiBase) await syncCheckinsFromBackend({ silent: true });
  state.successKind = "workout";
  showScreen("success");
}

function scanAgain() {
  resetTraceGate({ announce: true });
  state.form = currentExercise().form;
  state.trust = currentExercise().trust;
  vision.lastDetections = demoDetections();
  updateCamera();
}

function destinationLabel() {
  if (state.feeDestination === "perks") return "team perks";
  if (state.feeDestination === "cash") return "cash winnaar";
  return "platform fee";
}

function syncPaymentModel() {
  document.querySelectorAll(".model-option").forEach((button) => {
    const active = button.dataset.model === state.feeDestination;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });

  const passReady = Boolean(state.paymentSetup);
  const mandateReady = Boolean(state.paymentMandateSetup || state.stripePaymentMethodId);

  setText("#payment-status-pill", mandateReady ? "Mandate" : passReady ? "Pass" : "Demo");
  setText(
    "#setup-mandate-copy",
    mandateReady
      ? "Payment method is opgeslagen. Backend kan nu off-session miss fees verwerken."
      : passReady
        ? "Sla nu een payment method op (mandate) zodat miss fees later off-session kunnen."
        : "Gebruiker moet expliciet akkoord geven voor latere fees.",
  );

  const portal = document.querySelector("#billing-open-portal");
  if (portal) portal.classList.toggle("hidden", !(state.apiBase && passReady && (state.stripeCustomerId || state.user.email)));

  const passRow = document.querySelector("#setup-pass-row");
  if (passRow) {
    passRow.classList.toggle("done", passReady);
    passRow.classList.toggle("active", !passReady);
  }

  const mandateButton = document.querySelector("#setup-mandate");
  if (mandateButton instanceof HTMLButtonElement) {
    mandateButton.disabled = !passReady;
    mandateButton.setAttribute("aria-disabled", mandateButton.disabled ? "true" : "false");
  }

  const mandateRow = document.querySelector("#setup-mandate-row");
  if (mandateRow) {
    mandateRow.classList.toggle("done", mandateReady);
    mandateRow.classList.toggle("active", passReady && !mandateReady);
    mandateRow.classList.toggle("locked", !passReady);
  }

  const webhookRow = document.querySelector("#setup-webhook-row");
  if (webhookRow) {
    webhookRow.classList.toggle("done", mandateReady);
    webhookRow.classList.toggle("active", mandateReady);
    webhookRow.classList.toggle("locked", !mandateReady);
  }

  const chargeButton = document.querySelector("#charge-miss-fee");
  if (chargeButton instanceof HTMLButtonElement) {
    chargeButton.disabled = !(state.apiBase && mandateReady);
    chargeButton.setAttribute("aria-disabled", chargeButton.disabled ? "true" : "false");
  }

  const settleButton = document.querySelector("#settle-day");
  if (settleButton instanceof HTMLButtonElement) {
    settleButton.disabled = Boolean(state.apiBase && !mandateReady);
    settleButton.setAttribute("aria-disabled", settleButton.disabled ? "true" : "false");
  }

  const customerId = document.querySelector("#stripe-customer-id");
  if (customerId instanceof HTMLInputElement) customerId.value = state.stripeCustomerId || "";
  const subscriptionId = document.querySelector("#stripe-subscription-id");
  if (subscriptionId instanceof HTMLInputElement) subscriptionId.value = state.stripeSubscriptionId || "";
  const paymentMethodId = document.querySelector("#stripe-payment-method-id");
  if (paymentMethodId instanceof HTMLInputElement) paymentMethodId.value = state.stripePaymentMethodId || "";
}

function chooseFeeDestination(model) {
  if (model === "cash" || model === "perks") {
    const title = model === "cash" ? "Cash naar winnaar staat uit" : "Team perks blijven locked";
    showSheet({
      label: "Geblokkeerd",
      title,
      message:
        "Voor de beta gebruiken we geen pot, wallet of doorbetaling. Eerst legal/payment review, daarna pas non-cash perks of payouts.",
      primary: "Gebruik platform fee",
      onPrimary: () => chooseFeeDestination("platform"),
    });
    return;
  }

  state.feeDestination = model;
  syncPaymentModel();
  persistCoreState();
  showSheet({
    label: "Model gekozen",
    title: `Miss fees worden ${destinationLabel()}`,
    message: "De app blijft streng, maar vermijdt potten, wallets en cashprijzen voor deelnemers.",
  });
}

function setupPaymentPermission() {
  setupPaymentPermissionLive();
}

async function setupPaymentPermissionLive() {
  const confirm = document.querySelector("#billing-confirm");
  const email = state.user.email || document.querySelector("#onboard-email")?.value?.trim() || "";
  const userId = state.user.id;

  if (!state.apiBase) {
    state.paymentSetup = true;
    syncPaymentModel();
    persistCoreState();
    showSheet({
      label: "Demo",
      title: "Betaaltoestemming staat aan",
      message: "Geen backend ingesteld. In productie loopt dit via Stripe Checkout/SetupIntent + webhook bij miss.",
    });
    return;
  }

  if (confirm && !confirm.checked) {
    showSheet({
      label: "Bevestig",
      title: "Bevestig checkout",
      message: "Vink eerst aan dat je begrijpt dat er een Stripe (test) checkout in een nieuw tabblad kan openen.",
      primary: "Ok",
      onPrimary: () => {
        if (confirm instanceof HTMLElement) confirm.focus();
      },
    });
    return;
  }

  try {
    const health = await api.get("/api/payments/health");
    const ready = Boolean(health?.stripe_ready);
    const checkout = await api.post("/api/payments/pass-checkout", {
      user_id: userId,
      email: email || "demo@example.com",
      group_id: state.group.id,
    });

    state.paymentSetup = true;
    syncPaymentModel();
    persistCoreState();

    showSheet({
      label: ready ? "Stripe" : "Demo backend",
      title: "Billing flow gestart",
      message: `Checkout URL ontvangen (${checkout.mode}). Open de link om je Pressure Pass te starten. Daarna kan de backend off-session miss fees verwerken.`,
      primary: "Open Checkout",
      secondary: "Sluiten",
      onPrimary: () => {
        if (checkout.checkout_url) openExternalUrl(checkout.checkout_url);
      },
    });
  } catch (error) {
    state.paymentSetup = true;
    syncPaymentModel();
    persistCoreState();
    showSheet({
      label: "Offline fallback",
      title: "Backend niet bereikbaar",
      message: "Toestemming staat lokaal aan zodat je UI flow klopt. Stel later een API base in voor echte Stripe calls.",
    });
  }
}

function setupMandate() {
  setupMandateLive();
}

async function setupMandateLive() {
  const confirm = document.querySelector("#billing-confirm");
  const email = state.user.email || document.querySelector("#onboard-email")?.value?.trim() || "";
  const userId = state.user.id;

  if (!state.apiBase) {
    state.paymentSetup = true;
    state.paymentMandateSetup = true;
    syncPaymentModel();
    persistCoreState();
    showSheet({
      label: "Demo",
      title: "Payment method (demo) opgeslagen",
      message: "Geen backend ingesteld. In productie loopt dit via Stripe Checkout (setup mode) of SetupIntent.",
    });
    return;
  }

  if (confirm && !confirm.checked) {
    showSheet({
      label: "Bevestig",
      title: "Bevestig Stripe setup",
      message: "Vink eerst aan dat je begrijpt dat er een Stripe (test) setup in een nieuw tabblad kan openen.",
      primary: "Ok",
      onPrimary: () => {
        if (confirm instanceof HTMLElement) confirm.focus();
      },
    });
    return;
  }

  const button = document.querySelector("#setup-mandate");
  if (button instanceof HTMLButtonElement) {
    button.disabled = true;
    button.textContent = "Setup laden...";
  }

  try {
    const health = await api.get("/api/payments/health");
    const ready = Boolean(health?.stripe_ready);
    const session = await api.post("/api/payments/setup-session", {
      user_id: userId,
      email: email || "demo@example.com",
      group_id: state.group.id,
      stripe_customer_id: state.stripeCustomerId || "",
      currency: "eur",
    });

    state.paymentSetup = true;
    syncPaymentModel();
    persistCoreState();

    showSheet({
      label: ready ? "Stripe" : "Demo backend",
      title: "Payment method setup gestart",
      message: `Setup URL ontvangen (${session.mode}). Na afronden keert Stripe terug naar de app en slaan we je payment method id op.`,
      primary: "Open setup",
      secondary: "Sluiten",
      onPrimary: () => {
        if (session.checkout_url) openExternalUrl(session.checkout_url);
      },
    });
  } catch {
    showSheet({
      label: "Mandate",
      title: "Setup failed",
      message: "Backend endpoint is niet bereikbaar of gaf een error. Je kunt ook via Customer Portal een payment method toevoegen.",
    });
  } finally {
    if (button instanceof HTMLButtonElement) {
      button.disabled = false;
      button.textContent = "Sla payment method op voor miss fees";
    }
  }
}

function formatLedgerMoney(amountCents, currency = "eur") {
  const cents = Number(amountCents || 0);
  const amount = (cents / 100).toFixed(2);
  return `${String(currency || "eur").toUpperCase()} ${amount.replace(/\\.00$/, "")}`;
}

function renderLedgerEntry(entry) {
  const row = document.createElement("article");
  row.setAttribute("role", "listitem");

  const when = document.createElement("span");
  when.textContent = entry.status === "charged" ? "Backend" : "Nu";

  const title = document.createElement("strong");
  title.textContent = entry.description || entry.kind.replaceAll("_", " ");

  const meta = document.createElement("em");
  meta.textContent = entry.amountCents ? formatLedgerMoney(entry.amountCents, entry.currency) : entry.status || "ok";

  row.appendChild(when);
  row.appendChild(title);
  row.appendChild(meta);
  return row;
}

function syncLedgerUI() {
  const ledger = document.querySelector("#ledger-list");
  if (!ledger) return;
  ledger.innerHTML = "";
  const entries = ledgerEntriesForGroup(state.group.id);
  if (!entries.length) {
    const empty = document.createElement("article");
    empty.setAttribute("role", "listitem");
    const span = document.createElement("span");
    span.textContent = "—";
    const strong = document.createElement("strong");
    strong.textContent = "Nog geen misses";
    const em = document.createElement("em");
    em.textContent = "Demo";
    empty.appendChild(span);
    empty.appendChild(strong);
    empty.appendChild(em);
    ledger.appendChild(empty);
    return;
  }
  entries.slice(0, 20).forEach((entry) => ledger.appendChild(renderLedgerEntry(entry)));
}

async function syncLedgerFromBackend({ silent = true } = {}) {
  if (!state.apiBase) {
    syncLedgerUI();
    return [];
  }
  try {
    const payload = await api.get(`/api/ledger/${encodeURIComponent(state.group.id)}?limit=50`);
    const entries = Array.isArray(payload?.entries) ? payload.entries : [];
    entries.map(normalizeLedgerEntry).filter(Boolean).forEach(upsertLedgerEntryLocal);
    syncLedgerUI();
    return entries;
  } catch {
    if (!silent) {
      showSheet({
        label: "Ledger",
        title: "Ledger sync mislukt",
        message: "Backend niet bereikbaar of endpoint faalde. We tonen de local ledger.",
      });
    }
    syncLedgerUI();
    return [];
  }
}

function leaderboardStatsForMember(member) {
  const userId = String(member?.userId || member?.user_id || "").trim();
  const displayName = String(member?.displayName || member?.display_name || member?.name || "").trim() || "Lid";
  const misses = ledgerEntriesForGroup(state.group.id).filter((entry) => entry?.kind === "miss_fee" && entry?.userId === userId)
    .length;
  const baseWorkouts =
    userId === state.user.id ? Math.max(0, Number(state.verifiedCount || 0)) : Math.max(0, Number(member?.workouts || 0));
  const workouts = baseWorkouts || (userId === "user_mila" ? 7 : userId === "user_layo" ? 5 : userId === "user_timothy" ? 2 : 3);
  const points = workouts * 4 - misses * 10;
  return { userId, displayName, workouts, misses, points };
}

function renderLeaderboard() {
  const list = document.querySelector("#leaderboard-list");
  if (!list) return;
  list.innerHTML = "";

  const members = currentGroupMembers();
  const fallback = demoRoster.map((item) => ({ ...item, userId: item.userId, displayName: item.displayName }));
  const roster = members.length ? members : fallback;

  const stats = roster
    .map(leaderboardStatsForMember)
    .filter((item) => item.userId)
    .sort((a, b) => b.points - a.points || b.workouts - a.workouts || a.displayName.localeCompare(b.displayName));

  if (!stats.length) {
    const empty = document.createElement("li");
    empty.className = "weak-row";
    empty.innerHTML = `<div><strong>Nog geen leaderboard</strong><span>Maak een group of voeg leden toe.</span></div><em>—</em>`;
    list.appendChild(empty);
    return;
  }

  stats.forEach((item, index) => {
    const row = document.createElement("li");
    if (item.userId === state.user.id) row.classList.add("current-user");
    if (index === stats.length - 1) row.classList.add("weak-row");
    const subtitle = `${item.workouts} workouts, ${item.misses} misses`;
    row.innerHTML = `
      <span class="rank-pill">${index + 1}</span>
      <div>
        <strong>${escapeHtml(item.displayName)}</strong>
        <span>${escapeHtml(subtitle)}</span>
      </div>
      <em>${item.points >= 0 ? `+${item.points}` : String(item.points)}</em>
    `;
    list.appendChild(row);
  });

  const userLine = stats.find((item) => item.userId === state.user.id);
  if (userLine) setText("#rank-user-status", `${userLine.workouts} workouts, ${userLine.misses} misses`);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function openExternalUrl(url) {
  const target = String(url || "").trim();
  if (!target) return false;
  try {
    const tab = window.open(target, "_blank", "noopener,noreferrer");
    if (tab) return true;
  } catch {
    // Popup blockers can throw; fallback below.
  }
  window.location.href = target;
  return true;
}

async function appendLedgerToBackend(entry, { silent = true } = {}) {
  if (!state.apiBase) return null;
  const normalized = normalizeLedgerEntry(entry);
  if (!normalized) return null;
  try {
    const payload = await api.post("/api/ledger", {
      group_id: normalized.groupId,
      kind: normalized.kind,
      user_id: normalized.userId,
      display_name: normalized.displayName,
      amount_cents: normalized.amountCents,
      currency: normalized.currency,
      description: normalized.description,
      status: normalized.status,
      payment_intent_id: normalized.paymentIntentId,
      created_at: normalized.createdAt,
    });
    const saved = normalizeLedgerEntry(payload?.entry || payload);
    if (saved) upsertLedgerEntryLocal(saved);
    syncLedgerUI();
    return saved;
  } catch {
    if (!silent) {
      showSheet({
        label: "Ledger",
        title: "Ledger save mislukt",
        message: "Backend niet bereikbaar of gaf een error. Local ledger blijft leidend.",
      });
    }
    return null;
  }
}

async function appendLedgerToPersistence(entry, { silent = true } = {}) {
  const supa = await appendLedgerToSupabase(entry, { silent: true });
  const backend = await appendLedgerToBackend(entry, { silent: true });
  if (!silent && !(supa || backend)) {
    showSheet({
      label: "Sync",
      title: "Geen persistence actief",
      message: "Zet Supabase (auth) of een API base aan om ledger te syncen. Local ledger blijft leidend.",
    });
  }
  return supa || backend;
}

async function appendLedgerToSupabase(entry, { silent = true } = {}) {
  const normalized = normalizeLedgerEntry(entry);
  if (!normalized) return null;
  if (!supabaseConfigured()) return null;
  const session = await refreshSupabaseSession({ silent: true });
  if (!session) return null;
  try {
    const client = await getSupabaseClient();
    if (!client) return null;
    const payload = {
      id: normalized.id,
      group_id: normalized.groupId,
      kind: normalized.kind,
      user_id: normalized.userId || null,
      display_name: normalized.displayName || null,
      amount_cents: normalized.amountCents,
      currency: normalized.currency,
      description: normalized.description,
      status: normalized.status,
      payment_intent_id: normalized.paymentIntentId || null,
      created_at: normalized.createdAt,
      created_by: state.user.id,
    };
    const { error } = await client.from("ledger").insert(payload);
    if (error) throw error;
    return normalized;
  } catch (error) {
    console.warn("supabase_ledger_insert_failed", error);
    if (!silent) {
      showSheet({
        label: "Supabase",
        title: "Ledger sync mislukt",
        message: "Supabase write faalde. Check RLS policies en of je ingelogd bent.",
      });
    }
    return null;
  }
}

function simulateMissFee() {
  const entry = upsertLedgerEntryLocal({
    groupId: state.group.id,
    kind: "miss_fee",
    userId: "user_timothy",
    displayName: "Timothy",
    amountCents: 1000,
    currency: "eur",
    status: "simulated",
    description: `Timothy miss fee verwerkt als ${destinationLabel()}`,
    createdAt: new Date().toISOString(),
  });
  if (entry) appendLedgerToPersistence(entry, { silent: true });
  syncLedgerUI();

  addFeedItem("Timothy miste de deadline", `EUR 10 ${destinationLabel()}, geen pot`, "bad");
  showSheet({
    label: "Miss verwerkt",
    title: "Ledger bijgewerkt",
    message: `De groep ziet de miss. De fee wordt ${destinationLabel()} en wordt niet cash uitgekeerd aan een winnaar.`,
  });
}

async function chargeMissFeeBackend() {
  if (!state.apiBase) {
    showSheet({
      label: "Backend",
      title: "Geen API base ingesteld",
      message: "Zet in onboarding een API base om `/api/payments/miss-fee` te testen. Zonder backend blijft de ledger demo-only.",
    });
    return;
  }

  try {
    const customerId =
      state.stripeCustomerId ||
      document.querySelector("#stripe-customer-id")?.value?.trim() ||
      "cus_demo";
    const paymentMethodId =
      state.stripePaymentMethodId ||
      document.querySelector("#stripe-payment-method-id")?.value?.trim() ||
      "pm_demo";
    const response = await api.post("/api/payments/miss-fee", {
      stripe_customer_id: customerId,
      payment_method_id: paymentMethodId,
      user_id: state.user.id,
      group_id: state.group.id,
      amount_cents: 1000,
      reason: "missed_live_checks",
    });
    const mode = response?.mode || "demo";
    const status = response?.status || response?.ledger_status || "ok";
    const entry = upsertLedgerEntryLocal({
      groupId: state.group.id,
      kind: "miss_fee",
      userId: state.user.id,
      displayName: state.user.name || "Jij",
      amountCents: 1000,
      currency: "eur",
      status: mode === "stripe" ? String(status || "charged") : "simulated",
      paymentIntentId: response?.payment_intent_id || "",
      description: `Miss fee charge (${mode})`,
      createdAt: new Date().toISOString(),
    });
    if (entry) appendLedgerToPersistence(entry, { silent: true });
    syncLedgerUI();

    showSheet({
      label: "Backend",
      title: "Miss fee endpoint aangeroepen",
      message: `Mode: ${response?.mode || "demo"}. Status: ${response?.status || response?.ledger_status || "ok"}.`,
    });
  } catch {
    showSheet({
      label: "Backend",
      title: "Charge failed",
      message: "Backend endpoint is niet bereikbaar of gaf een error. UI blijft veilig in demo mode.",
    });
  }
}

async function settleTodaysMisses() {
  const button = document.querySelector("#settle-day");
  if (button instanceof HTMLButtonElement) {
    button.disabled = true;
    button.textContent = "Verwerken...";
  }

  try {
    const roster = currentGroupMembers();
    const misses = roster.filter((member) => member.userId && member.checksCompleted < exercises.length);
    if (!misses.length) {
      showSheet({
        label: "Ledger",
        title: "Geen misses vandaag",
        message: "Iedereen staat op 4/4. Niets te verwerken.",
      });
      return;
    }

    if (state.apiBase) await syncLedgerFromBackend({ silent: true });

    let processed = 0;
    for (const member of misses) {
      let profile = null;
      if (state.apiBase) {
        try {
          const payload = await api.get(`/api/profiles/${encodeURIComponent(member.userId)}`);
          profile = payload?.profile || payload;
        } catch {
          profile = null;
        }
      }

      const stripeCustomerId = String(profile?.stripe_customer_id || profile?.stripeCustomerId || "").trim();
      const stripePaymentMethodId = String(profile?.stripe_payment_method_id || profile?.stripePaymentMethodId || "").trim();
      const displayName = member.userId === state.user.id ? "Jij" : member.displayName;
      const description = `${displayName} miss ${member.checksCompleted}/${exercises.length} · ${destinationLabel()}`;

      if (!state.apiBase || !stripeCustomerId || !stripePaymentMethodId) {
        const entry = upsertLedgerEntryLocal({
          groupId: state.group.id,
          kind: "miss_fee",
          userId: member.userId,
          displayName,
          amountCents: 1000,
          currency: "eur",
          status: state.apiBase ? "needs_setup" : "simulated",
          description,
          createdAt: new Date().toISOString(),
        });
        if (entry) await appendLedgerToPersistence(entry, { silent: true });
        processed += 1;
        continue;
      }

      let charge = null;
      try {
        charge = await api.post("/api/payments/miss-fee", {
          stripe_customer_id: stripeCustomerId,
          payment_method_id: stripePaymentMethodId,
          user_id: member.userId,
          group_id: state.group.id,
          amount_cents: 1000,
          reason: "missed_live_checks",
        });
      } catch {
        charge = null;
      }

      const mode = charge?.mode || "demo";
      const status = charge?.status || charge?.ledger_status || (mode === "stripe" ? "charged" : "simulated");
      const entry = upsertLedgerEntryLocal({
        groupId: state.group.id,
        kind: "miss_fee",
        userId: member.userId,
        displayName,
        amountCents: 1000,
        currency: "eur",
        status: mode === "stripe" ? String(status || "charged") : "simulated",
        paymentIntentId: charge?.payment_intent_id || "",
        description,
        createdAt: new Date().toISOString(),
      });
      if (entry) await appendLedgerToPersistence(entry, { silent: true });
      processed += 1;
    }

    syncLedgerUI();
    showSheet({
      label: "Ledger",
      title: "Misses verwerkt",
      message: `Verwerkt: ${processed}. Backend charges draaien alleen als customer + payment method bekend zijn.`,
    });
  } finally {
    if (button instanceof HTMLButtonElement) {
      button.disabled = false;
      button.textContent = "Verwerk misses";
    }
  }
}

async function saveGroupToBackend(group, { silent = true } = {}) {
  if (!state.apiBase) return false;
  const normalized = group?.id ? group : null;
  if (!normalized) return false;
  try {
    await api.post("/api/groups", {
      group_id: normalized.id,
      name: normalized.name,
      deadline: normalized.deadline,
      fee_label: normalized.feeLabel,
      destination_label: normalized.destinationLabel,
      join_code: normalized.joinCode || "",
    });
    state.lastBackendGroupSaveAt = Date.now();
    persistCoreState();
    syncGroupSyncPill();
    return true;
  } catch {
    if (!silent) {
      showSheet({
        label: "Backend",
        title: "Group save failed",
        message: "Backend endpoint is niet bereikbaar of gaf een error. Local storage blijft leidend.",
      });
    }
    return false;
  }
}

async function saveGroupToPersistence(group, { silent = true } = {}) {
  const supa = await upsertGroupToSupabase(group, { silent: true });
  const backend = await saveGroupToBackend(group, { silent: true });
  if (!silent && !(supa || backend)) {
    showSheet({
      label: "Sync",
      title: "Geen persistence actief",
      message: "Zet Supabase (auth) of een API base aan om groups te syncen. Local storage blijft leidend.",
    });
  }
  return supa || backend;
}

async function upsertGroupToSupabase(group, { silent = true } = {}) {
  const normalized = group?.id ? group : null;
  if (!normalized) return false;
  if (!supabaseConfigured()) return false;
  const session = await refreshSupabaseSession({ silent: true });
  if (!session) return false;
  try {
    const client = await getSupabaseClient();
    if (!client) return false;
    const payload = {
      id: normalized.id,
      name: normalized.name,
      deadline: normalized.deadline,
      fee_label: normalized.feeLabel,
      destination_label: normalized.destinationLabel,
      join_code: normalized.joinCode || "",
      owner_user_id: state.user.id,
    };
    const { error } = await client.from("groups").upsert(payload, { onConflict: "id" });
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn("supabase_group_upsert_failed", error);
    if (!silent) {
      showSheet({
        label: "Supabase",
        title: "Group sync mislukt",
        message: "Supabase write faalde. Check RLS policies en of je ingelogd bent.",
      });
    }
    return false;
  }
}

function setGroupBackendStatus(message = "") {
  const status = document.querySelector("#group-backend-status");
  if (!(status instanceof HTMLElement)) return;
  status.textContent = message;
}

function syncGroupBackendButtonState() {
  const button = document.querySelector("#sync-group-backend");
  if (!(button instanceof HTMLButtonElement)) return;
  const hasApi = Boolean(state.apiBase);
  button.disabled = !hasApi;
  button.setAttribute(
    "aria-label",
    hasApi ? "Sync groep en leden naar backend" : "Sync naar backend (zet eerst een API base in onboarding)",
  );
  if (!hasApi) setGroupBackendStatus("Zet een API base in onboarding om te syncen.");
}

async function pushCurrentGroupToBackend({ silent = false } = {}) {
  const groupId = String(state.group?.id || "").trim();
  if (!groupId) return { groupUploaded: false, membersUploaded: 0 };
  if (!state.apiBase) {
    if (!silent) {
      showSheet({
        label: "Sync",
        title: "Geen API base ingesteld",
        message: "Zet in onboarding een backend URL om te syncen.",
      });
    }
    return { groupUploaded: false, membersUploaded: 0 };
  }

  const group = state.groups?.[groupId] ? { ...state.groups[groupId], id: groupId } : { ...state.group, id: groupId };
  const groupUploaded = await saveGroupToPersistence(group, { silent: true });
  if (groupUploaded) await ensureInviteCodeFromBackend(groupId, { silent: true });

  const members = buildMembersBulkPayloadForGroup(groupId);
  let membersUploaded = 0;
  if (members.length) {
    try {
      const payload = await api.post("/api/members/bulk", { group_id: groupId, members });
      membersUploaded = Number(payload?.upserted || 0) || members.length;
    } catch {
      for (const member of members) {
        const ok = await upsertMemberToPersistence(
          {
            groupId,
            userId: member.user_id,
            displayName: member.display_name,
            initial: member.initial,
          },
          { silent: true },
        );
        if (ok) membersUploaded += 1;
      }
    }
  }

  state.lastBackendSyncAt = Date.now();
  persistCoreState();
  syncGroupSyncPill();

  if (!silent) {
    showSheet({
      label: "Sync",
      title: "Groep gesynct",
      message: `Group: ${groupUploaded ? "ok" : "failed"}. Members uploaded: ${membersUploaded}.`,
    });
  }
  return { groupUploaded, membersUploaded };
}

async function syncCurrentGroupToBackend() {
  const button = document.querySelector("#sync-group-backend");
  if (button instanceof HTMLButtonElement) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "Syncing…";
  }
  setGroupBackendStatus("Sync bezig…");
  try {
    await pushCurrentGroupToBackend({ silent: true });
    setGroupBackendStatus("Backend sync ok.");
  } catch {
    setGroupBackendStatus("Backend sync failed (zie console).");
  } finally {
    if (button instanceof HTMLButtonElement) {
      button.disabled = !state.apiBase;
      button.removeAttribute("aria-busy");
      button.textContent = "Sync naar backend";
    }
  }
}

async function ensureInviteCodeFromBackend(groupId, { silent = true } = {}) {
  if (!state.apiBase) return "";
  const id = String(groupId || "").trim();
  if (!id) return "";
  try {
    const current = state.groups?.[id] || (state.group?.id === id ? state.group : null);
    const requestedCode = String(current?.joinCode || current?.join_code || "").trim();
    const payload = await api.post("/api/invites", { group_id: id, requested_code: requestedCode });
    const joinCode = String(payload?.join_code || "").trim();
    if (!joinCode) return "";
    state.groups[id] = { ...(state.groups[id] || {}), joinCode };
    if (state.group?.id === id) state.group = { ...state.group, joinCode };
    persistCoreState();
    syncInviteLinkUI();
    return joinCode;
  } catch {
    if (!silent) {
      showSheet({
        label: "Invite",
        title: "Invite code maken mislukt",
        message: "Backend endpoint faalde of CORS blokkeert `/api/invites`. Invite link blijft werken met group id.",
      });
    }
    return "";
  }
}

async function syncGroupsFromBackend({ silent = false } = {}) {
  if (!state.apiBase) {
    if (silent) return;
    showSheet({
      label: "Sync",
      title: "Geen API base ingesteld",
      message: "Zet een backend URL in onboarding om groups te syncen met `/api/groups`.",
    });
    return 0;
  }

  try {
    const payload = await api.get("/api/groups");
    const groups = Array.isArray(payload?.groups) ? payload.groups : [];
    const next = groups.map(normalizeBackendGroup).filter(Boolean);
    next.forEach(upsertGroup);

    if (!state.activeGroupId || !state.groups[state.activeGroupId]) {
      const first = next[0]?.id;
      if (first) state.activeGroupId = first;
    }
    if (state.activeGroupId && state.groups[state.activeGroupId]) {
      state.group = { ...state.group, ...state.groups[state.activeGroupId], id: state.activeGroupId };
    }

    state.lastBackendSyncAt = Date.now();
    persistCoreState();
    syncGroupUI();
    syncGroupSyncPill();
    updateInvitePreview();
    updateHome();
    updateCamera();

    if (!silent) {
      showSheet({
        label: "Sync",
        title: "Groups gesynct",
        message: `Backend groups geladen: ${next.length}.`,
      });
    }
    return next.length;
  } catch {
    setGroupSyncStatus("bad", "Error");
    if (!silent) {
      showSheet({
        label: "Sync",
        title: "Sync mislukt",
        message: "Backend niet bereikbaar of CORS blokkeert `/api/groups`. Local storage blijft leidend.",
      });
    }
    return 0;
  }
}

async function pushLocalGroupsToBackend({ silent = false } = {}) {
  if (!state.apiBase) {
    if (silent) return { uploaded: 0, failed: 0 };
    showSheet({
      label: "Sync",
      title: "Geen API base ingesteld",
      message: "Zet in onboarding een backend URL om local groups te uploaden naar `/api/groups`.",
    });
    return { uploaded: 0, failed: 0 };
  }

  const groups = sortedGroups();
  if (!groups.length) return { uploaded: 0, failed: 0 };

  try {
    const payload = await api.post("/api/groups/bulk", {
      groups: groups.map((group) => ({
        group_id: group.id,
        name: group.name,
        deadline: group.deadline,
        fee_label: group.feeLabel,
        destination_label: group.destinationLabel,
        join_code: group.joinCode || "",
      })),
    });
    const uploaded = Number(payload?.upserted || 0) || groups.length;
    for (const group of groups) {
      const hasJoinCode = Boolean(String(group?.joinCode || group?.join_code || "").trim());
      if (!hasJoinCode) await ensureInviteCodeFromBackend(group.id, { silent: true });
    }
    state.lastBackendSyncAt = Date.now();
    persistCoreState();
    syncGroupSyncPill();
    if (!silent) {
      showSheet({
        label: "Sync",
        title: "Local groups geüpload",
        message: `Uploaded ${uploaded}. Failed 0.`,
      });
    }
    return { uploaded, failed: 0 };
  } catch {
    // Older backend; fall back to per-group writes.
  }

  let uploaded = 0;
  let failed = 0;
  for (const group of groups) {
    // best-effort; any failures remain local-only
    const ok = await saveGroupToPersistence(group, { silent: true });
    if (ok) {
      uploaded += 1;
      const hasJoinCode = Boolean(String(group?.joinCode || group?.join_code || "").trim());
      if (!hasJoinCode) await ensureInviteCodeFromBackend(group.id, { silent: true });
    } else {
      failed += 1;
    }
  }

  if (!silent) {
    showSheet({
      label: "Sync",
      title: "Local groups geüpload",
      message: `Uploaded ${uploaded}. Failed ${failed}.`,
    });
  }

  return { uploaded, failed };
}

function buildMembersBulkPayloadForGroup(groupId) {
  const bucket = state.membersByGroup?.[groupId];
  if (!bucket || typeof bucket !== "object") return [];
  return Object.values(bucket)
    .map(normalizeMember)
    .filter(Boolean)
    .map((member) => ({
      group_id: groupId,
      user_id: member.userId,
      display_name: member.displayName,
      initial: member.initial,
    }));
}

async function pushLocalMembersToBackend({ silent = false } = {}) {
  if (!state.apiBase) {
    if (silent) return { uploaded: 0, failed: 0 };
    showSheet({
      label: "Sync",
      title: "Geen API base ingesteld",
      message: "Zet in onboarding een backend URL om leden te uploaden.",
    });
    return { uploaded: 0, failed: 0 };
  }

  const groups = sortedGroups();
  if (!groups.length) return { uploaded: 0, failed: 0 };

  let uploaded = 0;
  let failed = 0;
  for (const group of groups) {
    const groupId = String(group?.id || "").trim();
    if (!groupId) continue;
    const members = buildMembersBulkPayloadForGroup(groupId);
    if (!members.length) continue;

    try {
      const payload = await api.post("/api/members/bulk", { group_id: groupId, members });
      uploaded += Number(payload?.upserted || 0) || members.length;
    } catch {
      // Older backend: fall back to per-member writes.
      for (const member of members) {
        const ok = await upsertMemberToPersistence(
          {
            groupId: groupId,
            userId: member.user_id,
            displayName: member.display_name,
            initial: member.initial,
          },
          { silent: true },
        );
        if (ok) uploaded += 1;
        else failed += 1;
      }
    }
  }

  if (!silent) {
    showSheet({
      label: "Sync",
      title: "Leden geüpload",
      message: `Uploaded ${uploaded}. Failed ${failed}.`,
    });
  }

  state.lastBackendSyncAt = Date.now();
  persistCoreState();
  syncGroupSyncPill();
  return { uploaded, failed };
}

async function pushLocalLedgerToBackend({ silent = true } = {}) {
  if (!state.apiBase) return { uploaded: 0, failed: 0 };
  const groups = sortedGroups();
  if (!groups.length) return { uploaded: 0, failed: 0 };

  let uploaded = 0;
  let failed = 0;

  for (const group of groups) {
    const groupId = String(group?.id || "").trim();
    if (!groupId) continue;
    const entries = ledgerEntriesForGroup(groupId);
    for (const entry of entries) {
      const saved = await appendLedgerToPersistence(entry, { silent: true });
      if (saved) uploaded += 1;
      else failed += 1;
    }
  }

  if (!silent) {
    showSheet({
      label: "Ledger",
      title: "Ledger gesynct",
      message: `Uploaded ${uploaded}. Failed ${failed}.`,
    });
  }

  return { uploaded, failed };
}

function normalizeImportedGroup(raw) {
  if (!raw) return null;
  const id = String(raw.id || raw.group_id || "").trim();
  if (!id) return null;
  const name = String(raw.name || "Nieuwe groep").trim() || "Nieuwe groep";
  const deadline = String(raw.deadline || "22:00").trim() || "22:00";
  const feeLabel = String(raw.feeLabel || raw.fee_label || "EUR 10").trim() || "EUR 10";
  const destinationLabel = String(raw.destinationLabel || raw.destination_label || "Platform fee, geen cash-out").trim()
    || "Platform fee, geen cash-out";
  const joinCode = String(raw.joinCode || raw.join_code || "").trim();
  return { id, name, deadline, feeLabel, destinationLabel, joinCode };
}

function buildGroupsExportPayload() {
  return {
    version: 1,
    kind: "pressure_groups_export",
    exportedAt: new Date().toISOString(),
    user: {
      id: state.user.id,
      name: state.user.name,
      email: state.user.email,
      initial: state.user.initial,
    },
    activeGroupId: state.activeGroupId,
    groups: sortedGroups().map((group) => ({
      id: group.id,
      name: group.name,
      deadline: group.deadline,
      feeLabel: group.feeLabel,
      destinationLabel: group.destinationLabel,
      joinCode: group.joinCode || "",
    })),
  };
}

function downloadJsonFile(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportGroupsJson() {
  const payload = buildGroupsExportPayload();
  const today = new Date().toISOString().slice(0, 10);
  downloadJsonFile(payload, `pressure-groups-${today}.json`);
  showSheet({
    label: "Backup",
    title: "Export klaar",
    message: `Je export bevat ${payload.groups.length} groepen.`,
  });
}

async function importGroupsJsonFromFile(file) {
  const text = await file.text();
  const raw = JSON.parse(text);

  const importedGroups = Array.isArray(raw?.groups) ? raw.groups : raw?.groups && typeof raw.groups === "object" ? Object.values(raw.groups) : [];
  const normalized = importedGroups.map(normalizeImportedGroup).filter(Boolean);

  let imported = 0;
  for (const group of normalized) {
    upsertGroup(group);
    imported += 1;
  }

  const nextActive = String(raw?.activeGroupId || "").trim();
  if (nextActive && state.groups[nextActive]) {
    state.activeGroupId = nextActive;
    state.group = { ...state.group, ...state.groups[nextActive], id: nextActive };
  } else if (!state.activeGroupId && normalized[0]?.id) {
    state.activeGroupId = normalized[0].id;
    state.group = { ...state.group, ...state.groups[state.activeGroupId], id: state.activeGroupId };
  }

  persistCoreState();
  renderGroupSelector();
  syncGroupUI();
  syncGroupSyncPill();
  updateInvitePreview();
  updateHome();
  updateCamera();

  if (state.apiBase) pushLocalGroupsToBackend({ silent: true });

  showSheet({
    label: "Backup",
    title: "Import afgerond",
    message: imported ? `Geïmporteerd: ${imported}.` : "Geen geldige groepen gevonden in dit bestand.",
  });
}

function updateInvitePreview() {
  const name = document.querySelector("#group-name-input")?.value || state.group.name || "Nieuwe groep";
  const deadline = document.querySelector("#deadline-input")?.value || state.group.deadline || "22:00";
  const fee = document.querySelector("#fee-input")?.value || state.group.feeLabel || "EUR 10";
  const destination = document.querySelector("#destination-input")?.value || state.group.destinationLabel || "Platform fee, geen cash-out";

  setText("#invite-preview-title", name);
  setText("#invite-preview-copy", `Daily 4/4 live checks. Deadline ${deadline}. Fee ${fee} als ${destination.toLowerCase()}.`);
  syncInviteLinkUI();
}

document.querySelector("#open-camera").addEventListener("click", openCamera);
document.querySelector("#open-camera-secondary").addEventListener("click", openCamera);
document.querySelector("#current-exercise-row").addEventListener("click", openCamera);
document.querySelector("#nav-verify").addEventListener("click", openCamera);
document.querySelector("#simulate-verify").addEventListener("click", acceptCurrentExercise);
document.querySelector("#switch-exercise").addEventListener("click", scanAgain);

document.querySelector("#back-home").addEventListener("click", () => showScreen("home"));
document.querySelector("#group-back").addEventListener("click", () => showScreen("home"));
document.querySelector("#close-rank").addEventListener("click", () => showScreen("home"));
document.querySelector("#profile-back").addEventListener("click", () => showScreen("home"));
document.querySelector("#success-home").addEventListener("click", () => showScreen("home"));
document.querySelector("#success-back").addEventListener("click", () => showScreen("home"));
document.querySelector("#success-rank").addEventListener("click", () => showScreen("rank"));

document.querySelector("#home-group-action").addEventListener("click", () => showScreen("group"));
document.querySelector("#home-rank-action").addEventListener("click", () => showScreen("rank"));
document.querySelector("#home-penalty-action").addEventListener("click", () => {
  showSheet({
    label: "Regels",
    title: "Mis je, dan ziet de groep het",
    message: "Bij minder dan 4 live checks voor 22:00 geldt EUR 10 platform fee. Geen pot, wallet of cash-out in de beta.",
    primary: "Open betaalmodel",
    onPrimary: () => showScreen("billing"),
  });
});

document.querySelector("#menu-button").addEventListener("click", () => {
  showSheet({
    label: "Menu",
    title: "Maak of beheer je groep",
    message: "De beta heeft nu werkende schermen voor vandaag, groep, check, rank, profiel en betaalmodel.",
    primary: "Maak groep",
    onPrimary: () => {
      const toggle = document.querySelector("#create-new-toggle");
      if (toggle) toggle.checked = true;
      syncCreateScreenUI();
      showScreen("create");
      document.querySelector("#group-name-input")?.focus();
    },
  });
});

document.querySelector("#notifications-button").addEventListener("click", () => {
  showSheet({
    label: "Meldingen",
    title: "Timothy is bijna te laat",
    message: "42 minuten tot commitment fee. In productie wordt dit een push-notification naar de groep.",
    primary: "Open groep",
    onPrimary: () => showScreen("group"),
  });
});

document.querySelector("#invite-button").addEventListener("click", async () => {
  const invite = buildJoinInviteLink({ groupId: state.group.id, apiBase: state.apiBase });
  try {
    await navigator.clipboard?.writeText(invite);
  } catch {
    // Clipboard is optional in some preview contexts.
  }
  showSheet({
    label: "Invite",
    title: "Invite link gekopieerd",
    message: `Group code: ${state.group.id}\n\n${invite}`,
  });
});

document.querySelector("#send-reminder").addEventListener("click", () => {
  addFeedItem("Reminder verstuurd", "Timothy en Layo krijgen een push", "");
  showSheet({
    label: "Reminder",
    title: "Groep krijgt een push",
    message: "Iedereen die nog niet klaar is krijgt: 'Je hebt nog checks open. Breek de chain niet.'",
  });
});

document.querySelector("#sync-group-backend")?.addEventListener("click", () => {
  syncCurrentGroupToBackend();
});

document.querySelector("#edit-rules").addEventListener("click", () => {
  showSheet({
    label: "Regels",
    title: "Daily check-in, 4 oefeningen",
    message:
      "Deadline 22:00. Platform fee EUR 10 bij minder dan 4/4. Winnaars krijgen rank en perks, geen cashprijs.",
    primary: "Open betaalmodel",
    onPrimary: () => showScreen("billing"),
  });
});

document.querySelector("#rank-info").addEventListener("click", () => {
  showSheet({
    label: "Rank",
    title: "Punten zijn simpel",
    message: "+4 per verified workout. -10 bij miss. Alleen volledige 4/4 workouts tellen mee.",
  });
});

document.querySelector("#settings-button").addEventListener("click", () => {
  showSheet({
    label: "Instellingen",
    title: "Beheer je setup",
    message: "Wijzig je naam, groep, backend API en betaalmodel. Reset kan altijd terug naar demo.",
    primary: "Wijzig setup",
    secondary: "Reset demo",
    onPrimary: () => enterOnboarding({ mode: "edit", returnTo: "profile" }),
    onSecondary: () => {
      resetToDemo();
      showScreen("home");
    },
  });
});

document.querySelector("#payment-button").addEventListener("click", () => {
  showScreen("billing");
});

document.querySelector("#profile-open-onboarding")?.addEventListener("click", () => {
  enterOnboarding({ mode: "edit", returnTo: "profile" });
});

document.querySelector("#profile-api-test")?.addEventListener("click", async () => {
  const field = document.querySelector("#profile-api-base");
  const base = normalizeApiBase(field?.value || "");

  if (!base) {
    state.apiBase = "";
    localStorage.removeItem(API_BASE_KEY);
    persistCoreState();
    syncProfileBackendCard();
    showSheet({ label: "Backend", title: "API base leeg", message: "Zonder backend blijft alles local-only." });
    return;
  }

  state.apiBase = base;
  localStorage.setItem(API_BASE_KEY, base);
  persistCoreState();
  syncProfileBackendCard();
  setProfileApiStatus("neutral", "Test...");

  await testApiConnection(base, { silent: true });
  await checkStripeHealth({ silent: true });

  syncProfileBackendCard();
  showSheet({
    label: "Backend",
    title: "Backend gecheckt",
    message: "Health checks uitgevoerd. Zie status pills in onboarding/billing.",
  });
});

document.querySelector("#profile-api-sync")?.addEventListener("click", async () => {
  if (!state.apiBase) {
    showSheet({
      label: "Sync",
      title: "Geen API base ingesteld",
      message: "Vul eerst een backend URL in (bijv. http://localhost:8001).",
    });
    return;
  }
  setProfileApiStatus("neutral", "Sync...");
  await bootstrapBackendSync();
  syncProfileBackendCard();
  showSheet({
    label: "Sync",
    title: "Backend sync klaar",
    message: "Groups, leden, check-ins en ledger zijn geüpdatet (best-effort).",
  });
});

document.querySelector("#billing-back").addEventListener("click", () => showScreen("profile"));
document.querySelector("#billing-help").addEventListener("click", () => {
  showSheet({
    label: "Betaalmodel",
    title: "Waarom geen cashpot?",
    message:
      "Cashprijzen kunnen gambling/payment review triggeren. Daarom start de beta met abonnement, platform fee en transparante ledger zonder cash-out.",
  });
});
document.querySelector("#billing-sync-stripe")?.addEventListener("click", () => syncStripeIdsFromEmail());
document.querySelector("#billing-check-stripe")?.addEventListener("click", () => checkStripeHealth());
document.querySelector("#setup-payment").addEventListener("click", setupPaymentPermission);
document.querySelector("#setup-mandate")?.addEventListener("click", setupMandate);
document.querySelector("#billing-open-portal")?.addEventListener("click", openCustomerPortal);
document.querySelector("#simulate-miss-fee").addEventListener("click", simulateMissFee);
document.querySelector("#charge-miss-fee")?.addEventListener("click", chargeMissFeeBackend);
document.querySelector("#settle-day")?.addEventListener("click", settleTodaysMisses);

document.querySelector("#stripe-customer-id")?.addEventListener("input", (event) => {
  state.stripeCustomerId = event.target.value.trim();
  persistCoreState();
  syncPaymentModel();
  if (state.apiBase) scheduleProfileSave();
});
document.querySelector("#stripe-payment-method-id")?.addEventListener("input", (event) => {
  state.stripePaymentMethodId = event.target.value.trim();
  state.paymentMandateSetup = Boolean(state.stripePaymentMethodId);
  persistCoreState();
  syncPaymentModel();
  if (state.apiBase) scheduleProfileSave();
});

document.querySelectorAll(".model-option").forEach((button) => {
  button.addEventListener("click", () => chooseFeeDestination(button.dataset.model));
});

document.querySelector("#create-back").addEventListener("click", () => showScreen("home"));
document.querySelector("#create-help").addEventListener("click", () => {
  showSheet({
    label: "Groep maken",
    title: "Hou setup super simpel",
    message: "Voor de beta: 3-10 leden, 4 live checks, deadline, fee bestemming. Meer opties komen later.",
  });
});
document.querySelector("#create-group-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.querySelector("#group-name-input").value.trim() || "Nieuwe groep";
  const deadline = document.querySelector("#deadline-input")?.value || "22:00";
  const feeLabel = document.querySelector("#fee-input")?.value || "EUR 10";
  const destinationLabel = document.querySelector("#destination-input")?.value || "Platform fee, geen cash-out";
  const createNew = Boolean(document.querySelector("#create-new-toggle")?.checked);

  if (createNew) {
    const nextId = state.createDraftGroupId || newId("group");
    const joinCode = state.apiBase ? "" : state.createDraftJoinCode || localJoinCodeFromGroupId(nextId);
    state.group = { ...state.group, id: nextId, joinCode };
    state.activeGroupId = state.group.id;
    state.createDraftGroupId = "";
    state.createDraftJoinCode = "";
    state.createDraftHydrated = false;
    clearCreateDraft();
  }

  state.group = {
    ...state.group,
    name,
    deadline,
    feeLabel,
    destinationLabel,
  };
  if (!state.apiBase && !String(state.group.joinCode || "").trim()) {
    state.group.joinCode = localJoinCodeFromGroupId(state.group.id);
  }
  upsertGroup(state.group);
  ensureSelfMemberLocal();
  syncGroupUI();
  persistCoreState();

  if (state.apiBase) {
    await saveGroupToBackend(state.group, { silent: true });
    await ensureInviteCodeFromBackend(state.group.id, { silent: true });
    syncInviteLinkUI();
    updateInvitePreview();
    await upsertMemberToBackend(
      {
        groupId: state.group.id,
        userId: state.user.id,
        displayName: state.user.name || "Jij",
        initial: state.user.initial || "Y",
      },
      { silent: true },
    );
    await syncMembersFromBackend({ silent: true });
  }
  syncGroupSyncPill();

  showSheet({
    label: "Groep live",
    title: `${name} is ${createNew ? "aangemaakt" : "opgeslagen"}`,
    message: state.apiBase
      ? "Invite link, regels en betaalmodel staan klaar. Backend save is best-effort."
      : "Invite link, regels en betaalmodel staan klaar. Koppel later een backend voor sync.",
    primary: "Open groep",
    onPrimary: () => showScreen("group"),
  });
});

document.querySelector("#create-delete-group")?.addEventListener("click", () => {
  const groupId = state.group?.id;
  const groupName = state.group?.name || "Deze groep";
  showSheet({
    label: "Groep verwijderen",
    title: `Verwijder ${groupName}?`,
    message:
      "Dit verwijdert de groep uit local storage. Als je een backend hebt gekoppeld proberen we ook `/api/groups/:id` te verwijderen (members, checkins, invites, ledger).",
    primary: "Verwijder",
    secondary: "Annuleer",
    danger: true,
    onPrimary: async () => {
      deleteGroupLocal(groupId);
      await deleteGroupFromBackend(groupId, { silent: true });
      showScreen("home");
      showSheet({
        label: "Verwijderd",
        title: "Groep verwijderd",
        message: state.apiBase ? "Lokaal verwijderd + backend delete best-effort." : "Lokaal verwijderd.",
      });
    },
  });
});

document.querySelector("#invite-link-copy")?.addEventListener("click", copyCurrentInviteLink);
document.querySelector("#group-invite-copy")?.addEventListener("click", copyCurrentInviteLink);
document.querySelectorAll("#invite-link-input, #group-invite-link-input").forEach((input) => {
  input.addEventListener("click", () => {
    if (input instanceof HTMLInputElement) input.select();
  });
});

document.querySelector("#export-groups")?.addEventListener("click", exportGroupsJson);
document.querySelector("#import-groups")?.addEventListener("click", () => {
  const input = document.querySelector("#import-groups-file");
  if (input instanceof HTMLInputElement) input.click();
});
document.querySelector("#import-groups-file")?.addEventListener("change", async (event) => {
  const input = event.target;
  const file = input?.files?.[0];
  if (!file) return;
  try {
    await importGroupsJsonFromFile(file);
  } catch {
    showSheet({
      label: "Backup",
      title: "Import mislukt",
      message: "Dit bestand is geen geldige Pressure export JSON.",
    });
  } finally {
    if (input instanceof HTMLInputElement) input.value = "";
  }
});

document.querySelector("#group-selector-new")?.addEventListener("click", () => {
  const toggle = document.querySelector("#create-new-toggle");
  if (toggle) toggle.checked = true;
  syncCreateScreenUI();
  showScreen("create");
  document.querySelector("#group-name-input")?.focus();
});

document.querySelector("#member-add-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.querySelector("#member-add-name");
  const submit = document.querySelector("#member-add-submit");
  const name = input?.value?.trim?.() || "";
  if (!name) {
    input?.focus?.();
    return;
  }
  const userId = newId("user");
  const member = {
    groupId: state.group.id,
    userId,
    displayName: name,
    initial: initialFromName(name),
  };

  if (submit instanceof HTMLButtonElement) {
    submit.disabled = true;
    submit.textContent = "Opslaan...";
  }

  try {
    upsertMemberLocal(member);
    upsertGroup({ ...state.group, membersCount: currentGroupMembers().length });
    persistCoreState();
    syncGroupUI();
    renderMemberList([]);

    if (state.apiBase) {
      await upsertMemberToBackend(member, { silent: true });
      await syncMembersFromBackend({ silent: true });
    }

    if (input instanceof HTMLInputElement) input.value = "";
    showSheet({
      label: "Lid",
      title: "Lid toegevoegd",
      message: state.apiBase ? "Opgeslagen + naar backend gesynct." : "Opgeslagen in local storage.",
    });
  } catch {
    showSheet({
      label: "Lid",
      title: "Toevoegen mislukt",
      message: "Local save ging goed, maar backend sync faalde. Check API base + CORS.",
    });
  } finally {
    if (submit instanceof HTMLButtonElement) {
      submit.disabled = false;
      submit.textContent = "Toevoegen";
    }
  }
});

document.querySelector("#group-edit-current")?.addEventListener("click", () => {
  const toggle = document.querySelector("#create-new-toggle");
  if (toggle) toggle.checked = false;
  syncCreateScreenUI();
  showScreen("create");
  document.querySelector("#group-name-input")?.focus();
});
document.querySelector("#group-sync")?.addEventListener("click", async () => {
  const pushed = await pushLocalGroupsToBackend({ silent: true });
  const pulled = await syncGroupsFromBackend({ silent: true });
  await syncMembersFromBackend({ silent: true });
  await syncCheckinsFromBackend({ silent: true });
  showSheet({
    label: "Sync",
    title: "Sync afgerond",
    message: state.apiBase
      ? `Uploaded ${pushed.uploaded} (${pushed.failed} failed). Loaded ${pulled} backend groups.`
      : "Geen API base ingesteld. Local groups blijven leidend.",
  });
});

document.querySelectorAll("#group-name-input, #deadline-input, #fee-input, #destination-input").forEach((field) => {
  field.addEventListener("input", updateInvitePreview);
  field.addEventListener("change", updateInvitePreview);
});

let createDraftTimer = null;
function scheduleCreateDraftSave() {
  const creatingNew = Boolean(document.querySelector("#create-new-toggle")?.checked);
  if (!creatingNew) return;
  if (createDraftTimer) window.clearTimeout(createDraftTimer);
  createDraftTimer = window.setTimeout(() => {
    createDraftTimer = null;
    const name = document.querySelector("#group-name-input")?.value?.trim() || "";
    const deadline = document.querySelector("#deadline-input")?.value || "";
    const feeLabel = document.querySelector("#fee-input")?.value || "";
    const destinationLabel = document.querySelector("#destination-input")?.value || "";
    saveCreateDraft({ name, deadline, feeLabel, destinationLabel, savedAt: Date.now() });
  }, 300);
}

["#group-name-input", "#deadline-input", "#fee-input", "#destination-input"].forEach((selector) => {
  const field = document.querySelector(selector);
  if (!field) return;
  field.addEventListener("input", scheduleCreateDraftSave);
  field.addEventListener("change", scheduleCreateDraftSave);
});

document.querySelector("#create-new-toggle")?.addEventListener("change", () => {
  syncCreateScreenUI();
  updateInvitePreview();
});

document.querySelector("#pause-trace").addEventListener("click", () => {
  state.cameraPaused = !state.cameraPaused;
  setText("#camera-record-label", state.cameraPaused ? "Gepauzeerd" : "Live check");
  updateTraceGateUI();
  showSheet({
    label: state.cameraPaused ? "Pauze" : "Live",
    title: state.cameraPaused ? "Check staat gepauzeerd" : "Check is weer live",
    message: state.cameraPaused ? "De workout telt pas wanneer de live check weer actief is." : "De camera controle loopt weer door.",
  });
});

document.querySelector("#sheet-primary").addEventListener("click", () => {
  const action = state.sheetAction;
  closeSheet();
  if (action) action();
});
document.querySelector("#sheet-secondary").addEventListener("click", () => {
  const action = state.sheetSecondaryAction;
  closeSheet();
  if (action) action();
});
document.querySelector("#action-sheet").addEventListener("click", (event) => {
  if (event.target.id === "action-sheet") closeSheet();
});

document.addEventListener("keydown", (event) => {
  if (!isSheetOpen()) {
    if (event.key === "Escape") closeSheet();
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeSheet();
    return;
  }

  if (event.key !== "Tab") return;
  const sheet = document.querySelector("#action-sheet");
  const focusable = sheetFocusableElements(sheet);
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey) {
    if (active === first || !sheet.contains(active)) {
      event.preventDefault();
      last.focus();
    }
    return;
  }

  if (active === last) {
    event.preventDefault();
    first.focus();
  }
});

document.querySelector("#onboard-back")?.addEventListener("click", () => {
  showScreen(state.onboardingReturnTo || "home");
});

document.querySelector("#onboard-open-billing")?.addEventListener("click", () => {
  state.onboardingReturnTo = "onboard";
  showScreen("billing");
  const confirm = document.querySelector("#billing-confirm");
  if (confirm instanceof HTMLElement) confirm.focus();
});

document.querySelector("#test-api")?.addEventListener("click", () => {
  const base = document.querySelector("#onboard-api-base")?.value || "";
  testApiConnection(base);
});

document.querySelector("#onboard-sync-groups")?.addEventListener("click", async () => {
  const base = normalizeApiBase(document.querySelector("#onboard-api-base")?.value || "");
  if (base) {
    state.apiBase = base;
    localStorage.setItem(API_BASE_KEY, base);
  }
  await syncGroupsFromBackend({ silent: false });
});

document.querySelector("#onboard-upload-groups")?.addEventListener("click", async () => {
  const base = normalizeApiBase(document.querySelector("#onboard-api-base")?.value || "");
  if (base) {
    state.apiBase = base;
    localStorage.setItem(API_BASE_KEY, base);
  }
  await pushLocalGroupsToBackend({ silent: false });
});

document.querySelector("#onboard-sync-members")?.addEventListener("click", async () => {
  const base = normalizeApiBase(document.querySelector("#onboard-api-base")?.value || "");
  if (base) {
    state.apiBase = base;
    localStorage.setItem(API_BASE_KEY, base);
  }
  await syncMembersFromBackend({ silent: false });
});

document.querySelector("#onboard-upload-members")?.addEventListener("click", async () => {
  const base = normalizeApiBase(document.querySelector("#onboard-api-base")?.value || "");
  if (base) {
    state.apiBase = base;
    localStorage.setItem(API_BASE_KEY, base);
  }
  await pushLocalMembersToBackend({ silent: false });
});

document.querySelector("#onboard-group-mode-create")?.addEventListener("change", (event) => {
  if (event.target.checked) setOnboardingGroupMode("create");
});
document.querySelector("#onboard-group-mode-join")?.addEventListener("change", (event) => {
  if (event.target.checked) setOnboardingGroupMode("join");
});

function setOnboardingSubmitBusy(isBusy) {
  const form = document.querySelector("#onboard-form");
  const button = document.querySelector("#onboard-submit");
  const status = document.querySelector("#onboard-submit-status");
  if (form) form.setAttribute("aria-busy", isBusy ? "true" : "false");
  if (button instanceof HTMLButtonElement) button.disabled = Boolean(isBusy);
  if (status instanceof HTMLElement) status.textContent = isBusy ? "Even geduld… we slaan alles op." : "";
}

async function fetchBackendGroupByCode({ apiBase, groupCode }) {
  if (!apiBase) throw new Error("api_base_missing");
  if (!groupCode) throw new Error("group_code_missing");

  state.apiBase = apiBase;
  localStorage.setItem(API_BASE_KEY, apiBase);

  return api
    .get(`/api/invites/${encodeURIComponent(groupCode)}`)
    .then((payload) => payload?.group || payload)
    .catch(() => api.get(`/api/groups/${encodeURIComponent(groupCode)}`).then((payload) => payload?.group || payload));
}

async function previewJoinGroup() {
  let apiBase = normalizeApiBase(document.querySelector("#onboard-api-base")?.value || "");
  const codeField = document.querySelector("#onboard-group-code");
  let groupCode = codeField?.value?.trim() || "";
  const hydrated = hydrateOnboardingFromInviteText(groupCode);
  if (hydrated?.join) groupCode = hydrated.join;
  apiBase = normalizeApiBase(document.querySelector("#onboard-api-base")?.value || "");
  const invitePayload = hydrated?.groupPayload || state.inviteGroupPayload;

  if (!groupCode) {
    showSheet({
      label: "Join",
      title: "Vul een group code in",
      message: "Gebruik een invite code (`code_...`) of een group id (`group_...`).",
    });
    if (codeField instanceof HTMLElement) codeField.focus();
    return;
  }

  if (!apiBase) {
    if (invitePayload?.id) {
      showSheet({
        label: "Invite",
        title: "Group info uit invite",
        message: `${invitePayload.name || "Groep"} · Deadline ${invitePayload.deadline || "22:00"} · Fee ${
          invitePayload.feeLabel || "EUR 10"
        }. Backend is optioneel voor sync/billing.`,
        primary: "Gebruik deze group",
        onPrimary: () => {
          setOnboardingGroupMode("join", { focus: false });
          if (codeField instanceof HTMLElement) codeField.focus();
        },
      });
      return;
    }
    showSheet({
      label: "Join",
      title: "Backend API ontbreekt",
      message:
        "Zonder backend kun je alleen joinen via een invite link met group info. Zet anders een API base (bijv. http://localhost:8001) om `/api/groups/{id}` op te halen.",
    });
    return;
  }

  state.apiBase = apiBase;
  localStorage.setItem(API_BASE_KEY, apiBase);

  try {
    const payload = await fetchBackendGroupByCode({ apiBase, groupCode });
    const group = normalizeBackendGroup(payload);
    if (!group) throw new Error("group_invalid");

    showSheet({
      label: "Join",
      title: "Group gevonden",
      message: `${group.name} · Deadline ${group.deadline} · Fee ${group.feeLabel}`,
      primary: "Gebruik deze group",
      onPrimary: () => {
        setOnboardingGroupMode("join", { focus: false });
        const code = document.querySelector("#onboard-group-code");
        if (code) code.value = group.joinCode || group.id;
      },
    });
  } catch {
    showSheet({
      label: "Join",
      title: "Group niet gevonden",
      message: "Controleer of je invite code / group id klopt en of je backend draait met CORS aan.",
    });
  }
}

document.querySelector("#onboard-preview-group")?.addEventListener("click", previewJoinGroup);

document.querySelector("#onboard-supabase-login")?.addEventListener("click", async () => {
  const url = normalizeSupabaseUrl(document.querySelector("#onboard-supabase-url")?.value || state.supabase.url || "");
  const anonKey = normalizeSupabaseAnonKey(
    document.querySelector("#onboard-supabase-anon")?.value || state.supabase.anonKey || "",
  );
  const email = String(document.querySelector("#onboard-email")?.value || state.user.email || "").trim();

  if (!url || !anonKey) {
    showSheet({
      label: "Supabase",
      title: "Supabase ontbreekt",
      message: "Vul Supabase URL + anon key in om magic link login te gebruiken.",
    });
    return;
  }
  if (!email) {
    showSheet({
      label: "Supabase",
      title: "Email ontbreekt",
      message: "Vul een email in. Supabase magic link wordt daarheen gestuurd.",
    });
    document.querySelector("#onboard-email")?.focus();
    return;
  }

  state.supabase.url = url;
  state.supabase.anonKey = anonKey;
  localStorage.setItem(SUPABASE_URL_KEY, url);
  localStorage.setItem(SUPABASE_ANON_KEY, anonKey);
  persistCoreState();

  const pill = document.querySelector("#onboard-supabase-pill");
  if (pill) pill.textContent = "Sturen...";

  try {
    const client = await getSupabaseClient();
    if (!client) throw new Error("supabase_client_missing");
    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.href.split("#")[0] + "#onboard",
      },
    });
    if (error) throw error;
    if (pill) pill.textContent = "Mail verzonden";
    showSheet({
      label: "Supabase",
      title: "Magic link verstuurd",
      message: "Open de link in je mail op dit device. Daarna is sync mogelijk met Supabase.",
    });
  } catch (error) {
    console.warn("supabase_magic_link_failed", error);
    if (pill) pill.textContent = "Error";
    showSheet({
      label: "Supabase",
      title: "Magic link mislukt",
      message: "Controleer Supabase settings (Auth + redirect URL) en probeer opnieuw.",
    });
  }
});

document.querySelector("#skip-onboarding")?.addEventListener("click", () => {
  if (state.onboardingMode === "edit") {
    resetToDemo();
    showScreen("home");
    return;
  }

  resetToDemo();
  clearOnboardingDraft();
  state.onboardingComplete = true;
  persistCoreState();
  showScreen("home");
});

[
  "#onboard-name",
  "#onboard-email",
  "#onboard-group-name",
  "#onboard-group-code",
  "#onboard-deadline",
  "#onboard-fee",
  "#onboard-api-base",
  "#onboard-supabase-url",
  "#onboard-supabase-anon",
].forEach((selector) => {
  document.querySelector(selector)?.addEventListener("input", scheduleOnboardingDraftSave);
});
document.querySelectorAll('input[name="onboardGroupMode"]').forEach((node) => {
  node.addEventListener("change", scheduleOnboardingDraftSave);
});

document.querySelector("#onboard-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (form instanceof HTMLFormElement && !form.checkValidity()) {
    form.reportValidity();
    return;
  }
  const name = document.querySelector("#onboard-name")?.value?.trim() || "Jij";
  const email = document.querySelector("#onboard-email")?.value?.trim() || "";
  const mode = document.querySelector('input[name="onboardGroupMode"]:checked')?.value || "create";
  const groupName = document.querySelector("#onboard-group-name")?.value?.trim() || "Nieuwe groep";
  let groupCode = document.querySelector("#onboard-group-code")?.value?.trim() || "";
  const deadline = document.querySelector("#onboard-deadline")?.value || "22:00";
  const feeLabel = document.querySelector("#onboard-fee")?.value || "EUR 10";
  let apiBase = normalizeApiBase(document.querySelector("#onboard-api-base")?.value || "");
  const supabaseUrl = normalizeSupabaseUrl(document.querySelector("#onboard-supabase-url")?.value || "");
  const supabaseAnonKey = normalizeSupabaseAnonKey(document.querySelector("#onboard-supabase-anon")?.value || "");
  const hydrated = hydrateOnboardingFromInviteText(groupCode);
  if (hydrated?.join) groupCode = hydrated.join;
  apiBase = normalizeApiBase(document.querySelector("#onboard-api-base")?.value || "");
  const invitePayload = hydrated?.groupPayload || state.inviteGroupPayload;

  if ((apiBase || supabaseUrl) && !email) {
    showSheet({
      label: "Profiel",
      title: "Email ontbreekt (aanrader)",
      message:
        "Met backend of Supabase kun je zonder email nog steeds groups syncen, maar billing/Stripe re-hydrate en Supabase magic link login werken beter met email. Je kunt ook later in Profiel aanpassen.",
      primary: "Toch doorgaan",
      secondary: "Email invullen",
      onSecondary: () => {
        const field = document.querySelector("#onboard-email");
        if (field instanceof HTMLElement) field.focus();
      },
    });
    return;
  }

  setOnboardingSubmitBusy(true);
  try {
    state.user = {
      ...state.user,
      name,
      email,
      initial: initialFromName(name),
    };

    if (state.onboardingMode !== "edit") {
      if (!state.user.id || state.user.id === "user_demo") state.user.id = newId("user");
      if (!state.group.id || state.group.id === "group_demo") state.group.id = newId("group");
      state.activeGroupId = state.group.id;
    }

    state.group = {
      ...state.group,
      name: groupName,
      deadline,
      feeLabel,
      destinationLabel: "Platform fee, geen cash-out",
    };
    if (apiBase) {
      state.apiBase = apiBase;
      localStorage.setItem(API_BASE_KEY, apiBase);
    } else {
      state.apiBase = "";
      localStorage.removeItem(API_BASE_KEY);
    }

    if (supabaseUrl && supabaseAnonKey) {
      state.supabase.url = supabaseUrl;
      state.supabase.anonKey = supabaseAnonKey;
      localStorage.setItem(SUPABASE_URL_KEY, supabaseUrl);
      localStorage.setItem(SUPABASE_ANON_KEY, supabaseAnonKey);
      await refreshSupabaseSession({ silent: true });
    } else {
      state.supabase.url = supabaseUrl || "";
      state.supabase.anonKey = supabaseAnonKey || "";
      localStorage.removeItem(SUPABASE_URL_KEY);
      localStorage.removeItem(SUPABASE_ANON_KEY);
      state.supabase.sessionActive = false;
      state.supabase.ready = false;
    }
    persistCoreState();

    ensureIds();

    const finalize = async () => {
      const shouldOfferBillingSetup =
        state.onboardingMode !== "edit" && Boolean(state.apiBase) && Boolean(state.user?.email) && !state.paymentMandateSetup;
      if (state.onboardingGroupMode === "create" && !state.apiBase && !String(state.group.joinCode || "").trim()) {
        state.group.joinCode = localJoinCodeFromGroupId(state.group.id);
      }
      upsertGroup(state.group);
      ensureSelfMemberLocal();
      state.onboardingComplete = true;
      clearOnboardingDraft();
      persistCoreState();
      syncGroupUI();
      syncUserUI();
      syncPaymentModel();
      if (state.onboardingGroupMode === "create") {
        await saveGroupToBackend(state.group, { silent: true });
        await ensureInviteCodeFromBackend(state.group.id, { silent: true });
        syncInviteLinkUI();
        updateInvitePreview();
      }
    if (state.apiBase) {
      await upsertProfileToBackend({ silent: true });
      await upsertMemberToBackend(
        {
          groupId: state.group.id,
            userId: state.user.id,
            displayName: state.user.name || "Jij",
            initial: state.user.initial || "Y",
          },
          { silent: true },
      );
      await syncMembersFromBackend({ silent: true });
    }
    if (state.apiBase) {
      await pushLocalGroupsToBackend({ silent: true });
      await pushLocalMembersToBackend({ silent: true });
      await upsertCheckinToBackend({ silent: true });
      await pushLocalLedgerToBackend({ silent: true });
      await syncLedgerFromBackend({ silent: true });
    }
    if (state.apiBase) {
      await testApiConnection(state.apiBase, { silent: true });
      await checkStripeHealth({ silent: true });
    }
      updateHome();
      updateCamera();
      showScreen(state.onboardingMode === "edit" ? state.onboardingReturnTo || "profile" : "home");

      if (shouldOfferBillingSetup && state.stripeReady && !state.paymentMandateSetup) {
        window.setTimeout(() => {
          showSheet({
            label: "Billing",
            title: "Sla nu een payment method op",
            message:
              "Met een mandate kan de backend later miss fees off-session chargen. Dit opent Stripe setup (test) in een nieuw tabblad.",
            primary: "Open billing",
            secondary: "Later",
            onPrimary: () => showScreen("billing"),
          });
        }, 50);
      }
    };

    if (mode === "join") {
      state.onboardingGroupMode = "join";

      if (!groupCode) {
        showSheet({
          label: "Join",
          title: "Vul een group code in",
          message: "Gebruik een invite code (`code_...`) of een group id (`group_...`).",
        });
        document.querySelector("#onboard-group-code")?.focus();
        return;
      }

      if (!state.apiBase) {
        if (invitePayload?.id) {
          const group = normalizeBackendGroup(invitePayload) || {
            id: invitePayload.id,
            name: invitePayload.name,
            deadline: invitePayload.deadline,
            feeLabel: invitePayload.feeLabel,
            destinationLabel: invitePayload.destinationLabel,
            membersCount: 4,
            joinCode: groupCode,
          };
          state.group = { ...state.group, ...group, id: group.id, joinCode: groupCode };
          state.activeGroupId = group.id;
          await finalize();
          showSheet({
            label: "Invite",
            title: "Je zit nu in de group",
            message: `${state.group.name} · Offline invite (zonder backend).`,
          });
          return;
        }
        const localGroup = findLocalGroupByCode(groupCode);
        if (localGroup?.id) {
          state.group = {
            ...state.group,
            ...localGroup,
            id: localGroup.id,
            joinCode: String(localGroup.joinCode || localGroup.join_code || groupCode).trim(),
          };
          state.activeGroupId = localGroup.id;
          await finalize();
          showSheet({
            label: "Join",
            title: "Local group gevonden",
            message: `${state.group.name} · Join via opgeslagen groups (zonder backend).`,
          });
          return;
        }

        showSheet({
          label: "Join",
          title: "Backend API ontbreekt",
          message:
            "Zet een API base (bijv. http://localhost:8001) om de group op te halen, of open een invite link die group info bevat.",
        });
        return;
      }

    try {
      const rawGroup = await fetchBackendGroupByCode({ apiBase: state.apiBase, groupCode });
      const group = normalizeBackendGroup(rawGroup);
      if (!group) throw new Error("group_invalid");
      state.group = { ...state.group, ...group, id: group.id, joinCode: group.joinCode || groupCode };
      state.activeGroupId = group.id;
      await finalize();
      showSheet({
        label: "Join",
        title: "Je zit nu in de group",
        message: `${state.group.name} · Deadline ${state.group.deadline}.`,
      });
    } catch (error) {
      console.warn("join_backend_failed", error);
      showSheet({
        label: "Join",
        title: "Join mislukt",
        message: "Invite code / group id niet gevonden of backend gaf een error. Check code, backend en CORS.",
      });
    }
    return;
  }

  state.onboardingGroupMode = "create";
  await finalize();
  } catch (error) {
    console.warn("onboarding_submit_failed", error);
    showSheet({
      label: "Onboarding",
      title: "Opslaan mislukt",
      message: "Er ging iets mis tijdens setup. Probeer opnieuw of gebruik demo data.",
    });
  } finally {
    setOnboardingSubmitBusy(false);
  }
});

document.querySelectorAll("[data-screen-target]").forEach((button) => {
  button.addEventListener("click", () => showScreen(button.dataset.screenTarget));
});

document.querySelectorAll(".exercise-row[data-exercise-index]").forEach((row) => {
  row.addEventListener("click", () => handleExerciseClick(Number(row.dataset.exerciseIndex)));
});

window.addEventListener("hashchange", () => {
  const { screen } = parseHashRoute();
  if (screens[screen]) {
    handleCheckoutReturnFromHash();
    showScreen(screen);
    return;
  }
  showScreen("home");
});

async function bootstrapBackendSync() {
  if (!state.apiBase) return;
  await syncProfileFromBackend({ silent: true });
  const needsStripeRehydrate = Boolean(state.user?.email) && !(state.stripeCustomerId || state.stripeSubscriptionId);
  if (needsStripeRehydrate) {
    await syncStripeIdsFromEmail({ silent: true });
  }
  await syncGroupsFromBackend({ silent: true });
  await syncMembersFromBackend({ silent: true });
  await syncCheckinsFromBackend({ silent: true });
  await syncLedgerFromBackend({ silent: true });
}

hydrateFromStorage();
const invite = consumeJoinInviteFromUrl();
if (invite) state.pendingInvite = invite;
syncSupabaseStatusPill();
renderGroupSelector();
syncGroupUI();
syncUserUI();
syncPaymentModel();
syncLedgerUI();
renderMemberList([]);
updateInvitePreview();
updateHome();
updateCamera();
bootstrapBackendSync();

const stored = loadModel();
const { screen: initialScreen } = parseHashRoute();
if (invite?.join) {
  enterOnboarding({ mode: "setup", returnTo: "home" });
} else if (!stored?.onboardingComplete || !stored?.user?.name) {
  enterOnboarding({ mode: "setup", returnTo: "home" });
} else if (screens[initialScreen]) {
  handleCheckoutReturnFromHash();
  showScreen(initialScreen);
} else {
  showScreen("home");
}
