const screens = {
  home: document.querySelector("#screen-home"),
  camera: document.querySelector("#screen-camera"),
  rank: document.querySelector("#screen-rank"),
  success: document.querySelector("#screen-success"),
};

const state = {
  streak: 11,
  verifiedCount: 2,
  todayChecks: 2,
  activeExerciseIndex: 2,
  tracePercent: 52,
  trust: 92,
  form: 88,
  visionMode: "demo",
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
  lastFrameAt: 0,
};

const exercises = [
  {
    title: "Goblet squat",
    copy: "Depth and knee angle verified",
    instruction: "Keep your feet planted and hit full depth.",
    form: 96,
    trust: 95,
    lock: "Depth and knees stay aligned",
  },
  {
    title: "Romanian deadlift",
    copy: "Hip hinge path verified",
    instruction: "Keep the hinge smooth and your back neutral.",
    form: 93,
    trust: 94,
    lock: "Hip hinge path stays stable",
  },
  {
    title: "Push-up hold",
    copy: "Need 10 clean seconds with shoulder lock",
    instruction: "Keep shoulders and hips visible. Hold steady until the trace turns complete.",
    form: 88,
    trust: 92,
    lock: "Lock shoulder angle for 10 sec",
  },
  {
    title: "Walking lunge",
    copy: "Need stride symmetry and balance lock",
    instruction: "Keep your full body in frame and step slowly enough for trace approval.",
    form: 86,
    trust: 90,
    lock: "Stride symmetry required",
  },
];

function setLiveStatus(message) {
  const liveStatus = document.querySelector("#live-status");
  if (liveStatus) liveStatus.textContent = message;
}

function showScreen(name) {
  Object.values(screens).forEach((screen) => screen.classList.remove("active"));
  screens[name].classList.add("active");
  Object.values(screens).forEach((screen) => {
    screen.scrollTop = 0;
  });

  const hash = name === "home" ? location.pathname : `#${name}`;
  if (location.hash !== `#${name}`) {
    history.replaceState(null, "", hash);
  }

  setLiveStatus(`${name} screen opened`);

  if (name === "camera") {
    startVision();
  }
}

function renderHomeProgress(count) {
  const progress = document.querySelector("#home-progress");
  if (!progress) return;
  progress.setAttribute("aria-valuenow", String(count));

  [...progress.children].forEach((segment, index) => {
    segment.className = "";
    const label = segment.querySelector("small");
    if (index < count) {
      segment.classList.add("done");
      if (label) label.textContent = "Done";
    } else if (index === count && count < 4) {
      segment.classList.add("active");
      if (label) label.textContent = "Now";
    } else if (label) {
      label.textContent = index === count + 1 ? "Next" : "Locked";
    }
  });
}

function renderTraceSteps() {
  const steps = [...document.querySelectorAll("#trace-steps span")];
  steps.forEach((step, index) => {
    step.className = "";
    if (index < state.todayChecks) step.classList.add("done");
    if (index === state.activeExerciseIndex && state.todayChecks < 4) step.classList.add("active");
  });
}

function updateExerciseRows() {
  const rows = [...document.querySelectorAll(".exercise-row")];
  rows.forEach((row, index) => {
    const status = row.querySelector("em");
    row.classList.remove("done", "active", "locked");

    if (index < state.todayChecks) {
      row.classList.add("done");
      if (status) status.textContent = "Done";
      row.setAttribute("aria-label", `${exercises[index].title} done`);
      return;
    }

    if (index === state.activeExerciseIndex && state.todayChecks < 4) {
      row.classList.add("active");
      if (status) status.textContent = "Start";
      row.setAttribute("aria-label", `${exercises[index].title} is next`);
      return;
    }

    row.classList.add("locked");
    if (status) status.textContent = "Locked";
    row.setAttribute("aria-label", `${exercises[index].title} locked`);
  });
}

function updateHome() {
  const current = exercises[state.activeExerciseIndex] ?? exercises[3];
  const left = Math.max(0, 4 - state.todayChecks);

  document.querySelector("#streak-value").textContent = state.streak;
  document.querySelector("#mission-copy").textContent =
    left === 0
      ? "All checks passed. Your workout is counted and your streak is protected."
      : `${left} check${left === 1 ? "" : "s"} left. Finish ${left === 1 ? "it" : "them"} before 22:00.`;
  document.querySelector("#home-title").textContent =
    left === 0 ? "Workout counted" : `Start ${current.title}`;
  document.querySelector("#next-exercise-label").textContent = current.title;
  document.querySelector("#next-exercise-copy").textContent =
    left === 0 ? "All exercise blocks are accepted" : current.copy;
  document.querySelector("#rank-user-status").textContent = `${state.verifiedCount + 4} verified workouts`;

  document.querySelector("#main-cta-label").textContent =
    left === 0 ? "Review today's workout" : "Start 10-sec trace";

  renderHomeProgress(state.todayChecks);
  updateExerciseRows();
}

function updateCamera() {
  const current = exercises[state.activeExerciseIndex] ?? exercises[3];
  document.querySelector("#camera-title").textContent = current.title;
  document.querySelector("#camera-step-label").textContent = `Exercise ${state.activeExerciseIndex + 1} of 4`;
  document.querySelector("#camera-instruction").textContent = current.instruction;
  document.querySelector("#form-score").textContent = `${state.form}%`;
  document.querySelector("#trust-score").textContent = `${state.trust}%`;
  document.querySelector("#trace-fill").style.width = `${state.tracePercent}%`;
  document.querySelector(".trace-bar").setAttribute("aria-valuenow", String(state.tracePercent));
  document.querySelector("#angle-line").textContent = current.lock;
  renderTraceSteps();
  updateVisionUI(vision.lastDetections);
}

function addFeedItem(title, subtitle, tone = "") {
  const feed = document.querySelector("#feed-list");
  const row = document.createElement("article");
  row.className = `feed-row ${tone}`.trim();
  row.innerHTML = `
    <div class="avatar">Y</div>
    <div>
      <strong>${title}</strong>
      <span>${subtitle}</span>
    </div>
    <small>now</small>
  `;
  feed.prepend(row);
}

function openCamera() {
  if (state.todayChecks >= 4) {
    showScreen("success");
    return;
  }
  showScreen("camera");
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
  const current = exercises[state.activeExerciseIndex] ?? exercises[3];
  return [
    { label: "person", confidence: 0.96, x: 0.27, y: 0.22, width: 0.46, height: 0.62 },
    { label: "full body", confidence: current.title === "Walking lunge" ? 0.89 : 0.91, x: 0.2, y: 0.18, width: 0.6, height: 0.72 },
    { label: current.title.toLowerCase(), confidence: 0.86, x: 0.3, y: 0.35, width: 0.4, height: 0.38 },
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
  const mode = state.visionMode === "rfdetr" ? "RF-DETR live" : "Demo vision";

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
      ? "Person and full-body frame are visible. Trace can evaluate this block."
      : "Move back until your full body is visible before accepting the block.";

  document.querySelector("#form-score").textContent = hasBody ? `${state.form}%` : "Hold";
  document.querySelector("#trust-score").textContent = hasPerson ? `${state.trust}%` : "Low";
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

    ctx.strokeStyle = detection.label.includes("person") ? "#d4ff00" : "#b8a9ff";
    ctx.lineWidth = 2;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 10;
    ctx.strokeRect(x, y, width, height);

    ctx.shadowBlur = 0;
    ctx.font = "800 11px Inter, sans-serif";
    const labelWidth = ctx.measureText(label).width + 14;
    ctx.fillStyle = "rgba(5, 5, 5, 0.82)";
    ctx.fillRect(x, Math.max(8, y - 26), labelWidth, 22);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillText(label, x + 7, Math.max(23, y - 10));
  });

  ctx.restore();
}

function drawVisionLoop() {
  const detections = vision.lastDetections.length ? vision.lastDetections : demoDetections();
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
  if (!vision.endpoint) {
    state.visionMode = "demo";
    vision.lastDetections = demoDetections();
    updateVisionUI(vision.lastDetections);
    return;
  }

  const image = captureFrame();
  if (!image) return;

  try {
    const response = await fetch(vision.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image,
        exercise: exercises[state.activeExerciseIndex].title,
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
      state.visionMode = "demo";
      setLiveStatus("Camera preview enabled");
    } catch {
      video.classList.remove("is-live");
      state.visionMode = "demo";
      setLiveStatus("Camera permission unavailable. Demo vision mode active.");
    }
  }

  if (!vision.timer) {
    detectFrame();
    vision.timer = window.setInterval(detectFrame, 1400);
  }
}

document.querySelector("#open-camera").addEventListener("click", openCamera);
document.querySelector("#open-camera-secondary").addEventListener("click", openCamera);
document.querySelector("#current-exercise-row").addEventListener("click", openCamera);
document.querySelector("#nav-verify").addEventListener("click", openCamera);

document.querySelector("#back-home").addEventListener("click", () => {
  showScreen("home");
});

document.querySelector("#rank-nav").addEventListener("click", () => {
  showScreen("rank");
});

document.querySelector("#close-rank").addEventListener("click", () => {
  showScreen("home");
});

document.querySelector("#success-home").addEventListener("click", () => {
  showScreen("home");
});

document.querySelector("#success-back").addEventListener("click", () => {
  showScreen("home");
});

document.querySelector("#success-rank").addEventListener("click", () => {
  showScreen("rank");
});

document.querySelector("#simulate-verify").addEventListener("click", () => {
  const current = exercises[state.activeExerciseIndex];
  addFeedItem(`${current.title} accepted`, `Trace confidence ${state.trust}%`, "good");

  if (state.activeExerciseIndex < exercises.length - 1) {
    state.todayChecks = Math.min(4, state.todayChecks + 1);
    state.activeExerciseIndex += 1;
    state.tracePercent = 18;
    state.form = exercises[state.activeExerciseIndex].form;
    state.trust = exercises[state.activeExerciseIndex].trust;
    document.querySelector("#trace-timer").textContent = "00:10";
    document.querySelector("#motion-score").textContent = "Live";
    updateHome();
    updateCamera();
    setLiveStatus(`${current.title} accepted. Next exercise unlocked.`);
    return;
  }

  state.streak += 1;
  state.verifiedCount += 1;
  state.todayChecks = 4;
  state.tracePercent = 100;
  document.querySelector("#trace-timer").textContent = "DONE";
  document.querySelector("#motion-score").textContent = "Locked";
  addFeedItem("You finished all 4 trace blocks", "Workout counted for today", "good");
  document.querySelector("#success-streak").textContent = `${state.streak} days`;
  updateHome();
  updateCamera();
  showScreen("success");
});

document.querySelector("#switch-exercise").addEventListener("click", () => {
  state.tracePercent = Math.min(100, state.tracePercent + 14);
  state.form = Math.max(84, state.form - 1);
  state.trust = Math.max(88, state.trust - 1);
  document.querySelector("#trace-timer").textContent =
    state.tracePercent >= 100
      ? "00:00"
      : `00:${String(Math.max(0, 10 - Math.floor(state.tracePercent / 10))).padStart(2, "0")}`;
  updateCamera();
  vision.lastDetections = demoDetections();
  updateVisionUI(vision.lastDetections);
  setLiveStatus("Form scan refreshed");
});

updateHome();
updateCamera();

const initialScreen = location.hash.replace("#", "");
if (screens[initialScreen]) {
  showScreen(initialScreen);
} else {
  showScreen("home");
}
