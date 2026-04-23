const screens = {
  onboarding: document.querySelector("#onboarding"),
  group: document.querySelector("#group"),
  home: document.querySelector("#home"),
  camera: document.querySelector("#camera"),
  leaderboard: document.querySelector("#leaderboard"),
};

const onboardingSteps = [
  {
    title: "You don't need motivation.",
    copy: "Your friends will hold you accountable.",
    button: "Start",
    notify: false,
  },
  {
    title: "Miss a check-in. Pay the price.",
    copy: "The group sees it. The pot grows.",
    button: "Next",
    notify: true,
  },
  {
    title: "Win respect. Take rewards.",
    copy: "Streaks, rank, pot. No hiding.",
    button: "Join or create",
    notify: false,
  },
];

let step = 0;
let checkedIn = false;
let cycleIndex = 0;

const cycleNames = ["Timothy", "Mila", "Layo", "You"];

function showScreen(name) {
  Object.values(screens).forEach((screen) => screen.classList.remove("active"));
  screens[name].classList.add("active");
}

function setOnboarding(nextStep) {
  const title = document.querySelector("#onboarding-title");
  const copy = document.querySelector("#onboarding-copy");
  const button = document.querySelector("#next-onboarding");
  const notification = document.querySelector("#fake-notification");
  const data = onboardingSteps[nextStep];

  title.textContent = data.title;
  copy.textContent = data.copy;
  button.textContent = data.button;
  notification.classList.toggle("visible", data.notify);
}

document.querySelector("#next-onboarding").addEventListener("click", () => {
  if (step >= onboardingSteps.length - 1) {
    showScreen("group");
    return;
  }

  step += 1;
  setOnboarding(step);
});

document.querySelector("#setup-form").addEventListener("submit", (event) => {
  event.preventDefault();
  showScreen("home");
});

document.querySelector("#demo-group").addEventListener("click", () => {
  showScreen("home");
});

document.querySelectorAll(".segmented").forEach((group) => {
  group.addEventListener("click", (event) => {
    if (!(event.target instanceof HTMLButtonElement)) return;
    group.querySelectorAll("button").forEach((button) => button.classList.remove("active"));
    event.target.classList.add("active");
  });
});

function openCamera() {
  showScreen("camera");
}

document.querySelector("#open-camera").addEventListener("click", openCamera);
document.querySelector("#bottom-check").addEventListener("click", openCamera);

document.querySelector("#close-camera").addEventListener("click", () => {
  showScreen("home");
});

document.querySelector("#post-checkin").addEventListener("click", () => {
  checkedIn = true;
  document.querySelector("#check-status").textContent = "Checked in";
  document.querySelector("#streak-count").textContent = "7";
  document.querySelector("#you-score").textContent = "7/7";

  const feed = document.querySelector(".feed");
  const item = document.createElement("article");
  item.className = "feed-item win";
  item.innerHTML = `
    <div class="avatar">Y</div>
    <div>
      <strong>You checked in</strong>
      <span>Day 7 confirmed</span>
    </div>
    <small>now</small>
  `;
  feed.prepend(item);
  showScreen("home");
});

document.querySelector("#show-leaderboard").addEventListener("click", () => {
  showScreen("leaderboard");
});

document.querySelector("#back-home").addEventListener("click", () => {
  showScreen("home");
});

document.querySelector("#advance-cycle").addEventListener("click", () => {
  cycleIndex = (cycleIndex + 1) % cycleNames.length;
  const name = cycleNames[cycleIndex];
  const prefix = checkedIn && name === "You" ? "Chain complete" : `Waiting on ${name}`;
  document.querySelector("#cycle-status").textContent = prefix;
});
