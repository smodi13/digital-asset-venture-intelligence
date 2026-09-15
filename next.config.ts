import type { NextConfig } from "next";

/**
 * Digital Asset Venture Intelligence build configuration.
 *
 * The application is statically prerendered except for one Node route
 * (/api/sourcing/run, which fetches a fixed allowlist of public RSS feeds).
 * It reads no environment variable and requires no credential, so the core
 * experience works with no account and no external paid service.
 *
 * The Turbopack root is pinned to this directory. Without it the bundler walks
 * upward looking for a lock file and can infer a root above the project, which
 * would pull unrelated directories into the build. Pinning it uses a value
 * resolved at build time rather than a hardcoded path, so no absolute path is
 * ever written into a source file.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Do not emit AGENTS.md / CLAUDE.md into the repo root on build. They are
  // generated content that would otherwise be scanned by the policy guards
  // (em dash, banned name) and are not part of this project's deliverables.
  agentRules: false,
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
