import { test, expect } from "@playwright/test";

// Static pages — no API needed.
test("home page renders and links to earnings", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Kickbacks-India/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /earnings/i })).toBeVisible();
});

test("earnings page prompts for a developer token", async ({ page }) => {
  await page.goto("/earnings");
  await expect(page.getByRole("heading", { name: /Developer earnings/i })).toBeVisible();
  await expect(page.getByPlaceholder("paste token")).toBeVisible();
});

test("admin console prompts for the admin key", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /Admin console/i })).toBeVisible();
  await expect(page.getByPlaceholder("x-admin-key")).toBeVisible();
});
