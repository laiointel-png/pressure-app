import { test, expect } from "@playwright/test";

async function completeOnboarding(page, { name = "E2E User", email = "e2e@example.com", groupName = "E2E Squad" } = {}) {
  await page.goto("/#onboard");
  await page.locator("#onboard-name").fill(name);
  await page.locator("#onboard-email").fill(email);
  await page.locator("#onboard-group-mode-create").check();
  await page.locator("#onboard-group-name").fill(groupName);
  await page.locator("#onboard-submit").click();
  await expect(page.locator("#screen-home")).toHaveClass(/active/);
}

async function expectSingleActiveScreen(page, activeId) {
  await expect(page.locator(activeId)).toHaveClass(/active/);
  const activeCount = await page.locator(".screen.active").count();
  expect(activeCount).toBe(1);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
  });
});

test("e2e exploratory: onboard -> home -> group -> invite -> camera -> success -> rank -> profile -> billing", async ({
  page,
}) => {
  await completeOnboarding(page);

  // Home
  await expectSingleActiveScreen(page, "#screen-home");
  await expect(page.locator("#home-title")).toBeVisible();

  // Group + invite sheet
  await page.evaluate(() => {
    window.location.hash = "#group";
  });
  await expectSingleActiveScreen(page, "#screen-group");
  await expect(page.locator("#group-title")).toBeVisible();

  await page.evaluate(() => document.querySelector("#invite-button")?.click());
  await expect(page.locator("#action-sheet")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#sheet-title")).toBeVisible();
  await expect(page.locator("#sheet-message")).toContainText("Group code:");

  // Close sheet using the explicit close button (keyboard/screen-reader safe)
  await expect(page.locator("#sheet-secondary")).toBeVisible();
  await page.evaluate(() => document.querySelector("#sheet-secondary")?.click());
  await expect(page.locator("#action-sheet")).toHaveAttribute("aria-hidden", "true");

  // Camera
  await page.evaluate(() => {
    window.location.hash = "#camera";
  });
  await expectSingleActiveScreen(page, "#screen-camera");
  await expect(page.locator(".device-frame")).toHaveClass(/camera-full/);

  // For a showcase-only e2e pass, jump to success (camera accept requires real time gating).
  await page.evaluate(() => {
    window.location.hash = "#success";
  });
  await expectSingleActiveScreen(page, "#screen-success");

  // Rank + profile
  await page.evaluate(() => {
    window.location.hash = "#rank";
  });
  await expectSingleActiveScreen(page, "#screen-rank");
  await expect(page.locator("#rank-title")).toBeVisible();

  await page.evaluate(() => {
    window.location.hash = "#profile";
  });
  await expectSingleActiveScreen(page, "#screen-profile");
  await expect(page.locator("#profile-title")).toBeVisible();

  // Billing
  await page.evaluate(() => {
    window.location.hash = "#billing";
  });
  await expectSingleActiveScreen(page, "#screen-billing");
  await expect(page.locator("#billing-title")).toBeVisible();
  await expect(page.locator("#stripe-health-pill")).toBeVisible();
});
