import { Injectable, Logger } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { Coordinate } from '@lebanon/contracts';
import { ALLOWED_MAP_HOSTS, coordinateFromMapsUrl } from './location-input.parser.js';

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 5000;

/**
 * Expands a shortened Google Maps link to the coordinates it points at.
 *
 * This runs on the SERVER for two reasons: a browser cannot follow the redirect (CORS), and
 * fetching a user-supplied URL from inside our network is an SSRF vector. Every hop is checked
 * against a host allowlist AND resolved to a real address, so a link can never be used to reach
 * the loopback interface, the private network, or a cloud metadata endpoint.
 */
@Injectable()
export class MapsLinkResolver {
  private readonly logger = new Logger(MapsLinkResolver.name);

  async resolve(rawUrl: string): Promise<Coordinate | null> {
    let current = rawUrl;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      // A long link may already carry the coordinates; no request needed at all.
      const direct = coordinateFromMapsUrl(current);
      if (direct) return direct;

      const url = this.safeUrl(current);
      if (!url) return null;
      if (!(await this.isSafeHost(url.hostname))) return null;

      const next = await this.followOnce(url);
      if (!next) return null;
      current = next;
    }

    return coordinateFromMapsUrl(current);
  }

  private safeUrl(value: string): URL | null {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      if (!ALLOWED_MAP_HOSTS.has(url.hostname.toLowerCase())) {
        this.logger.warn(`Refusing to follow a link to a non-map host: ${url.hostname}`);
        return null;
      }
      return url;
    } catch {
      return null;
    }
  }

  /** Allowlisting the name is not enough — the name must not resolve somewhere private. */
  private async isSafeHost(hostname: string): Promise<boolean> {
    try {
      const { address } = await lookup(hostname);
      if (isPrivateAddress(address)) {
        this.logger.warn(`Refusing to follow ${hostname}: resolves to private address ${address}`);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Reads only the redirect chain — never the response body. */
  private async followOnce(url: URL): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'lebanon-cleaning/1.0' },
      });
      const location = response.headers.get('location');
      if (location) return new URL(location, url).toString();
      // Some short links land on a page whose canonical URL holds the coordinates.
      return response.url && response.url !== url.toString() ? response.url : null;
    } catch (error) {
      this.logger.warn(`Could not expand map link: ${String(error)}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Blocks loopback, private, link-local (incl. cloud metadata at 169.254.169.254) and unique-local. */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);

  if (version === 4) {
    const parts = address.split('.').map(Number) as [number, number, number, number];
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a >= 224) return true; // multicast and reserved
    return false;
  }

  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
    // IPv4-mapped addresses such as ::ffff:127.0.0.1
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return false;
  }

  return true; // not an address we can reason about
}
