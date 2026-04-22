import { test, expect } from '@playwright/test';

test('Santa Dash 3D Gameplay Test', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('THREE.Clock')) {
        consoleErrors.push(text);
      }
    }
  });

  // 1. Navigate to /
  await page.goto('http://0.0.0.0:4173/');

  // 2. Verify the page loads with the Start Run button visible
  const startButton = page.getByRole('button', { name: 'Start Run' });
  await expect(startButton).toBeVisible();
  
  // Report console errors so far
  if (consoleErrors.length > 0) {
    console.log('Console errors before start:', consoleErrors);
  }

  // 3. Click Start Run
  await startButton.click();

  // 4. Wait 2 seconds for the game to render
  await page.waitForTimeout(2000);

  // 5. Take a screenshot of the running gameplay
  await page.screenshot({ path: 'gameplay-start.png' });
  console.log('Saved screenshot: gameplay-start.png');

  // 6. Press Space twice to confirm jumps still work
  await page.keyboard.press(' ');
  await page.waitForTimeout(500); // Wait a bit between jumps
  await page.keyboard.press(' ');
  await page.waitForTimeout(1000); // Wait for the jumps to complete/game to continue

  // 7. Take a final screenshot
  await page.screenshot({ path: 'gameplay-final.png' });
  console.log('Saved screenshot: gameplay-final.png');

  // Final check for console errors
  if (consoleErrors.length > 0) {
    console.error('Test failed due to unexpected console errors:', consoleErrors);
    throw new Error('Unexpected console errors: ' + consoleErrors.join(', '));
  }
});
