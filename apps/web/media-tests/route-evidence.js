// This fixture intentionally supports IPv4 only; never guess a hidden address.
function ipv4(value) {
  return typeof value === 'string' && /^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(value) &&
    value.split('.').every(part => Number(part) <= 255);
}

export function resolveMediaRoute(local, remote, nativePairs) {
  const validPort = value => Number.isInteger(value) && value > 0 && value <= 65535;
  if (!local || !remote || !validPort(local.port) || !validPort(remote.port) ||
      local.protocol !== remote.protocol || !['udp', 'tcp'].includes(local.protocol)) return null;
  const matches = nativePairs.filter(pair => pair?.local?.port === local.port &&
    pair?.remote?.port === remote.port && pair.local.protocol === local.protocol &&
    pair.remote.protocol === remote.protocol);
  const address = (stats, side) => {
    const values = [stats.address, stats.ip, ...matches.map(pair => pair[side].address)].filter(ipv4);
    if (new Set(values).size > 1) throw new Error('Conflicting selected ICE address evidence');
    return values[0];
  };
  return { protocol: local.protocol, localPort: local.port, remotePort: remote.port,
    localAddress: address(local, 'local'), remoteAddress: address(remote, 'remote') };
}
