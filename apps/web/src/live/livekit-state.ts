export function agentDisconnectIsTerminal(
  expectedIdentity: string | undefined,
  disconnectedIdentity: string,
  reconnecting: boolean,
): boolean {
  return !reconnecting && disconnectedIdentity === expectedIdentity;
}

export function agentMediaIsReady(
  expectedIdentity: string | undefined,
  participants: Iterable<{ identity: string; audioTrackPublications: ReadonlyMap<string, unknown> }>,
): boolean {
  if (!expectedIdentity) return false;
  for (const participant of participants) {
    if (participant.identity === expectedIdentity && participant.audioTrackPublications.size > 0) return true;
  }
  return false;
}
