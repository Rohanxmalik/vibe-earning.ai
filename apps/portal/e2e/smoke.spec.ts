import { test, expect } from "@playwright/test";

// Static pages — no API needed.
test("home page renders hero and links to both sides", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Sponsor the line/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Earn as a developer/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Advertise with us/i })).toBeVisible();
});

test("earnings page offers developer sign up and an extension-token option", async ({ page }) => {
  await page.goto("/earnings");
  await expect(page.getByRole("heading", { name: /Developer earnings/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Create developer account/i })).toBeVisible();
  await page.getByRole("button", { name: /Extension token/i }).click();
  await expect(page.getByPlaceholder("paste token")).toBeVisible();
});

test("admin console prompts for an admin login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /Operations console/i })).toBeVisible();
  await expect(page.getByLabel("Admin email")).toBeVisible();
});
