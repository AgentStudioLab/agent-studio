import pw from '/Users/yangjie.ugreen/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js';
const { chromium } = pw;

const file = process.argv[2];
const out = process.argv[3];
const scheme = process.argv[4] || 'dark';
const action = process.argv[5] || 'none';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    colorScheme: scheme,
    viewport: { width: 1640, height: 1380 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
  await page.goto('file://' + file);
  await page.waitForTimeout(2800);

  if (action === 'projects-nav') {
    await page.locator('aside button:has-text("Projects")').first().click();
    await page.waitForTimeout(600);
  } else if (action === 'newtask') {
    await page.locator('aside button:has-text("New task")').first().click();
    await page.waitForTimeout(800);
  } else if (action === 'task-identify') {
    await page.locator('aside button:has-text("Identify inactive projects")').first().click();
    await page.waitForTimeout(700);
  } else if (action === 'menu-on-identify') {
    const item = page.locator('div.item-row:has-text("Identify inactive projects")').first();
    await item.hover();
    await page.waitForTimeout(200);
    await item.locator('button.item-more').click();
    await page.waitForTimeout(500);
  } else if (action === 'user-popover') {
    // Open the UserBar popover by clicking the JY trigger
    await page.locator('div.user-bar-root button:has-text("Jay Yang")').first().click();
    await page.waitForTimeout(600);
  } else if (action === 'settings') {
    await page.locator('div.user-bar-root button:has-text("Jay Yang")').first().click();
    await page.waitForTimeout(400);
    await page.locator('div.menu-popup button:has-text("Settings")').click();
    await page.waitForTimeout(700);
  } else if (action === 'task-title-menu') {
    await page.locator('aside button:has-text("Identify inactive projects")').first().click();
    await page.waitForTimeout(700);
    await page.locator('div.task-title-menu-root button').first().click();
    await page.waitForTimeout(500);
  } else if (action === 'customize-home') {
    await page.locator('aside button:has-text("Customize")').first().click();
    await page.waitForTimeout(700);
  } else if (action === 'customize-skills') {
    await page.locator('aside button:has-text("Customize")').first().click();
    await page.waitForTimeout(500);
    await page.locator('aside button:has-text("Skills")').first().click();
    await page.waitForTimeout(500);
  } else if (action === 'customize-agents') {
    await page.locator('aside button:has-text("Customize")').first().click();
    await page.waitForTimeout(500);
    await page.locator('aside button:has-text("Agents")').first().click();
    await page.waitForTimeout(500);
  } else if (action === 'scheduled') {
    await page.locator('aside button:has-text("Scheduled")').first().click();
    await page.waitForTimeout(600);
  } else if (action === 'task-process') {
    await page.locator('aside button:has-text("Identify inactive projects")').first().click();
    await page.waitForTimeout(700);
  } else if (action === 'scheduled-modal') {
    await page.locator('aside button:has-text("Scheduled")').first().click();
    await page.waitForTimeout(500);
    await page.locator('main button:has-text("New task")').first().click();
    await page.waitForTimeout(500);
  } else if (action === 'scheduled-modal-freq') {
    await page.locator('aside button:has-text("Scheduled")').first().click();
    await page.waitForTimeout(500);
    await page.locator('main button:has-text("New task")').first().click();
    await page.waitForTimeout(400);
    await page.locator('button:has-text("Daily")').filter({ hasText: /^Daily$/ }).first().click();
    await page.waitForTimeout(400);
  } else if (action === 'scheduled-detail') {
    await page.locator('aside button:has-text("Scheduled")').first().click();
    await page.waitForTimeout(500);
    await page.locator('main button').filter({ hasText: 'Generate a morning briefing' }).first().click();
    await page.waitForTimeout(500);
  } else if (action === 'preview-pptx') {
    // Switch to task view, then click Files tab → click summary.pptx
    await page.locator('aside button:has-text("Identify inactive projects")').first().click();
    await page.waitForTimeout(700);
    await page.locator('aside[class*="320"] button[title="Files"]').first().click();
    await page.waitForTimeout(400);
    await page.locator('aside button:has-text("summary.pptx")').first().click();
    await page.waitForTimeout(600);
  } else if (action === 'preview-xlsx') {
    await page.locator('aside button:has-text("Identify inactive projects")').first().click();
    await page.waitForTimeout(700);
    await page.locator('aside[class*="320"] button[title="Files"]').first().click();
    await page.waitForTimeout(400);
    await page.locator('aside button:has-text("项目清理报告.xlsx")').first().click();
    await page.waitForTimeout(600);
  } else if (action === 'plugins') {
    await page.locator('aside button:has-text("Customize")').first().click();
    await page.waitForTimeout(500);
    await page.locator('aside button:has-text("Browse plugins")').first().click();
    await page.waitForTimeout(500);
  } else if (action === 'task-full-chat') {
    await page.locator('aside button:has-text("Identify inactive projects")').first().click();
    await page.waitForTimeout(700);
    // Scroll chat to bottom to show all rounds (especially round 3)
    await page.evaluate(() => {
      const scrollers = document.querySelectorAll('main .overflow-y-auto');
      scrollers.forEach((sc) => { sc.scrollTop = sc.scrollHeight; });
    });
    await page.waitForTimeout(400);
  }

  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
})();
