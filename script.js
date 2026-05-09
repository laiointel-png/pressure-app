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
  groups: {},
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
  tracePercent: 52,
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
  successKind: "workout",
  lastCheckoutSessionId: "",
  stripeCustomerId: "",
  stripeSubscriptionId: "",
  stripePaymentMethodId: "",
  createDraftGroupId: "",
  inviteGroupPayload: null,
};

const STORAGE_KEY = "pressure.mvp.v1";
const API_BASE_KEY = "pressureApiBase";

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
  return {
    id,
    name: raw.name || "Nieuwe groep",
    deadline: raw.deadline || "22:00",
    feeLabel: raw.feeLabel || raw.fee_label || "EUR 10",
    destinationLabel: raw.destinationLabel || raw.destination_label || "Platform fee, geen cash-out",
    membersCount: Number(raw.membersCount ?? raw.members_count ?? 4) || 4,
  };
}

function upsertGroup(group) {
  if (!group?.id) return;
  state.groups[group.id] = { ...(state.groups[group.id] || {}), ...group };
}

function setActiveGroup(groupId, { announce = true } = {}) {
  const next = state.groups[groupId];
  if (!next) return;
  state.group = { ...state.group, ...next, id: groupId };
  state.activeGroupId = groupId;
  persistCoreState();
  syncGroupUI();
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

function buildJoinInviteLink({ groupId, apiBase = "" } = {}) {
  const joinCode = String(groupId || "").trim();
  if (!joinCode) return "";

  const url = new URL(window.location.href);
  url.searchParams.set("join", joinCode);

  const payload = currentInviteGroupSnapshot({ groupId: joinCode });
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

function syncInviteLinkUI() {
  const groupId = currentInviteGroupId();
  const link = groupId ? buildJoinInviteLink({ groupId, apiBase: state.apiBase }) : "";

  const createInput = document.querySelector("#invite-link-input");
  if (createInput instanceof HTMLInputElement) createInput.value = link;
  const groupInput = document.querySelector("#group-invite-link-input");
  if (groupInput instanceof HTMLInputElement) groupInput.value = link;

  setText("#invite-code", groupId || "group_...");
  setText("#group-code-pill", groupId || "group_...");
}

async function copyCurrentInviteLink() {
  const groupId = currentInviteGroupId();
  const link = groupId ? buildJoinInviteLink({ groupId, apiBase: state.apiBase }) : "";
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
    const response = await fetch(url, init);
    if (!response.ok) throw new Error(`${response.status}:${path}`);
    return response.json();
  },
  post(path, body) {
    return this.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
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
  setLiveStatus(title);

  const primaryButton = document.querySelector("#sheet-primary");
  if (primaryButton instanceof HTMLElement) primaryButton.focus();
}

function closeSheet() {
  const sheet = document.querySelector("#action-sheet");
  if (!sheet) return;
  sheet.classList.remove("open");
  sheet.setAttribute("aria-hidden", "true");
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
  state.paymentSetup = false;
  state.feeDestination = "platform";
  state.onboardingMode = "setup";
  state.onboardingReturnTo = "home";
  persistCoreState();
  syncGroupUI();
  syncUserUI();
  syncPaymentModel();
  updateHome();
  updateCamera();
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

  if (nameField) nameField.value = state.user.name || "";
  if (emailField) emailField.value = state.user.email || "";
  if (groupField) groupField.value = invite?.groupPayload?.name || state.group.name || "";
  if (groupCodeField) groupCodeField.value = invite?.join || "";
  if (deadlineField) deadlineField.value = invite?.groupPayload?.deadline || state.group.deadline || "22:00";
  if (feeField) feeField.value = invite?.groupPayload?.feeLabel || state.group.feeLabel || "EUR 10";
  if (apiBaseField) apiBaseField.value = invite?.apiBase || state.apiBase || "";

  if (invite?.join) state.onboardingGroupMode = "join";
  const prefilledApiBase = normalizeApiBase(invite?.apiBase || state.apiBase || "");
  setOnboardingGroupMode(state.onboardingGroupMode || "create", { focus: false });
  setApiStatus(prefilledApiBase ? "neutral" : "bad", prefilledApiBase ? "Ongetest" : "Offline");
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
    button.setAttribute("aria-current", active ? "page" : "false");
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
  if (name === "billing") checkStripeHealth({ silent: true });
  if (name === "create") syncCreateScreenUI();
  if (name === "group") {
    syncGroupSyncPill();
    syncCheckinsFromBackend({ silent: true });
  }
  if (name === "success") syncSuccessScreen();
  if (name === "billing") maybeNotifyBillingCancel();

  if (screen instanceof HTMLElement) screen.focus();

  const frame = document.querySelector(".device-frame");
  if (frame) frame.classList.toggle("onboarding", name === "onboard");
}

async function checkStripeHealth({ silent = false } = {}) {
  if (!state.apiBase) {
    setStripeStatus("bad", "Offline");
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
    if (!silent) {
      showSheet({
        label: "Stripe",
        title: "Check mislukt",
        message: "Backend niet bereikbaar of endpoint faalde. UI blijft in demo mode.",
      });
    }
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
  state.groups = normalizeStoredGroups(stored?.groups);
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

  state.user.initial = state.user.initial || initialFromName(state.user.name);

  state.apiBase = normalizeApiBase(apiBase);
  if (state.apiBase) localStorage.setItem(API_BASE_KEY, state.apiBase);

  ensureIds();
  upsertGroup(state.group);
  syncGroupSyncPill();
}

function persistCoreState() {
  saveModel({
    user: state.user,
    groups: state.groups,
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
    onboardingComplete: true,
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
  const base = [
    ...demoRoster.map((member) => ({ ...member })),
    { userId: state.user.id, displayName: state.user.name || "Jij", initial: state.user.initial || "Y", checksCompleted: state.todayChecks },
  ];

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
        if (portalUrl) window.open(portalUrl, "_blank", "noopener,noreferrer");
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

function syncCreateScreenUI() {
  const createNewToggle = document.querySelector("#create-new-toggle");
  const title = document.querySelector("#create-title");
  const label = document.querySelector("#screen-create .create-hero .section-label");
  const headline = document.querySelector("#screen-create .create-hero h1");
  const submit = document.querySelector('#create-group-form button[type="submit"]');
  const creatingNew = Boolean(createNewToggle?.checked);

  if (creatingNew && !state.createDraftGroupId) state.createDraftGroupId = newId("group");
  if (!creatingNew) state.createDraftGroupId = "";

  if (title) title.textContent = creatingNew ? "Groep maken" : "Groep bewerken";
  if (label) label.textContent = creatingNew ? "Nieuwe groep" : "Bewerk groep";
  if (headline) headline.textContent = creatingNew ? "Maak de regels eerst duidelijk." : "Update de regels voor je groep.";
  if (submit) submit.textContent = creatingNew ? "Maak groep live" : "Sla wijzigingen op";
  syncInviteLinkUI();
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
}

async function startVision() {
  const video = document.querySelector("#camera-video");
  if (!video) return;

  if (!vision.raf) {
    vision.lastDetections = demoDetections();
    drawVisionLoop();
    updateVisionUI(vision.lastDetections);
  }

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

  if (!vision.timer) {
    detectFrame();
    vision.timer = window.setInterval(detectFrame, 1400);
  }
}

function acceptCurrentExercise() {
  const current = currentExercise();
  addFeedItem(`${current.title} geaccepteerd`, `Trust score ${state.trust}%`, "good");

  if (state.activeExerciseIndex < exercises.length - 1) {
    state.todayChecks = Math.min(exercises.length, state.todayChecks + 1);
    state.activeExerciseIndex += 1;
    state.tracePercent = 20;
    state.form = currentExercise().form;
    state.trust = currentExercise().trust;
    setText("#trace-timer", "00:10");
    setText("#motion-score", "Actief");
    updateHome();
    updateCamera();
    upsertCheckinToBackend({ silent: true });
    renderMemberList([]);
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
  state.tracePercent = 100;
  setText("#trace-timer", "DONE");
  setText("#motion-score", "Locked");
  setText("#success-streak", String(state.streak));
  addFeedItem("Jij hebt 4/4 gehaald", "Workout telt vandaag", "good");
  updateHome();
  updateCamera();
  upsertCheckinToBackend({ silent: true });
  state.successKind = "workout";
  showScreen("success");
}

function scanAgain() {
  state.tracePercent = Math.min(100, state.tracePercent + 16);
  state.form = Math.max(82, state.form - 1);
  state.trust = Math.max(87, state.trust - 1);
  setText(
    "#trace-timer",
    state.tracePercent >= 100
      ? "00:00"
      : `00:${String(Math.max(0, 10 - Math.floor(state.tracePercent / 10))).padStart(2, "0")}`,
  );
  vision.lastDetections = demoDetections();
  updateCamera();
  setLiveStatus("Scan opnieuw uitgevoerd");
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

  setText("#payment-status-pill", state.paymentSetup ? "Toestemming" : "Demo");
  setText(
    "#setup-mandate-copy",
    state.paymentSetup
      ? "Demo-toestemming staat aan. In productie loopt dit via Stripe Checkout/SetupIntent."
      : "Gebruiker moet expliciet akkoord geven voor latere fees.",
  );

  const portal = document.querySelector("#billing-open-portal");
  if (portal) portal.classList.toggle("hidden", !(state.paymentSetup && state.apiBase));

  const mandateRow = document.querySelector("#setup-mandate-row");
  if (mandateRow) {
    mandateRow.classList.toggle("done", state.paymentSetup);
    mandateRow.classList.toggle("active", !state.paymentSetup);
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
        if (checkout.checkout_url) window.open(checkout.checkout_url, "_blank", "noopener,noreferrer");
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

function simulateMissFee() {
  const ledger = document.querySelector("#ledger-list");
  if (ledger) {
    const row = document.createElement("article");
    row.innerHTML = `
      <span>Nu</span>
      <strong>Timothy miss fee verwerkt als ${destinationLabel()}</strong>
      <em>EUR 10</em>
    `;
    ledger.prepend(row);
  }

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

    const ledger = document.querySelector("#ledger-list");
    if (ledger) {
      const row = document.createElement("article");
      const mode = response?.mode || "demo";
      const status = response?.status || response?.ledger_status || "ok";
      row.innerHTML = `
        <span>Backend</span>
        <strong>Miss fee charge (${mode})</strong>
        <em>${status}</em>
      `;
      ledger.prepend(row);
    }

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

  let uploaded = 0;
  let failed = 0;
  for (const group of groups) {
    // best-effort; any failures remain local-only
    const ok = await saveGroupToBackend(group, { silent: true });
    if (ok) uploaded += 1;
    else failed += 1;
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

function normalizeImportedGroup(raw) {
  if (!raw) return null;
  const id = String(raw.id || raw.group_id || "").trim();
  if (!id) return null;
  const name = String(raw.name || "Nieuwe groep").trim() || "Nieuwe groep";
  const deadline = String(raw.deadline || "22:00").trim() || "22:00";
  const feeLabel = String(raw.feeLabel || raw.fee_label || "EUR 10").trim() || "EUR 10";
  const destinationLabel = String(raw.destinationLabel || raw.destination_label || "Platform fee, geen cash-out").trim()
    || "Platform fee, geen cash-out";
  return { id, name, deadline, feeLabel, destinationLabel };
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

document.querySelector("#billing-back").addEventListener("click", () => showScreen("profile"));
document.querySelector("#billing-help").addEventListener("click", () => {
  showSheet({
    label: "Betaalmodel",
    title: "Waarom geen cashpot?",
    message:
      "Cashprijzen kunnen gambling/payment review triggeren. Daarom start de beta met abonnement, platform fee en transparante ledger zonder cash-out.",
  });
});
document.querySelector("#billing-check-stripe")?.addEventListener("click", () => checkStripeHealth());
document.querySelector("#setup-payment").addEventListener("click", setupPaymentPermission);
document.querySelector("#billing-open-portal")?.addEventListener("click", openCustomerPortal);
document.querySelector("#simulate-miss-fee").addEventListener("click", simulateMissFee);
document.querySelector("#charge-miss-fee")?.addEventListener("click", chargeMissFeeBackend);

document.querySelector("#stripe-customer-id")?.addEventListener("input", (event) => {
  state.stripeCustomerId = event.target.value.trim();
  persistCoreState();
});
document.querySelector("#stripe-payment-method-id")?.addEventListener("input", (event) => {
  state.stripePaymentMethodId = event.target.value.trim();
  persistCoreState();
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
    state.group = { ...state.group, id: nextId };
    state.activeGroupId = state.group.id;
    state.createDraftGroupId = "";
  }

  state.group = {
    ...state.group,
    name,
    deadline,
    feeLabel,
    destinationLabel,
  };
  upsertGroup(state.group);
  syncGroupUI();
  persistCoreState();

  if (state.apiBase) {
    await saveGroupToBackend(state.group, { silent: true });
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

document.querySelector("#create-new-toggle")?.addEventListener("change", () => {
  syncCreateScreenUI();
  updateInvitePreview();
});

document.querySelector("#pause-trace").addEventListener("click", () => {
  state.cameraPaused = !state.cameraPaused;
  setText("#camera-record-label", state.cameraPaused ? "Gepauzeerd" : "Live check");
  setText("#motion-score", state.cameraPaused ? "Pauze" : "Actief");
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
  if (event.key === "Escape") closeSheet();
});

document.querySelector("#onboard-back")?.addEventListener("click", () => {
  showScreen(state.onboardingReturnTo || "home");
});

document.querySelector("#test-api")?.addEventListener("click", () => {
  const base = document.querySelector("#onboard-api-base")?.value || "";
  testApiConnection(base);
});

document.querySelector("#onboard-group-mode-create")?.addEventListener("change", (event) => {
  if (event.target.checked) setOnboardingGroupMode("create");
});
document.querySelector("#onboard-group-mode-join")?.addEventListener("change", (event) => {
  if (event.target.checked) setOnboardingGroupMode("join");
});

async function previewJoinGroup() {
  const apiBase = normalizeApiBase(document.querySelector("#onboard-api-base")?.value || "");
  const codeField = document.querySelector("#onboard-group-code");
  const groupCode = codeField?.value?.trim() || "";
  const invitePayload = state.inviteGroupPayload;

  if (!groupCode) {
    showSheet({
      label: "Join",
      title: "Vul een group code in",
      message: "De code ziet eruit als `group_...` en komt uit de group owner setup.",
    });
    if (codeField instanceof HTMLElement) codeField.focus();
    return;
  }

  if (!apiBase) {
    if (invitePayload?.id && invitePayload.id === groupCode) {
      showSheet({
        label: "Invite",
        title: "Group info uit invite",
        message: `${invitePayload.name || "Groep"} · Deadline ${invitePayload.deadline || "22:00"} · Fee ${
          invitePayload.feeLabel || "EUR 10"
        }. Backend is optioneel voor sync/billing.`,
        primary: "Gebruik deze group",
        onPrimary: () => {
          setOnboardingGroupMode("join", { focus: false });
          const code = document.querySelector("#onboard-group-code");
          if (code) code.value = invitePayload.id;
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
    const payload = await api.get(`/api/groups/${encodeURIComponent(groupCode)}`);
    const group = normalizeBackendGroup(payload?.group);
    if (!group) throw new Error("group_invalid");

    showSheet({
      label: "Join",
      title: "Group gevonden",
      message: `${group.name} · Deadline ${group.deadline} · Fee ${group.feeLabel}`,
      primary: "Gebruik deze group",
      onPrimary: () => {
        setOnboardingGroupMode("join", { focus: false });
        const code = document.querySelector("#onboard-group-code");
        if (code) code.value = group.id;
      },
    });
  } catch {
    showSheet({
      label: "Join",
      title: "Group niet gevonden",
      message: "Controleer de code, of je backend draait en CORS toelaat.",
    });
  }
}

document.querySelector("#onboard-preview-group")?.addEventListener("click", previewJoinGroup);

document.querySelector("#skip-onboarding")?.addEventListener("click", () => {
  if (state.onboardingMode === "edit") {
    resetToDemo();
    showScreen("home");
    return;
  }

  resetToDemo();
  showScreen("home");
});

document.querySelector("#onboard-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.querySelector("#onboard-name")?.value?.trim() || "Jij";
  const email = document.querySelector("#onboard-email")?.value?.trim() || "";
  const mode = document.querySelector('input[name="onboardGroupMode"]:checked')?.value || "create";
  const groupName = document.querySelector("#onboard-group-name")?.value?.trim() || "Nieuwe groep";
  const groupCode = document.querySelector("#onboard-group-code")?.value?.trim() || "";
  const deadline = document.querySelector("#onboard-deadline")?.value || "22:00";
  const feeLabel = document.querySelector("#onboard-fee")?.value || "EUR 10";
  const apiBase = normalizeApiBase(document.querySelector("#onboard-api-base")?.value || "");
  const invitePayload = state.inviteGroupPayload;

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

  ensureIds();

  const finalize = () => {
    upsertGroup(state.group);
    persistCoreState();
    syncGroupUI();
    syncUserUI();
    syncPaymentModel();
    if (state.onboardingGroupMode === "create") saveGroupToBackend(state.group, { silent: true });
    if (state.apiBase) pushLocalGroupsToBackend({ silent: true });
    if (state.apiBase) {
      testApiConnection(state.apiBase, { silent: true });
      checkStripeHealth({ silent: true });
    }
    updateHome();
    updateCamera();
    showScreen(state.onboardingMode === "edit" ? state.onboardingReturnTo || "profile" : "home");
  };

  if (mode === "join") {
    state.onboardingGroupMode = "join";

    if (!groupCode) {
      showSheet({
        label: "Join",
        title: "Vul een group code in",
        message: "De code ziet eruit als `group_...` en komt uit de group owner setup.",
      });
      document.querySelector("#onboard-group-code")?.focus();
      return;
    }

    if (!state.apiBase) {
      if (invitePayload?.id && invitePayload.id === groupCode) {
        const group = normalizeBackendGroup(invitePayload) || {
          id: invitePayload.id,
          name: invitePayload.name,
          deadline: invitePayload.deadline,
          feeLabel: invitePayload.feeLabel,
          destinationLabel: invitePayload.destinationLabel,
          membersCount: 4,
        };
        state.group = { ...state.group, ...group, id: group.id };
        state.activeGroupId = group.id;
        finalize();
        showSheet({
          label: "Invite",
          title: "Je zit nu in de group",
          message: `${state.group.name} · Offline invite (zonder backend).`,
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

    api
      .get(`/api/groups/${encodeURIComponent(groupCode)}`)
      .then((payload) => {
        const group = normalizeBackendGroup(payload?.group);
        if (!group) throw new Error("group_invalid");
        state.group = { ...state.group, ...group, id: group.id };
        state.activeGroupId = group.id;
        finalize();
        showSheet({
          label: "Join",
          title: "Je zit nu in de group",
          message: `${state.group.name} · Deadline ${state.group.deadline}.`,
        });
      })
      .catch(() => {
        showSheet({
          label: "Join",
          title: "Join mislukt",
          message: "Group niet gevonden of backend gaf een error. Check code, backend en CORS.",
        });
      });
    return;
  }

  state.onboardingGroupMode = "create";

  upsertGroup(state.group);
  persistCoreState();
  syncGroupUI();
  syncUserUI();
  syncPaymentModel();
  saveGroupToBackend(state.group, { silent: true });
  pushLocalGroupsToBackend({ silent: true });
  if (state.apiBase) {
    testApiConnection(state.apiBase, { silent: true });
    checkStripeHealth({ silent: true });
  }
  updateHome();
  updateCamera();
  showScreen(state.onboardingMode === "edit" ? state.onboardingReturnTo || "profile" : "home");
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

hydrateFromStorage();
const invite = consumeJoinInviteFromUrl();
if (invite) state.pendingInvite = invite;
if (state.apiBase) {
  // Best-effort merge backend groups without interrupting the demo UX.
  syncGroupsFromBackend({ silent: true });
  syncCheckinsFromBackend({ silent: true });
}
renderGroupSelector();
syncGroupUI();
syncUserUI();
syncPaymentModel();
renderMemberList([]);
updateInvitePreview();
updateHome();
updateCamera();

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
