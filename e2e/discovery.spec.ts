import { expect, test } from "@playwright/test";

test("public discovery is usable without a wallet", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /every mission deserves an ending/i })).toBeVisible();
  await page.getByRole("link", { name: /explore institutions/i }).click();
  await expect(page.getByRole("heading", { name: "Institutions" })).toBeVisible();
  await expect(page.getByText(/no institutions are available/i)).toBeVisible();
});

test("preview mode stays visibly separate from live records", async ({ page }) => {
  await page.goto("/institutions?demo=1");
  await expect(page.getByText(/interface preview/i)).toBeVisible();
});
