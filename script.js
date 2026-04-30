const screens = {
  home: document.querySelector("#screen-home"),
  camera: document.querySelector("#screen-camera"),
  rank: document.querySelector("#screen-rank"),
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
    copy: "Depth + knee angle verified",
    form: 96,
    trust: 95,
  },
  {
    title: "Romanian deadlift",
    copy: "Hip hinge path verified",
    form: 93,
    trust: 94,
  },
  {
    title: "Push-up hold",
    copy: "Need 10 clean seconds with shoulder lock",
    form: 88,
    trust: 92,
  },
  {
    title: "Walking lunge",
    copy: "Need stride symmetry and balance lock",
    form: 86,
    trust: 90,
  },
];

function showScreen(name) {
  Object.values(screens).forEach((screen) => screen.classList.remove("active"));
  screens[name].classList.add("active");
  Object.values(screens).forEach((screen) => {
    screen.scrollTop = 0;
  });
  if (location.hash !== `#${name}`) {
    history.replaceState(null, "", name === "home" ? location.pathname : `#${name}`);
  }
}

function renderProgress(selector, count) {
  const progress = document.querySelector(selector);
  if (!progress) return;
  progress.setAttribute("aria-valuenow", String(count));
  [...progress.children].forEach((segment, index) => {
    segment.className = "";
    if (index < count) segment.classList.add("complete");
    if (index === count && count < 4) segment.classList.add("current");
  });
}

function updateHome() {
  document.querySelector("#streak-value").textContent = state.streak;
  document.querySelector("#today-checks").textContent =
    `${String(state.todayChecks).padStart(2, "0")} / 04`;
  document.querySelector("#next-exercise-label").textContent =
    exercises[state.activeExerciseIndex].title;
  document.querySelector("#next-exercise-copy").textContent =
    exercises[state.activeExerciseIndex].copy;
  document.querySelector("#next-task-copy").textContent =
    state.todayChecks >= 4
      ? "Done: today's workout is verified and counted."
      : `Next: ${exercises[state.activeExerciseIndex].title}. ${exercises[state.activeExerciseIndex].copy}.`;
  document.querySelector("#rank-user-status").textContent = `${state.verifiedCount + 4} verified workouts`;
  renderProgress("#home-progress", state.todayChecks);
}

function updateCamera() {
  const current = exercises[state.activeExerciseIndex];
  document.querySelector("#camera-title").textContent = current.title;
  document.querySelector("#camera-step-label").textContent = `Exercise ${state.activeExerciseIndex + 1} of 4`;
  document.querySelector("#form-score").textContent = `${state.form}%`;
  document.querySelector("#trust-score").textContent = `${state.trust}%`;
  document.querySelector("#trace-fill").style.width = `${state.tracePercent}%`;
  document.querySelector(".trace-bar").setAttribute("aria-valuenow", String(state.tracePercent));
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

function markTraceStep() {
  const steps = [...document.querySelectorAll("#trace-steps span")];
  steps.forEach((step, index) => {
    step.className = "";
    if (index < state.activeExerciseIndex + 1) step.classList.add("done");
    if (index === state.activeExerciseIndex + 1 && index < 4) step.classList.add("active");
  });
}

document.querySelector("#open-camera").addEventListener("click", () => {
  showScreen("camera");
});

document.querySelector("#open-camera-secondary").addEventListener("click", () => {
  showScreen("camera");
});

document.querySelector("#current-exercise-row").addEventListener("click", () => {
  showScreen("camera");
});

document.querySelector("#nav-verify").addEventListener("click", () => {
  showScreen("camera");
});

document.querySelector("#back-home").addEventListener("click", () => {
  showScreen("home");
});

const openRankButton = document.querySelector("#open-rank");
if (openRankButton) {
  openRankButton.addEventListener("click", () => {
    showScreen("rank");
  });
}

document.querySelector("#rank-nav").addEventListener("click", () => {
  showScreen("rank");
});

document.querySelector("#close-rank").addEventListener("click", () => {
  showScreen("home");
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
    document.querySelector("#angle-line").textContent = `${exercises[state.activeExerciseIndex].title} posture lock required`;
    updateHome();
    updateCamera();
    markTraceStep();
    return;
  }

  state.streak += 1;
  state.verifiedCount += 1;
  state.todayChecks = 4;
  state.tracePercent = 100;
  document.querySelector("#trace-timer").textContent = "DONE";
  document.querySelector("#motion-score").textContent = "Locked";
  document.querySelector("#angle-line").textContent = "Workout verified. Streak and rank updated.";
  addFeedItem("You finished all 4 trace blocks", "Workout counted for today", "good");
  updateHome();
  markTraceStep();
  showScreen("home");
});

document.querySelector("#switch-exercise").addEventListener("click", () => {
  state.tracePercent = Math.min(100, state.tracePercent + 14);
  state.form = Math.max(84, state.form - 1);
  state.trust = Math.max(88, state.trust - 1);
  document.querySelector("#trace-timer").textContent =
    state.tracePercent >= 100 ? "00:00" : `00:${String(Math.max(0, 10 - Math.floor(state.tracePercent / 10))).padStart(2, "0")}`;
  updateCamera();
});

updateHome();
updateCamera();
markTraceStep();

const initialScreen = location.hash.replace("#", "");
if (screens[initialScreen]) {
  showScreen(initialScreen);
}
