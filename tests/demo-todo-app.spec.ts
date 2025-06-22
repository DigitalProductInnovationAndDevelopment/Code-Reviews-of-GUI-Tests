import { test, expect } from '@playwright/test';

test.describe('Todo App Visual Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the ToDo app URL before each test
    await page.goto('https://demo.playwright.dev/todomvc');
  });

  test('should display the initial empty state correctly', async ({ page }) => {
    // Assert that the page title is correct
    await expect(page).toHaveTitle(/TodoMVC/);
    // ⭐ Visual Regression: Check the entire page's initial empty state
    await expect(page).toHaveScreenshot('initial-empty-state.png');
  });

  test('should allow adding new todo items and update count', async ({ page }) => {
    // Add first item
    await page.locator('.new-todo').fill('Buy milk');
    await page.locator('.new-todo').press('Enter');
    await expect(page.locator('.todo-count')).toHaveText('1 item left');
    // ⭐ Visual Regression: Check state after adding one item
    await expect(page).toHaveScreenshot('after-one-item.png');

    // Add second item
    await page.locator('.new-todo').fill('Walk the dog');
    await page.locator('.new-todo').press('Enter');
    await expect(page.locator('.todo-count')).toHaveText('2 items left');
    // ⭐ Visual Regression: Check state after adding two items
    await expect(page).toHaveScreenshot('after-two-items.png');
  });

  test('should mark an item as completed', async ({ page }) => {
    // Add an item
    await page.locator('.new-todo').fill('Learn Playwright');
    await page.locator('.new-todo').press('Enter');
    await expect(page.locator('.todo-count')).toHaveText('1 item left');

    // Mark as completed
    await page.locator('.toggle').check();
    await expect(page.locator('.todo-count')).toHaveText('0 items left');
    // ⭐ Visual Regression: Check state after completing an item
    await expect(page).toHaveScreenshot('item-completed.png');
  });

  test('should filter completed items', async ({ page }) => {
    // Add multiple items
    await page.locator('.new-todo').fill('Item 1');
    await page.locator('.new-todo').press('Enter');
    await page.locator('.new-todo').fill('Item 2');
    await page.locator('.new-todo').press('Enter');

    // Mark first item as completed
    await page.locator('.todo-list li').filter({ hasText: 'Item 1' }).locator('.toggle').check();

    // Click on "Completed" filter
    await page.locator('.filters >> text=Completed').click();
    // ⭐ Visual Regression: Check state with "Completed" filter active
    await expect(page).toHaveScreenshot('filter-completed.png');
  });

  test('should clear completed items', async ({ page }) => {
    // Add multiple items
    await page.locator('.new-todo').fill('Item 1');
    await page.locator('.new-todo').press('Enter');
    await page.locator('.new-todo').fill('Item 2');
    await page.locator('.new-todo').press('Enter');

    // Mark both items as completed
    await page.locator('.toggle').first().check();
    await page.locator('.toggle').last().check();

    // Clear completed
    await page.locator('.clear-completed').click();
    // ⭐ Visual Regression: Check state after clearing completed items
    await expect(page).toHaveScreenshot('after-clear-completed.png');
  });

});
