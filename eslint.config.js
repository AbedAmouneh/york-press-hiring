import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "node_modules", ".data", "server/db/migrations", "docs", "public"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: ["server/**/*.ts", "api/**/*.ts", "scripts/**/*.ts", "shared/**/*.ts", "*.config.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      // Third-party API payloads (PDL, SignalHire) are untyped at the boundary; allow `any` there but flag it.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error", "log"] }],
      eqeqeq: ["error", "smart"],
    },
  },
);
