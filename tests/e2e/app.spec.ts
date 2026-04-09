import { test, expect } from '@playwright/test';

test('FlowStudio loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/FlowStudio/i);
});

test('canvas is rendered', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('.react-flow');
  await expect(canvas).toBeVisible();
});
