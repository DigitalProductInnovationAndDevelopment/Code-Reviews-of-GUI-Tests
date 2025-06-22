// eslint.config.js

import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import playwrightPlugin from "eslint-plugin-playwright";
import prettierPlugin from "eslint-plugin-prettier";

let localOverride = {};

try {
  // Dynamically import optional local config (ESM-compatible)
  localOverride = (await import("./eslint.local.config.js")).default;
  console.log("✅ Loaded local ESLint override config.");
} catch (err) {
  console.log("ℹ️ No local override config found.");
}

export default [
  // Ignore settings (replaces .eslintignore)
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

  // Linting rules for TypeScript/JavaScript
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
    },
    rules: {
      "no-unused-vars": "error",
      "playwright/no-wait-for-timeout": "error",
      "@typescript-eslint/no-explicit-any": "off", // change from off to error
      "no-console": "off", // add this
      "prettier/prettier": "error",
      ...(localOverride?.rules || {}),
    },
  },
];
