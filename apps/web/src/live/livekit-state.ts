export function agentDisconnectIsTerminal(
  expectedIdentity: string | undefined,
  disconnectedIdentity: string,
  reconnecting: boolean,
): boolean {
  return !reconnecting && disconnectedIdentity === expectedIdentity;
}

export function agentMediaIsReady(
  expectedIdentity: string | undefined,
  participants: Iterable<{ identity: string; audioTrackPublications: ReadonlyMap<string, { isSubscribed: boolean }> }>,
): boolean {
  if (!expectedIdentity) return false;
  for (const participant of participants) {
    if (participant.identity === expectedIdentity &&
        [...participant.audioTrackPublications.values()].some(publication => publication.isSubscribed)) return true;
  }
  return false;
}
