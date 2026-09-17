import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Emits a self-contained server with only the files it actually needs, so the runtime image
  // carries no node_modules tree and no build toolchain.
  output: 'standalone',
  /*
   * Puts the API on the SAME ORIGIN as the web app, so the session cookie is simply sent with
   * every request and there is no cross-site cookie problem to solve.
   *
   * Next bakes this target into the standalone build, so it cannot be repointed per environment
   * — which is why production does not rely on it: Caddy matches /api/* first and proxies
   * straight to the API container, so this rewrite never fires there and one image stays
   * portable across environments.
   */
  async rewrites() {
    const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:4100';
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default config;
