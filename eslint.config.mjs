import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import playwrightPlugin from "eslint-plugin-playwright";

let localOverride = {};

try {
  localOverride = (await import("./eslint.local.config.js")).default;
  console.log("✅ Loaded local ESLint override config from root.");
} catch (err) {
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
    },
    rules: {
      "no-unused-vars": "error",
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "playwright/no-wait-for-timeout": "error",
      ...(localOverride?.rules || {}),
    },
  },
];