export function agentDisconnectIsTerminal(
  expectedIdentity: string | undefined,
  disconnectedIdentity: string,
  reconnecting: boolean,
): boolean {
  return !reconnecting && disconnectedIdentity === expectedIdentity;
}
