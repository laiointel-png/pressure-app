import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
  });
  await page.goto("/#onboard");
});

test("onboarding create flow reaches home", async ({ page }) => {
  await page.goto("/#onboard");

  await page.locator("#onboard-name").fill("Test User");
  await page.locator("#onboard-email").fill("test@example.com");

  await page.locator("#onboard-group-mode-create").check();
  await page.locator("#onboard-group-name").fill("Smoke Team");

  await page.locator("#onboard-submit").click();
  await expect(page.locator("#screen-home")).toHaveClass(/active/);
  await expect(page.locator("#home-group-title")).toContainText("Smoke Team");
});

test("navigate to group and open invite sheet", async ({ page }) => {
  await page.goto("/#onboard");
  await page.locator("#onboard-name").fill("Test User");
  await page.locator("#onboard-submit").click();

  await page.evaluate(() => {
    window.location.hash = "#group";
  });
  await expect(page.locator("#screen-group")).toHaveClass(/active/);
  await expect(page.locator("#screen-camera")).not.toHaveClass(/active/);

  await page.evaluate(() => {
    document.querySelector("#invite-button")?.click();
  });
  await expect(page.locator("#action-sheet")).toHaveAttribute("aria-hidden", "false");
});

test("camera demo shows trace UI and accept disabled until ready", async ({ page }) => {
  await page.goto("/#onboard");
  await page.locator("#onboard-name").fill("Test User");
  await page.locator("#onboard-submit").click();

  await page.locator("#nav-verify").click();
  await expect(page.locator("#screen-camera")).toHaveClass(/active/);

  const accept = page.locator("#simulate-verify");
  await expect(accept).toBeDisabled();
  await expect(page.locator("#trace-timer")).toBeVisible();
});

test("billing page loads and stripe health pill exists", async ({ page }) => {
  await page.goto("/#onboard");
  await page.locator("#onboard-name").fill("Test User");
  await page.locator("#onboard-submit").click();

  await page.evaluate(() => {
    window.location.hash = "#profile";
  });
  await expect(page.locator("#screen-profile")).toHaveClass(/active/);
  await page.locator("#payment-button").scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    document.querySelector("#payment-button")?.click();
  });
  await expect(page.locator("#screen-billing")).toHaveClass(/active/);
  await expect(page.locator("#stripe-health-pill")).toBeVisible();
});
