import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // @lebanon/core ships TypeScript source rather than a build step, so Next compiles it as part
  // of the app. That keeps one toolchain instead of a watch-and-rebuild loop in development.
  transpilePackages: ['@lebanon/core', '@lebanon/contracts'],
};

export default config;
