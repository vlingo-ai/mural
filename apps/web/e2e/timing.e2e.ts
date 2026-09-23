import { expect, test } from '@playwright/test';

test('timing diagnostic is opt-in and contains no conversation content', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Staging timing diagnostic')).toHaveCount(0);
  await page.goto('/?timing=1');
  await expect(page.getByText('Staging timing diagnostic')).toBeVisible();
  await page.getByText('Staging timing diagnostic').click();
  const report = page.locator('.timing-diagnostic pre');
  await expect(report).toContainText('"firstAudioMs": null');
  await expect(report).not.toContainText('transcript');
  await expect(report).not.toContainText('sessionID');
});
