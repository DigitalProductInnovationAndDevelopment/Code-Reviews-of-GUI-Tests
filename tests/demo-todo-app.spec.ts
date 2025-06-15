import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('https://demo.playwright.dev/todomvc');
});

const TODO_ITEMS = [
  'buy some cheese',
  'feed the cat',
  'book a doctors appointment'
] as const;

test.describe('New Todo', () => {
  test('should allow me to add todo items', async ({ page }) => {
    // create a new todo locator
    const newTodo = page.getByPlaceholder('What needs to be done?');

    // Screenshot: Initial state of the app
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/new-todo-initial-state.png` });

    // Create 1st todo.
    await newTodo.fill(TODO_ITEMS[0]);
    await newTodo.press('Enter');

    // Make sure the list only has one todo item.
    await expect(page.getByTestId('todo-title')).toHaveText([
      TODO_ITEMS[0]
    ]);
    // Screenshot: After adding first todo
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/new-todo-after-first-item.png` });

    // Create 2nd todo.
    await newTodo.fill(TODO_ITEMS[1]);
    await newTodo.press('Enter');

    // Make sure the list now has two todo items.
    await expect(page.getByTestId('todo-title')).toHaveText([
      TODO_ITEMS[0],
      TODO_ITEMS[1]
    ]);
    // Screenshot: After adding second todo
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/new-todo-after-second-item.png` });

    await checkNumberOfTodosInLocalStorage(page, 2);
  });

  test('should clear text input field when an item is added', async ({ page }) => {
    // create a new todo locator
    const newTodo = page.getByPlaceholder('What needs to be done?');

    // Screenshot: Before adding item to verify empty input
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/clear-input-before-add.png` });

    // Create one todo item.
    await newTodo.fill(TODO_ITEMS[0]);
    await newTodo.press('Enter');

    // Check that input is empty.
    await expect(newTodo).toBeEmpty();
    // Screenshot: After adding item to verify empty input
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/clear-input-after-add.png` });
    await checkNumberOfTodosInLocalStorage(page, 1);
  });

  test('should append new items to the bottom of the list', async ({ page }) => {
    // Screenshot: Before creating default todos
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/append-items-before-create.png` });

    // Create 3 items.
    await createDefaultTodos(page);

    // create a todo count locator
    const todoCount = page.getByTestId('todo-count')
    
    // Check test using different methods.
    await expect(page.getByText('3 items left')).toBeVisible();
    await expect(todoCount).toHaveText('3 items left');
    await expect(todoCount).toContainText('3');
    await expect(todoCount).toHaveText(/3/);

    // Check all items in one call.
    await expect(page.getByTestId('todo-title')).toHaveText(TODO_ITEMS);
    // Screenshot: After creating default todos
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/append-items-after-create.png` });
    await checkNumberOfTodosInLocalStorage(page, 3);
  });
});

test.describe('Mark all as completed', () => {
  test.beforeEach(async ({ page }) => {
    await createDefaultTodos(page);
    await checkNumberOfTodosInLocalStorage(page, 3);
  });

  test.afterEach(async ({ page }) => {
    await checkNumberOfTodosInLocalStorage(page, 3);
  });

  test('should allow me to mark all items as completed', async ({ page }) => {
    // Screenshot: Before marking all as complete
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/mark-all-before.png` });

    // Complete all todos.
    await page.getByLabel('Mark all as complete').check();

    // Ensure all todos have 'completed' class.
    await expect(page.getByTestId('todo-item')).toHaveClass(['completed', 'completed', 'completed']);
    // Screenshot: After marking all as complete
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/mark-all-after.png` });
    await checkNumberOfCompletedTodosInLocalStorage(page, 3);
  });

  test('should allow me to clear the complete state of all items', async ({ page }) => {
    const toggleAll = page.getByLabel('Mark all as complete');
    // Check and then immediately uncheck.
    await toggleAll.check();
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/clear-all-after-check.png` }); // State after checking
    await toggleAll.uncheck();

    // Should be no completed classes.
    await expect(page.getByTestId('todo-item')).toHaveClass(['', '', '']);
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/clear-all-after-uncheck.png` }); // State after unchecking
  });

  test('complete all checkbox should update state when items are completed / cleared', async ({ page }) => {
    const toggleAll = page.getByLabel('Mark all as complete');
    await toggleAll.check();
    await expect(toggleAll).toBeChecked();
    await checkNumberOfCompletedTodosInLocalStorage(page, 3);
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/toggle-all-checked.png` });

    // Uncheck first todo.
    const firstTodo = page.getByTestId('todo-item').nth(0);
    await firstTodo.getByRole('checkbox').uncheck();

    // Reuse toggleAll locator and make sure its not checked.
    await expect(toggleAll).not.toBeChecked();
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/toggle-all-first-unchecked.png` });

    await firstTodo.getByRole('checkbox').check();
    await checkNumberOfCompletedTodosInLocalStorage(page, 3);

    // Assert the toggle all is checked again.
    await expect(toggleAll).toBeChecked();
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/toggle-all-checked-again.png` });
  });
});

test.describe('Item', () => {

  test('should allow me to mark items as complete', async ({ page }) => {
    // create a new todo locator
    const newTodo = page.getByPlaceholder('What needs to be done?');

    // Create two items.
    for (const item of TODO_ITEMS.slice(0, 2)) {
      await newTodo.fill(item);
      await newTodo.press('Enter');
    }
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/mark-items-before-mark.png` }); // Before marking

    // Check first item.
    const firstTodo = page.getByTestId('todo-item').nth(0);
    await firstTodo.getByRole('checkbox').check();
    await expect(firstTodo).toHaveClass('completed');
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/mark-items-after-first-marked.png` }); // After first marked

    // Check second item.
    const secondTodo = page.getByTestId('todo-item').nth(1);
    await expect(secondTodo).not.toHaveClass('completed');
    await secondTodo.getByRole('checkbox').check();

    // Assert completed class.
    await expect(firstTodo).toHaveClass('completed');
    await expect(secondTodo).toHaveClass('completed');
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/mark-items-after-second-marked.png` }); // After second marked
  });

  test('should allow me to un-mark items as complete', async ({ page }) => {
    // create a new todo locator
    const newTodo = page.getByPlaceholder('What needs to be done?');

    // Create two items.
    for (const item of TODO_ITEMS.slice(0, 2)) {
      await newTodo.fill(item);
      await newTodo.press('Enter');
    }

    const firstTodo = page.getByTestId('todo-item').nth(0);
    const secondTodo = page.getByTestId('todo-item').nth(1);
    const firstTodoCheckbox = firstTodo.getByRole('checkbox');

    await firstTodoCheckbox.check();
    await expect(firstTodo).toHaveClass('completed');
    await expect(secondTodo).not.toHaveClass('completed');
    await checkNumberOfCompletedTodosInLocalStorage(page, 1);
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/unmark-items-after-first-marked.png` }); // Before unmarking

    await firstTodoCheckbox.uncheck();
    await expect(firstTodo).not.toHaveClass('completed');
    await expect(secondTodo).not.toHaveClass('completed');
    await checkNumberOfCompletedTodosInLocalStorage(page, 0);
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/unmark-items-after-first-unmarked.png` }); // After unmarking
  });

  test('should allow me to edit an item', async ({ page }) => {
    await createDefaultTodos(page);
    const todoItems = page.getByTestId('todo-item');
    const secondTodo = todoItems.nth(1);

    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/edit-item-before-edit.png` }); // Before editing

    await secondTodo.dblclick();
    await expect(secondTodo.getByRole('textbox', { name: 'Edit' })).toHaveValue(TODO_ITEMS[1]);
    await secondTodo.getByRole('textbox', { name: 'Edit' }).fill('buy some sausages');
    await secondTodo.getByRole('textbox', { name: 'Edit' }).press('Enter');

    // Explicitly assert the new text value.
    await expect(todoItems).toHaveText([
      TODO_ITEMS[0],
      'buy some sausages',
      TODO_ITEMS[2]
    ]);
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/edit-item-after-edit.png` }); // After editing
    await checkTodosInLocalStorage(page, 'buy some sausages');
  });
});

test.describe('Editing', () => {
  test.beforeEach(async ({ page }) => {
    await createDefaultTodos(page);
    await checkNumberOfTodosInLocalStorage(page, 3);
  });

  test('should hide other controls when editing', async ({ page }) => {
    const todoItem = page.getByTestId('todo-item').nth(1);
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/hide-controls-before-edit.png` }); // Before double-click
    await todoItem.dblclick();
    await expect(todoItem.getByRole('checkbox')).not.toBeVisible();
    await expect(todoItem.locator('label', {
      hasText: TODO_ITEMS[1],
    })).not.toBeVisible();
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/hide-controls-after-edit.png` }); // After double-click
    await checkNumberOfTodosInLocalStorage(page, 3);
  });

  test('should save edits on blur', async ({ page }) => {
    const todoItems = page.getByTestId('todo-item');
    await todoItems.nth(1).dblclick();
    await todoItems.nth(1).getByRole('textbox', { name: 'Edit' }).fill('buy some sausages');
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/save-blur-before-blur.png` }); // Before blur
    await todoItems.nth(1).getByRole('textbox', { name: 'Edit' }).dispatchEvent('blur');

    await expect(todoItems).toHaveText([
      TODO_ITEMS[0],
      'buy some sausages',
      TODO_ITEMS[2],
    ]);
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/save-blur-after-blur.png` }); // After blur
    await checkTodosInLocalStorage(page, 'buy some sausages');
  });

  test('should trim entered text', async ({ page }) => {
    const todoItems = page.getByTestId('todo-item');
    await todoItems.nth(1).dblclick();
    await todoItems.nth(1).getByRole('textbox', { name: 'Edit' }).fill('    buy some sausages    ');
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/trim-text-before-enter.png` }); // Before enter
    await todoItems.nth(1).getByRole('textbox', { name: 'Edit' }).press('Enter');

    await expect(todoItems).toHaveText([
      TODO_ITEMS[0],
      'buy some sausages',
      TODO_ITEMS[2],
    ]);
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/trim-text-after-enter.png` }); // After enter
    await checkTodosInLocalStorage(page, 'buy some sausages');
  });

  test('should remove the item if an empty text string was entered', async ({ page }) => {
    const todoItems = page.getByTestId('todo-item');
    await todoItems.nth(1).dblclick();
    await todoItems.nth(1).getByRole('textbox', { name: 'Edit' }).fill('');
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/remove-empty-before-enter.png` }); // Before enter
    await todoItems.nth(1).getByRole('textbox', { name: 'Edit' }).press('Enter');

    await expect(todoItems).toHaveText([
      TODO_ITEMS[0],
      TODO_ITEMS[2],
    ]);
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/remove-empty-after-enter.png` }); // After enter
  });

  test('should cancel edits on escape', async ({ page }) => {
    const todoItems = page.getByTestId('todo-item');
    await todoItems.nth(1).dblclick();
    await todoItems.nth(1).getByRole('textbox', { name: 'Edit' }).fill('buy some sausages');
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/cancel-escape-before-escape.png` }); // Before escape
    await todoItems.nth(1).getByRole('textbox', { name: 'Edit' }).press('Escape');
    await expect(todoItems).toHaveText(TODO_ITEMS);
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/cancel-escape-after-escape.png` }); // After escape
  });
});

test.describe('Counter', () => {
  test('should display the current number of todo items', async ({ page }) => {
    // create a new todo locator
    const newTodo = page.getByPlaceholder('What needs to be done?');
    
    // create a todo count locator
    const todoCount = page.getByTestId('todo-count')

    await newTodo.fill(TODO_ITEMS[0]);
    await newTodo.press('Enter');
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/counter-after-first.png` }); // After first item

    await expect(todoCount).toContainText('1');

    await newTodo.fill(TODO_ITEMS[1]);
    await newTodo.press('Enter');
    await expect(todoCount).toContainText('2');
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/counter-after-second.png` }); // After second item

    await checkNumberOfTodosInLocalStorage(page, 2);
  });
});

test.describe('Clear completed button', () => {
  test.beforeEach(async ({ page }) => {
    await createDefaultTodos(page);
  });

  test('should display the correct text', async ({ page }) => {
    await page.locator('.todo-list li .toggle').first().check();
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/clear-button-visible.png` }); // After checking, before verifying button
    await expect(page.getByRole('button', { name: 'Clear completed' })).toBeVisible();
  });

  test('should remove completed items when clicked', async ({ page }) => {
    const todoItems = page.getByTestId('todo-item');
    await todoItems.nth(1).getByRole('checkbox').check();
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/remove-completed-before-click.png` }); // Before clicking clear completed
    await page.getByRole('button', { name: 'Clear completed' }).click();
    await expect(todoItems).toHaveCount(2);
    await expect(todoItems).toHaveText([TODO_ITEMS[0], TODO_ITEMS[2]]);
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/remove-completed-after-click.png` }); // After clicking clear completed
  });

  test('should be hidden when there are no items that are completed', async ({ page }) => {
    await page.locator('.todo-list li .toggle').first().check();
    await page.getByRole('button', { name: 'Clear completed' }).click();
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/clear-button-hidden.png` }); // After clearing, before verifying hidden
    await expect(page.getByRole('button', { name: 'Clear completed' })).toBeHidden();
  });
});

test.describe('Persistence', () => {
  test('should persist its data', async ({ page }) => {
    // create a new todo locator
    const newTodo = page.getByPlaceholder('What needs to be done?');

    for (const item of TODO_ITEMS.slice(0, 2)) {
      await newTodo.fill(item);
      await newTodo.press('Enter');
    }

    const todoItems = page.getByTestId('todo-item');
    const firstTodoCheck = todoItems.nth(0).getByRole('checkbox');
    await firstTodoCheck.check();
    await expect(todoItems).toHaveText([TODO_ITEMS[0], TODO_ITEMS[1]]);
    await expect(firstTodoCheck).toBeChecked();
    await expect(todoItems).toHaveClass(['completed', '']);

    await checkNumberOfCompletedTodosInLocalStorage(page, 1);
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/persistence-before-reload.png` }); // Before reload

    // Now reload.
    await page.reload();
    await expect(todoItems).toHaveText([TODO_ITEMS[0], TODO_ITEMS[1]]);
    await expect(firstTodoCheck).toBeChecked();
    await expect(todoItems).toHaveClass(['completed', '']);
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/persistence-after-reload.png` }); // After reload
  });
});

test.describe('Routing', () => {
  test.beforeEach(async ({ page }) => {
    await createDefaultTodos(page);
    // make sure the app had a chance to save updated todos in storage
    // before navigating to a new view, otherwise the items can get lost :(
    // in some frameworks like Durandal
    await checkTodosInLocalStorage(page, TODO_ITEMS[0]);
  });

  test('should allow me to display active items', async ({ page }) => {
    const todoItem = page.getByTestId('todo-item');
    await page.getByTestId('todo-item').nth(1).getByRole('checkbox').check();

    await checkNumberOfCompletedTodosInLocalStorage(page, 1);
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/routing-active-before-click.png` }); // Before clicking active
    await page.getByRole('link', { name: 'Active' }).click();
    await expect(todoItem).toHaveCount(2);
    await expect(todoItem).toHaveText([TODO_ITEMS[0], TODO_ITEMS[2]]);
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/routing-active-after-click.png` }); // After clicking active
  });

  test('should respect the back button', async ({ page }) => {
    const todoItem = page.getByTestId('todo-item'); 
    await page.getByTestId('todo-item').nth(1).getByRole('checkbox').check();

    await checkNumberOfCompletedTodosInLocalStorage(page, 1);

    await test.step('Showing all items', async () => {
      await page.getByRole('link', { name: 'All' }).click();
      await expect(todoItem).toHaveCount(3);
      await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/routing-back-all.png` });
    });

    await test.step('Showing active items', async () => {
      await page.getByRole('link', { name: 'Active' }).click();
      await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/routing-back-active.png` });
    });

    await test.step('Showing completed items', async () => {
      await page.getByRole('link', { name: 'Completed' }).click();
      await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/routing-back-completed.png` });
    });

    await expect(todoItem).toHaveCount(1);
    await page.goBack();
    await expect(todoItem).toHaveCount(2);
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/routing-back-1-step.png` });
    await page.goBack();
    await expect(todoItem).toHaveCount(3);
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/routing-back-2-steps.png` });
  });

  test('should allow me to display completed items', async ({ page }) => {
    await page.getByTestId('todo-item').nth(1).getByRole('checkbox').check();
    await checkNumberOfCompletedTodosInLocalStorage(page, 1);
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/routing-completed-before-click.png` }); // Before clicking completed
    await page.getByRole('link', { name: 'Completed' }).click();
    await expect(page.getByTestId('todo-item')).toHaveCount(1);
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/routing-completed-after-click.png` }); // After clicking completed
  });

  test('should allow me to display all items', async ({ page }) => {
    await page.getByTestId('todo-item').nth(1).getByRole('checkbox').check();
    await checkNumberOfCompletedTodosInLocalStorage(page, 1);
    await page.getByRole('link', { name: 'Active' }).click();
    await page.getByRole('link', { name: 'Completed' }).click();
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/routing-all-before-click.png` }); // Before clicking all
    await page.getByRole('link', { name: 'All' }).click();
    await expect(page.getByTestId('todo-item')).toHaveCount(3);
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/routing-all-after-click.png` }); // After clicking all
  });

  test('should highlight the currently applied filter', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'All' })).toHaveClass('selected');
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/highlight-filter-all.png` }); // All filter selected
    
    //create locators for active and completed links
    const activeLink = page.getByRole('link', { name: 'Active' });
    const completedLink = page.getByRole('link', { name: 'Completed' });
    await activeLink.click();

    // Page change - active items.
    await expect(activeLink).toHaveClass('selected');
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/highlight-filter-active.png` }); // Active filter selected
    await completedLink.click();

    // Page change - completed items.
    await expect(completedLink).toHaveClass('selected');
    await page.screenshot({ path: `${process.env.PLAYWRIGHT_SCREENSHOT_DIR}/highlight-filter-completed.png` }); // Completed filter selected
  });
});

async function createDefaultTodos(page: Page) {
  // create a new todo locator
  const newTodo = page.getByPlaceholder('What needs to be done?');

  for (const item of TODO_ITEMS) {
    await newTodo.fill(item);
    await newTodo.press('Enter');
  }
}

async function checkNumberOfTodosInLocalStorage(page: Page, expected: number) {
  return await page.waitForFunction(e => {
    return JSON.parse(localStorage['react-todos']).length === e;
  }, expected);
}

async function checkNumberOfCompletedTodosInLocalStorage(page: Page, expected: number) {
  return await page.waitForFunction(e => {
    return JSON.parse(localStorage['react-todos']).filter((todo: any) => todo.completed).length === e;
  }, expected);
}

async function checkTodosInLocalStorage(page: Page, title: string) {
  return await page.waitForFunction(t => {
    return JSON.parse(localStorage['react-todos']).map((todo: any) => todo.title).includes(t);
  }, title);
}
