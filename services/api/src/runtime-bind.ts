import { ServiceError } from './errors.js';

const supportedBindHosts = new Set(['127.0.0.1', '::1', '0.0.0.0', '::']);

/** Keep the historical container default while allowing a host-network deployment to stay private. */
export function bindHostFromEnvironment(environment: NodeJS.ProcessEnv): string {
  const host = environment.MURAL_BIND_HOST?.trim() || '0.0.0.0';
  if (!supportedBindHosts.has(host)) throw new ServiceError('service_configuration_invalid', 503);
  return host;
}
