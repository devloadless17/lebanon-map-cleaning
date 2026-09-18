import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import type { NextConfig } from 'next';

/*
 * The repo keeps one .env at the root, but Next only looks inside apps/web. Loading it here
 * covers dev, build and start alike — and it has to happen at BUILD time, because
 * NEXT_PUBLIC_* values are compiled into the client bundle rather than read at runtime.
 * A CLI wrapper would do the same job only when its binary is on PATH, which is a promise
 * the build environment does not always keep.
 *
 * No-op where the file is absent (Vercel), and dotenv never overrides a real variable.
 */
loadEnv({ path: path.resolve(process.cwd(), '../../.env'), quiet: true });

const config: NextConfig = {
  reactStrictMode: true,
  // @lebanon/core ships TypeScript source rather than a build step, so Next compiles it as part
  // of the app. That keeps one toolchain instead of a watch-and-rebuild loop in development.
  transpilePackages: ['@lebanon/core', '@lebanon/contracts'],
};

export default config;
