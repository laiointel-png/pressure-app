import { test, expect } from "@playwright/test";

const LIVE_URL = "https://laiointel-png.github.io/pressure-app/";

test("live GitHub Pages: splash hides nav + onboarding triggers for first-time users", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  await page.goto(LIVE_URL, { waitUntil: "domcontentloaded" });

  const splash = page.locator("#screen-splash");
  const nav = page.locator(".bottom-nav");
  const onboard = page.locator("#screen-onboard");

  // The live site may auto-skip the splash quickly on fast connections; accept either state.
  const reachedFirstRunScreen = await page
    .waitForFunction(() => {
      const splashEl = document.querySelector("#screen-splash");
      const onboardEl = document.querySelector("#screen-onboard");
      const splashActive = splashEl?.classList.contains("active");
      const onboardActive = onboardEl?.classList.contains("active");
      return splashActive || onboardActive;
    })
    .then(() => true)
    .catch(() => false);
  expect(reachedFirstRunScreen).toBe(true);

  const splashActive = await splash.evaluate((el) => el.classList.contains("active"));
  if (splashActive) {
    await expect(splash).toBeVisible();
    await expect(nav).toBeHidden();
    await page.waitForFunction(() => {
      const splashEl = document.querySelector("#screen-splash");
      return splashEl && !splashEl.classList.contains("active");
    });
  }

  await expect(onboard).toBeVisible();
  await expect(onboard).toHaveClass(/active/);
});
