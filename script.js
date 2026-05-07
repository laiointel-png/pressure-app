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
  sheetSecondaryAction: null,
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
  const uuid =
    globalThis.crypto?.randomUUID?.bind(globalThis.crypto) ||
    (() => `${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`);
  if (!state.user.id) state.user.id = `user_${uuid()}`;
  if (!state.group.id) state.group.id = `group_${uuid()}`;
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

async function testApiConnection(rawBase) {
  const base = normalizeApiBase(rawBase);
  if (!base) {
    setApiStatus("bad", "Offline");
    showSheet({
      label: "API",
      title: "Geen API base ingevuld",
      message: "Zet een URL zoals http://localhost:8001 in om group sync + Stripe demo endpoints te testen.",
    });
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

    showSheet({
      label: "API check",
      title: "Backend bereikbaar",
      message: `Groups: ${groupsReady ? "ok" : "uit"}. Payments: ${paymentsReady ? "ok" : "uit"}. Stripe: ${
        stripeReady ? "ready" : "demo"
      }.`,
    });
  } catch {
    setApiStatus("bad", "Offline");
    showSheet({
      label: "API",
      title: "Backend niet bereikbaar",
      message: "Check of de server draait en CORS toestaat. UI blijft werken met localStorage demo state.",
    });
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

  const backButton = document.querySelector("#onboard-back");
  if (backButton) backButton.classList.toggle("hidden", mode !== "edit");

  const submit = document.querySelector("#onboard-submit");
  if (submit) submit.textContent = mode === "edit" ? "Update setup" : "Start Pressure";

  const skip = document.querySelector("#skip-onboarding");
  if (skip) skip.textContent = mode === "edit" ? "Reset naar demo" : "Gebruik demo data";

  const nameField = document.querySelector("#onboard-name");
  const emailField = document.querySelector("#onboard-email");
  const groupField = document.querySelector("#onboard-group-name");
  const deadlineField = document.querySelector("#onboard-deadline");
  const feeField = document.querySelector("#onboard-fee");
  const apiBaseField = document.querySelector("#onboard-api-base");

  if (nameField) nameField.value = state.user.name || "";
  if (emailField) emailField.value = state.user.email || "";
  if (groupField) groupField.value = state.group.name || "";
  if (deadlineField) deadlineField.value = state.group.deadline || "22:00";
  if (feeField) feeField.value = state.group.feeLabel || "EUR 10";
  if (apiBaseField) apiBaseField.value = state.apiBase || "";

  setApiStatus(state.apiBase ? "neutral" : "bad", state.apiBase ? "Ongetest" : "Offline");
  showScreen("onboard");
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
  if (location.hash !== `#${name}`) history.replaceState(null, "", hash);

  syncNav(name);
  setLiveStatus(`${name} geopend`);

  if (name === "camera") startVision();

  if (screen instanceof HTMLElement) screen.focus();

  const frame = document.querySelector(".device-frame");
  if (frame) frame.classList.toggle("onboarding", name === "onboard");
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
}

function syncUserUI() {
  setText("#profile-avatar", state.user.initial || "Y");
  setText("#group-user-avatar", state.user.initial || "Y");
}

function hydrateFromStorage() {
  const stored = loadModel();
  const apiBase =
    window.PRESSURE_API_BASE ||
    localStorage.getItem(API_BASE_KEY) ||
    stored?.apiBase ||
    "";

  if (stored?.user) state.user = { ...state.user, ...stored.user };
  if (stored?.group) state.group = { ...state.group, ...stored.group };
  if (stored?.paymentSetup != null) state.paymentSetup = Boolean(stored.paymentSetup);
  if (stored?.feeDestination) state.feeDestination = stored.feeDestination;

  state.user.initial = state.user.initial || initialFromName(state.user.name);

  state.apiBase = normalizeApiBase(apiBase);
  if (state.apiBase) localStorage.setItem(API_BASE_KEY, state.apiBase);

  ensureIds();
}

function persistCoreState() {
  saveModel({
    user: state.user,
    group: state.group,
    paymentSetup: state.paymentSetup,
    feeDestination: state.feeDestination,
    apiBase: state.apiBase,
  });
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

  const mandateRow = document.querySelector("#setup-mandate-row");
  if (mandateRow) {
    mandateRow.classList.toggle("done", state.paymentSetup);
    mandateRow.classList.toggle("active", !state.paymentSetup);
  }
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

  try {
    const health = await api.get("/api/payments/health");
    const ready = Boolean(health?.stripe_ready);
    const checkout = await api.post("/api/payments/pass-checkout", {
      user_id: userId,
      email: email || "demo@example.com",
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

function updateInvitePreview() {
  const name = document.querySelector("#group-name-input")?.value || state.group.name || "Nieuwe groep";
  const deadline = document.querySelector("#deadline-input")?.value || state.group.deadline || "22:00";
  const fee = document.querySelector("#fee-input")?.value || state.group.feeLabel || "EUR 10";
  const destination = document.querySelector("#destination-input")?.value || state.group.destinationLabel || "Platform fee, geen cash-out";

  setText("#invite-preview-title", name);
  setText("#invite-preview-copy", `Daily 4/4 live checks. Deadline ${deadline}. Fee ${fee} als ${destination.toLowerCase()}.`);
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
    onPrimary: () => showScreen("create"),
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
  const invite = "https://pressure.app/join/iron-pact";
  try {
    await navigator.clipboard?.writeText(invite);
  } catch {
    // Clipboard is optional in some preview contexts.
  }
  showSheet({
    label: "Invite",
    title: "Invite link gekopieerd",
    message: invite,
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
document.querySelector("#setup-payment").addEventListener("click", setupPaymentPermission);
document.querySelector("#simulate-miss-fee").addEventListener("click", simulateMissFee);

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
document.querySelector("#create-group-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.querySelector("#group-name-input").value.trim() || "Nieuwe groep";
  const deadline = document.querySelector("#deadline-input")?.value || "22:00";
  const feeLabel = document.querySelector("#fee-input")?.value || "EUR 10";
  const destinationLabel = document.querySelector("#destination-input")?.value || "Platform fee, geen cash-out";

  state.group = {
    ...state.group,
    name,
    deadline,
    feeLabel,
    destinationLabel,
  };
  syncGroupUI();
  persistCoreState();

  if (state.apiBase) {
    api
      .post("/api/groups", {
        group_id: state.group.id,
        name,
        deadline,
        fee_label: feeLabel,
        destination_label: destinationLabel,
      })
      .catch(() => {
        // backend optional; local storage already updated
      });
  }

  showSheet({
    label: "Groep live",
    title: `${name} is aangemaakt`,
    message: "Invite link, regels en betaalmodel staan klaar voor de beta.",
    primary: "Open groep",
    onPrimary: () => showScreen("group"),
  });
});

document.querySelectorAll("#group-name-input, #deadline-input, #fee-input, #destination-input").forEach((field) => {
  field.addEventListener("input", updateInvitePreview);
  field.addEventListener("change", updateInvitePreview);
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
  const groupName = document.querySelector("#onboard-group-name")?.value?.trim() || "Nieuwe groep";
  const deadline = document.querySelector("#onboard-deadline")?.value || "22:00";
  const feeLabel = document.querySelector("#onboard-fee")?.value || "EUR 10";
  const apiBase = normalizeApiBase(document.querySelector("#onboard-api-base")?.value || "");

  state.user = {
    ...state.user,
    name,
    email,
    initial: initialFromName(name),
  };
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
  persistCoreState();
  syncGroupUI();
  syncUserUI();
  syncPaymentModel();
  if (state.apiBase) {
    api
      .post("/api/groups", {
        group_id: state.group.id,
        name: state.group.name,
        deadline: state.group.deadline,
        fee_label: state.group.feeLabel,
        destination_label: state.group.destinationLabel,
      })
      .catch(() => {
        // backend optional; local storage already updated
      });
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
  const nextScreen = location.hash.replace("#", "");
  if (screens[nextScreen]) {
    showScreen(nextScreen);
    return;
  }
  showScreen("home");
});

hydrateFromStorage();
syncGroupUI();
syncUserUI();
syncPaymentModel();
updateInvitePreview();
updateHome();
updateCamera();

const stored = loadModel();
const initialScreen = location.hash.replace("#", "");
if (!stored?.user?.name || stored?.onboardingComplete === false) {
  enterOnboarding({ mode: "setup", returnTo: "home" });
} else if (screens[initialScreen]) {
  showScreen(initialScreen);
} else {
  showScreen("home");
}
