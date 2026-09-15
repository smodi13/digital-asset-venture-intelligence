import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Lint configuration.
 *
 * eslint-config-next 16 ships flat configs directly, so they are composed here
 * rather than bridged through the legacy compatibility layer.
 */
const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "next-env.d.ts",
      "data/generated/**",
      "local-artifacts/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
];

export default config;
