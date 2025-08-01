import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

interface ESLintMessage {
  ruleId: string | null;
  severity: number;
  message: string;
  line: number;
  column: number;
  nodeType?: string;
  endLine?: number;
  endColumn?: number;
  fix?: unknown;
}

interface ESLintResult {
  filePath: string;
  messages: ESLintMessage[];
  errorCount: number;
  warningCount: number;
  fixableErrorCount: number;
  fixableWarningCount: number;
  source?: string;
}

function runESLint(filePath: string): ESLintResult[] {
  try {
    const output = execSync(`npx eslint ${filePath} -f json`, {
      encoding: "utf-8",
      stdio: "pipe",
    });
    const jsonStart = output.indexOf("[");
    if (jsonStart === -1) throw new Error("No JSON array found in ESLint output");
    return JSON.parse(output.slice(jsonStart));
  } catch (err: any) {
    const output = err.stdout?.toString() || err.stderr?.toString() || "";
    const jsonStart = output.indexOf("[");
    if (jsonStart !== -1) {
      try {
        return JSON.parse(output.slice(jsonStart));
      } catch {
        console.error("Failed to parse ESLint output JSON");
      }
    }
    console.error("ESLint failed and no JSON output could be parsed");
    return [];
  }
}

const localConfigPath = path.join("tests", "eslint.local.config.mjs");
const backupPath = path.join("tests", "eslint.local.config.backup.mjs");

const testCases: {
  name: string;
  code: string;
  expectedRule: string | null;
}[] = [
  {
    name: "unused variable (no-unused-vars)",
    code: `const unused = 42;`,
    expectedRule: "@typescript-eslint/no-unused-vars",
  },
  // {
  //    name: "use of any type (@typescript-eslint/no-explicit-any)",
  //    code: `function test(value: any) { return value; }`,
  //    expectedRule: "@typescript-eslint/no-explicit-any",
  //  },
  //  {
  //   name: "use of console (no-console)",
  //   code: `console.log("Hello");`,
  //   expectedRule: "no-console",
  // },
  {
    name: "prettier formatting issue (prettier/prettier)",
    code: `const   x =   1;`,
    expectedRule: "prettier/prettier",
  },
  {
    name: "clean code (no errors)",
    code: `function add(a: number, b: number) {\n  return a + b;\n}\n`,
    expectedRule: null,
  },
  // DRY-related test cases
  {
    name: "duplicate imports (no-duplicate-imports)",
    code: `
    import { a } from "module";
    import { b } from "module";
      `,
    expectedRule: "no-duplicate-imports",
  },
  {
    name: "variable redeclaration (no-redeclare)",
    code: `
    let x = 1;
    let x = 2;
      `,
    expectedRule: "no-redeclare",
  },
  {
    name: "useless rename in import (no-useless-rename)",
    code: `
    import { foo as foo } from "module";
      `,
    expectedRule: "no-useless-rename",
  },
  {
    name: "switch case fallthrough (no-fallthrough)",
    code: `
    switch (1) {
      case 1:
        console.log("one");
      case 2:
        console.log("two");
        break;
    }
      `,
    expectedRule: "no-fallthrough",
  },
  // SOLID-related test cases
  // Single Responsibility Principle
  {
    name: "too many params (max-params)",
    code: `function foo(a: number, b: number, c: number, d: number) { return a + b + c + d; }`,
    expectedRule: "max-params",
  },
  {
    name: "too deep nesting (max-depth)",
    code: `
    function nested(x: number) {
      if (x > 0) {
        if (x < 10) {
          if (x % 2 === 0) {
            if (x === 4) {
              console.log(x);
            }
          }
        }
      }
    }
    `,
    expectedRule: "max-depth",
  },
  {
    name: "high cognitive complexity (sonarjs/cognitive-complexity)",
    code: `
    function complex(x: number) {
      if (x > 0) {
        if (x < 10) {
          if (x !== 5) {
            while (x < 10) {
              x++;
              if (x % 2 === 0) {
                console.log("even");
              }
            }
          }
        }
      }
    }
    `,
    expectedRule: "sonarjs/cognitive-complexity",
  },
  {
    name: "duplicate string (sonarjs/no-duplicate-string)",
    code: `
    const msg1 = "hello world";
    const msg2 = "hello world";
    const msg3 = "hello world";
    `,
    expectedRule: "sonarjs/no-duplicate-string",
  },
  // Open/Closed Principle
  {
    name: "no abbreviations (unicorn/prevent-abbreviations)",
    code: `function handleCb(cb: () => void) {
        cb();
      }`,
    expectedRule: "unicorn/prevent-abbreviations",
  },
  {
    name: "duplicate functions (sonarjs/no-identical-functions)",
    code: `
      function a() {
        const name = "Alice";
        const age = 30;
        return { name, age };
      }
      
      function b() {
        const name = "Alice";
        const age = 30;
        return { name, age };
      }
`,
    expectedRule: "sonarjs/no-identical-functions",
  },

  // Liskov Substitution Principle
  {
    name: "explicit return type missing (@typescript-eslint/explicit-function-return-type)",
    code: `function foo() { return 1; }`,
    expectedRule: "@typescript-eslint/explicit-function-return-type",
  },
  {
    name: "use of null (unicorn/no-null)",
    code: `let foo: string | null = null;`,
    expectedRule: "unicorn/no-null",
  },
  // Interface Segregation Principle
  {
    name: "underscore dangle (no-underscore-dangle)",
    code: `
      const obj = {
        _private: 123,
        method() {
          return this._private;
        }
      };
    `,
    expectedRule: "no-underscore-dangle",
  },

  // Dependency Inversion Principle

  {
    name: "no-var-requires (@typescript-eslint/no-var-requires)",
    code: `const fs = require("fs");`,
    expectedRule: "@typescript-eslint/no-var-requires",
  },

];

test.describe("ESLint config validation (ESM)", () => {
  for (const { name, code, expectedRule } of testCases) {
    test(name, async () => {
      // Temporarily rename local override file if present inside tests folder
      let renamed = false;
      try {
        await fs.rename(localConfigPath, backupPath);
        renamed = true;
      } catch {}

      const fileName = `lint-demo-${name.replace(/[^a-z0-9\-]/gi, "-")}.ts`;
      const filePath = path.join("tests", fileName);

      await fs.mkdir("tests", { recursive: true });
      await fs.writeFile(filePath, code);

      const results = runESLint(filePath);
      const ruleIds: string[] = [];

      for (const fileResult of results) {
        if (Array.isArray(fileResult.messages)) {
          for (const message of fileResult.messages) {
            if (typeof message.ruleId === "string") {
              ruleIds.push(message.ruleId);
            }
          }
        }
      }

      console.log(`▶ Rule IDs for ${fileName}:`, ruleIds);

      if (expectedRule) {
        expect(ruleIds).toContain(expectedRule);
      } else {
        const ignored = ["prettier/prettier", "no-unused-vars", "@typescript-eslint/no-unused-vars", "unicorn/prevent-abbreviations", "@typescript-eslint/explicit-function-return-type",];
        const actualRelevant = ruleIds.filter((id) => !ignored.includes(id));
        expect(actualRelevant.length).toBe(0);
      }

      await fs.unlink(filePath);

      // Restore the override file if it was renamed
      if (renamed) {
        await fs.rename(backupPath, localConfigPath);
      }
    });
  }

  test("should not crash if tests/eslint.local.config.mjs is missing", async () => {
    const filePath = "tests/lint-no-override.ts";

    await fs.mkdir("tests", { recursive: true });
    await fs.writeFile(filePath, `const test = 1;`);

    let renamed = false;
    try {
      await fs.rename(localConfigPath, backupPath);
      renamed = true;
    } catch {}

    const results = runESLint(filePath);
    const ruleIds: string[] = [];

    for (const fileResult of results) {
      if (fileResult.messages) {
        for (const msg of fileResult.messages) {
          if (msg.ruleId) {
            ruleIds.push(msg.ruleId);
          }
        }
      }
    }

    console.log(`▶ Rule IDs for ${filePath}:`, ruleIds);

    expect(Array.isArray(ruleIds)).toBe(true);

    await fs.unlink(filePath);

    if (renamed) {
      await fs.rename(backupPath, localConfigPath);
    }
  });

  test("should apply local override config correctly", async () => {
    const configPath = "eslint.config.mjs";
    const filePath = "tests/lint-override-applied.mjs";
    const backupConfigPath = "eslint.config,mjs.backup";

    await fs.mkdir("tests", { recursive: true });

    // Backup eslint.config.js if it exists
    let backedUp = false;
    try {
      await fs.access(configPath);
      await fs.rename(configPath, backupConfigPath);
      backedUp = true;
      console.log("⚠️ Backed up original eslint.config.mjs");
    } catch {}

    try {
      // Step 1: Write override file inside tests folder
      await fs.writeFile(
        localConfigPath,
        `export default {
  rules: {
    'no-console': 'off'
  }
};`
      );

      // Step 2: Write the test ESLint config that uses the override
      await fs.writeFile(
        configPath,
        `
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import playwrightPlugin from "eslint-plugin-playwright";
import prettierPlugin from "eslint-plugin-prettier";

let localOverride = {};

try {
  localOverride = (await import("./tests/.eslint.local.config.js")).default;
  console.log("✅ Loaded local ESLint override config.");
} catch (err) {
  console.log("ℹ️ No local override config found.");
}

export default [
  {
    ignores: [],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
      parser: tsParser,
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      playwright: playwrightPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      "no-console": "error",
      "prettier/prettier": "error",
      ...(localOverride?.rules || {})
    },
  },
];
`
      );

      // Step 3: Write test file that triggers no-console
      await fs.writeFile(filePath, `console.log("This should pass");`);

      // Run ESLint normally (your runESLint function uses default config)
      const results = runESLint(filePath);
      const ruleIds: string[] = [];

      for (const fileResult of results) {
        if (fileResult.messages) {
          for (const msg of fileResult.messages) {
            if (msg.ruleId) {
              ruleIds.push(msg.ruleId);
            }
          }
        }
      }

      console.log(`▶ Rule IDs for override test:`, ruleIds);

      expect(ruleIds).not.toContain("no-console");

      // Clean up test files
      await fs.unlink(filePath);
      await fs.unlink(localConfigPath);
      await fs.unlink(configPath);
    } finally {
      // Restore original eslint.config.js if backed up
      if (backedUp) {
        await fs.rename(backupConfigPath, configPath);
        console.log("✅ Restored original eslint.config.js");
      }
    }
  });

  test("should fallback gracefully if local override config is broken", async () => {
    const filePath = "tests/lint-broken-override.ts";

    await fs.mkdir("tests", { recursive: true });

    // Write invalid override inside tests folder
    await fs.writeFile(
      localConfigPath,
      `export default {
  rules: {
    'no-console': 'off',
}; // syntax error`
    );

    await fs.writeFile(filePath, `const test = 1;`);

    const results = runESLint(filePath);
    const ruleIds: string[] = [];

    for (const fileResult of results) {
      if (fileResult.messages) {
        for (const msg of fileResult.messages) {
          if (msg.ruleId) {
            ruleIds.push(msg.ruleId);
          }
        }
      }
    }

    console.log(`▶ Rule IDs with broken override:`, ruleIds);

    expect(Array.isArray(ruleIds)).toBe(true);

    await fs.unlink(filePath);
    await fs.unlink(localConfigPath);
  });
});