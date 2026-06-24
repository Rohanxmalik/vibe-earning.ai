import { test, expect } from "@playwright/test";

// Static pages — no API needed.
test("home page renders hero and links to both sides", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /while your AI/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Start earning/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Advertise with us/i }).first()).toBeVisible();
});

test("earnings page offers developer sign up and an extension-token option", async ({ page }) => {
  await page.goto("/earnings");
  await expect(page.getByRole("heading", { name: /Get paid for the line you already watch/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Create developer account/i })).toBeVisible();
  await page.getByRole("tab", { name: /Extension token/i }).click();
  await expect(page.getByPlaceholder("paste token")).toBeVisible();
});

test("faq page renders the long-form fraud + payout doc", async ({ page }) => {
  await page.goto("/faq");
  await expect(page.getByRole("heading", { name: /How earnings work/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /When & how do I get paid/i })).toBeVisible();
});

test("admin console prompts for an admin login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /Operations console/i })).toBeVisible();
  await expect(page.getByLabel("Admin email")).toBeVisible();
});
