
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import playwrightPlugin from "eslint-plugin-playwright";
import prettierPlugin from "eslint-plugin-prettier";
import importPlugin from "eslint-plugin-import";
import unicornPlugin from "eslint-plugin-unicorn";
import sonarjsPlugin from "eslint-plugin-sonarjs";

let localOverride = {};

try {
  localOverride = (await import("./.eslint.local.config.js")).default;
  console.log("✅ Loaded local ESLint override config.");
} catch (err) {
  console.log("ℹ️ No local override config found.");
}

export default [
  {
    ignores: [
      "node_modules",
      "dist",
      "coverage",
      "playwright-report",
      ".eslint.local.config.js",
      "*.config.js",
      "**/*.d.ts",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
      parser: tsParser,
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      playwright: playwrightPlugin,
      prettier: prettierPlugin,
      import: importPlugin,
      unicorn: unicornPlugin,
      sonarjs: sonarjsPlugin,
    },
    rules: {
      "playwright/no-wait-for-timeout": "error",
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
      "prettier/prettier": "error",

      // DRY rules
      "no-duplicate-imports": "error",
      "no-redeclare": "error",
      "no-useless-rename": "error",
      "no-fallthrough": "error",

      // SOLID principles enforcement
      // ===== Single Responsibility Principle (SRP) =====
      "max-lines-per-function": ["warn", 50],
      "complexity": ["warn", 8],               // Tighter cyclomatic complexity limit
      "max-params": ["warn", 3],               // Fewer params encourages focused funcs
      "max-statements": ["warn", 20],
      "max-depth": ["warn", 3],                // Limit nested blocks
      "sonarjs/cognitive-complexity": ["warn", 3],  // Cognitive complexity analysis
      "sonarjs/no-duplicate-string": ["warn",  { "threshold": 3 }],    // Avoid repeated logic

      // ===== Open/Closed Principle (OCP) =====
      "no-extend-native": "error",
      "prefer-object-spread": "warn",
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      "unicorn/prevent-abbreviations": "warn",  // Use meaningful names, better for extensibility
      "sonarjs/no-identical-functions": "warn", // Avoid duplicate implementations
      
      // ===== Liskov Substitution Principle (LSP) =====
      "@typescript-eslint/explicit-function-return-type": "warn",
      "@typescript-eslint/consistent-type-assertions": "error",
      "@typescript-eslint/no-empty-function": ["warn", { "allow": ["constructors"] }],
      "unicorn/no-null": "warn",               // Prefer undefined, avoids surprises in subtype behavior
      
      // ===== Interface Segregation Principle (ISP) =====
      "@typescript-eslint/no-unused-vars": ["error"],
      "@typescript-eslint/no-inferrable-types": "warn",
      "no-underscore-dangle": "warn",          // Avoid forcing "fat" interfaces/classes with internal details

      // ===== Dependency Inversion Principle (DIP) =====
      "import/no-cycle": "warn",
      "no-new": "warn",
      "@typescript-eslint/no-var-requires": "error",
      "import/no-extraneous-dependencies": ["error", { "devDependencies": false }],
      "unicorn/no-useless-undefined": "warn",  // Encourages explicit abstractions

      ...(localOverride?.rules || {}),
    },
  },
];
