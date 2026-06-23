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
  await expect(page.locator("#home-group-title")).not.toHaveText("");
});

test("navigate to group and open invite sheet", async ({ page }) => {
  await page.goto("/#onboard");
  await page.locator("#onboard-name").fill("Test User");
  await page.locator("#onboard-email").fill("test@example.com");
  await page.locator("#onboard-group-mode-create").check();
  await page.locator("#onboard-group-name").fill("Smoke Team");
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

test("product shell does not expose fixture names or demo labels", async ({ page }) => {
  await page.goto("/#onboard");
  await page.locator("#onboard-name").fill("Test User");
  await page.locator("#onboard-email").fill("test@example.com");
  await page.locator("#onboard-group-mode-create").check();
  await page.locator("#onboard-group-name").fill("Smoke Team");
  await page.locator("#onboard-submit").click();

  await expect(page.locator("#screen-home")).toHaveClass(/active/);
  await expect(page.locator("body")).not.toContainText(/Mila|Timothy|Layo|Team Iron Pact|Demo|Gebruik demo/);

  await page.evaluate(() => {
    window.location.hash = "#group";
  });
  await expect(page.locator("#screen-group")).toHaveClass(/active/);
  await expect(page.locator("body")).not.toContainText(/Mila|Timothy|Layo|Team Iron Pact|Demo|Gebruik demo/);
});

test("legacy local seed ids are replaced during onboarding", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const page = await context.newPage();

  await page.addInitScript(() => {
    localStorage.setItem(
      "pressure.mvp.v1",
      JSON.stringify({
        user: { id: "user_demo", name: "Legacy User", email: "legacy@example.com" },
        group: {
          id: "group_demo",
          name: "Legacy Team",
          deadline: "22:00",
          feeLabel: "EUR 10",
          destinationLabel: "Platform fee, geen cash-out",
          membersCount: 1,
        },
        groups: {
          group_demo: {
            id: "group_demo",
            name: "Legacy Team",
            deadline: "22:00",
            feeLabel: "EUR 10",
            destinationLabel: "Platform fee, geen cash-out",
            membersCount: 1,
          },
        },
        membersByGroup: {
          group_demo: [{ userId: "user_demo", displayName: "Legacy User", initial: "L", role: "owner" }],
        },
        activeGroupId: "group_demo",
      }),
    );
  });

  await page.goto("/#onboard");
  await page.locator("#onboard-name").fill("Test User");
  await page.locator("#onboard-email").fill("test@example.com");
  await page.locator("#onboard-group-mode-create").check();
  await page.locator("#onboard-group-name").fill("Smoke Team");
  await page.locator("#onboard-submit").click();

  await expect(page.locator("#screen-home")).toHaveClass(/active/);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("pressure.mvp.v1") || "{}"));

  expect(stored.user.id).toMatch(/^user_/);
  expect(stored.user.id).not.toBe("user_demo");
  expect(stored.group.id).toMatch(/^group_/);
  expect(stored.group.id).not.toBe("group_demo");
  expect(stored.activeGroupId).toBe(stored.group.id);
  expect(Object.keys(stored.groups || {})).not.toContain("group_demo");
  expect(Object.keys(stored.membersByGroup || {})).not.toContain("group_demo");

  await context.close();
});

test("camera local fallback shows trace UI and accept disabled until ready", async ({ page }) => {
  await page.goto("/#onboard");
  await page.locator("#onboard-name").fill("Test User");
  await page.locator("#onboard-email").fill("test@example.com");
  await page.locator("#onboard-group-mode-create").check();
  await page.locator("#onboard-group-name").fill("Smoke Team");
  await page.locator("#onboard-submit").click();
  await page.evaluate(() => {
    window.location.hash = "#camera";
  });
  await expect(page.locator("#screen-camera")).toHaveClass(/active/);

  const accept = page.locator("#simulate-verify");
  await expect(accept).toBeDisabled();
  await expect(page.locator(".device-frame")).toHaveClass(/camera-full/);
});

test("camera requests front camera + stage is full-screen with UI toggle", async ({ page }) => {
  await page.addInitScript(() => {
    const calls = [];
    const mockStream = {
      getTracks() {
        return [];
      },
    };

    const mediaDevices = (navigator.mediaDevices ||= {});
    mediaDevices.getUserMedia = async (constraints) => {
      calls.push(constraints);
      return mockStream;
    };

    window.__pressureGetUserMediaCalls = calls;
  });

  // Ensure init scripts run on the next navigation (the shared beforeEach has already loaded a page).
  await page.goto("about:blank");

  await page.goto("/#onboard");
  await page.locator("#onboard-name").fill("Test User");
  await page.locator("#onboard-email").fill("test@example.com");
  await page.locator("#onboard-group-mode-create").check();
  await page.locator("#onboard-group-name").fill("Smoke Team");
  await page.locator("#onboard-submit").click();

  await page.evaluate(() => {
    window.location.hash = "#camera";
  });
  await expect(page.locator("#screen-camera")).toHaveClass(/active/);

  const calls = await page.evaluate(() => window.__pressureGetUserMediaCalls || []);
  expect(calls.length).toBeGreaterThan(0);
  const facing = calls[0]?.video?.facingMode;
  const facingValue = typeof facing === "string" ? facing : facing?.ideal || facing?.exact;
  expect(facingValue).toBe("user");

  await expect(page.locator(".device-frame")).toHaveClass(/camera-full/);

  const coach = page.locator(".camera-coach");
  await expect(coach).toBeHidden();
});

test("billing page loads and stripe health pill exists", async ({ page }) => {
  await page.goto("/#onboard");
  await page.locator("#onboard-name").fill("Test User");
  await page.locator("#onboard-email").fill("test@example.com");
  await page.locator("#onboard-group-mode-create").check();
  await page.locator("#onboard-group-name").fill("Smoke Team");
  await page.locator("#onboard-submit").click();

  await page.evaluate(() => {
    window.location.hash = "#billing";
  });
  await expect(page.locator("#screen-billing")).toHaveClass(/active/);
  await expect(page.locator("#stripe-health-pill")).toBeVisible();
});
