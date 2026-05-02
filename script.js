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
      : `You have ${left} check${left === 1 ? "" : "s"} left. Finish every live trace or today's workout does not count.`;
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
