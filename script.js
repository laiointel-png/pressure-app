const screens = {
  home: document.querySelector("#screen-home"),
  group: document.querySelector("#screen-group"),
  camera: document.querySelector("#screen-camera"),
  rank: document.querySelector("#screen-rank"),
  profile: document.querySelector("#screen-profile"),
  success: document.querySelector("#screen-success"),
};

const state = {
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
};

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

function showSheet({ label = "Update", title, message, primary = "Ok", secondary = "Sluiten", onPrimary = null }) {
  const sheet = document.querySelector("#action-sheet");
  if (!sheet) return;

  state.sheetAction = onPrimary;
  setText("#sheet-label", label);
  setText("#sheet-title", title);
  setText("#sheet-message", message);
  setText("#sheet-primary", primary);
  setText("#sheet-secondary", secondary);
  sheet.classList.add("open");
  sheet.setAttribute("aria-hidden", "false");
  setLiveStatus(title);
}

function closeSheet() {
  const sheet = document.querySelector("#action-sheet");
  if (!sheet) return;
  sheet.classList.remove("open");
  sheet.setAttribute("aria-hidden", "true");
  state.sheetAction = null;
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
      : `Maak oefening ${state.activeExerciseIndex + 1} van 4 af voor 22:00. Penalty bij missen: EUR 10.`,
  );
  setText("#home-title", left === 0 ? "Workout telt vandaag" : `Nog ${left} check${left === 1 ? "" : "s"} tot je workout telt`);
  setText("#main-cta-label", left === 0 ? "Bekijk resultaat" : `Start oefening ${state.activeExerciseIndex + 1}`);
  setText("#next-exercise-label", current.title);
  setText("#next-exercise-copy", left === 0 ? "Alle oefeningen zijn geaccepteerd" : current.short);

  renderHomeProgress(state.todayChecks);
  updateExerciseRows();
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
    <div class="avatar">Y</div>
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
    label: "Penalty",
    title: "Mis je, dan ziet de groep het",
    message: "Bij minder dan 4 live checks voor 22:00 gaat EUR 10 naar de weekpot. De status komt in de feed.",
  });
});

document.querySelector("#menu-button").addEventListener("click", () => {
  showSheet({
    label: "Menu",
    title: "Alles zit nu in de onderste navigatie",
    message: "Vandaag, Groep, Check, Rank en Profiel zijn allemaal werkende schermen in deze preview.",
  });
});

document.querySelector("#notifications-button").addEventListener("click", () => {
  showSheet({
    label: "Meldingen",
    title: "Timothy is bijna te laat",
    message: "42 minuten tot penalty. In productie wordt dit een push-notification naar de groep.",
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
    message: "Deadline 22:00. Penalty EUR 10. Winner of the week krijgt de pot. Alleen live camera checks tellen.",
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
    title: "Demo instellingen",
    message: "Hier komen penalty bedrag, check-in tijden, betaalmethode en privacy instellingen.",
  });
});

document.querySelector("#payment-button").addEventListener("click", () => {
  showSheet({
    label: "Payment",
    title: "Payment flow is demo",
    message: "Voor echte automatische incasso is straks Stripe/SEPA setup en expliciete toestemming nodig.",
  });
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
document.querySelector("#sheet-secondary").addEventListener("click", closeSheet);
document.querySelector("#action-sheet").addEventListener("click", (event) => {
  if (event.target.id === "action-sheet") closeSheet();
});

document.querySelectorAll("[data-screen-target]").forEach((button) => {
  button.addEventListener("click", () => showScreen(button.dataset.screenTarget));
});

document.querySelectorAll(".exercise-row[data-exercise-index]").forEach((row) => {
  row.addEventListener("click", () => handleExerciseClick(Number(row.dataset.exerciseIndex)));
});

updateHome();
updateCamera();

const initialScreen = location.hash.replace("#", "");
if (screens[initialScreen]) {
  showScreen(initialScreen);
} else {
  showScreen("home");
}
