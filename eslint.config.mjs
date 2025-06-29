import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

let localOverride = {};

try {
  localOverride = (await import("./eslint.local.config.js")).default;
  console.log("✅ Loaded local ESLint override config from root.");
} catch (err) {
  // No root override
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
    },
    rules: {
      "no-unused-vars": "off", 
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
      
      ...(localOverride?.rules || {}),
    },
  },
];