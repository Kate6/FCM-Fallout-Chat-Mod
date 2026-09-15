import * as ipaddr from 'ipaddr.js';

const EXTRA_RESERVED_V6 = [
  '64:ff9b:1::/48', // local-use translation
  '100::/64',       // discard-only
  '2001::/23',      // IETF protocol assignments (fail closed)
  '3ffe::/16',      // deprecated 6bone allocation
  '3fff::/20',      // documentation
  '5f00::/16',      // segment-routing SIDs
].map(value => ipaddr.parseCIDR(value) as [ipaddr.IPv6, number]);

const EXTRA_RESERVED_V4 = [
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16',
  '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24', '192.31.196.0/24',
  '192.52.193.0/24', '192.88.99.0/24', '192.168.0.0/16', '192.175.48.0/24',
  '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
].map(value => ipaddr.parseCIDR(value) as [ipaddr.IPv4, number]);

/** Fail-closed policy for addresses reached by server-side HTTP clients. */
export function isPublicNetworkAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  const parsed = ipaddr.parse(address);
  if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
    return isPublicNetworkAddress((parsed as ipaddr.IPv6).toIPv4Address().toString());
  }
  if (parsed.kind() === 'ipv6' && EXTRA_RESERVED_V6.some(range => (parsed as ipaddr.IPv6).match(range))) return false;
  if (parsed.kind() === 'ipv4' && EXTRA_RESERVED_V4.some(range => (parsed as ipaddr.IPv4).match(range))) return false;
  return parsed.range() === 'unicast';
}
