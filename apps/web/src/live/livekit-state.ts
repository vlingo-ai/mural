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

export function microphoneIsReady(
  track: MediaStreamTrack | undefined,
  publications: Iterable<{ source: string; isMuted: boolean; track?: { mediaStreamTrack: MediaStreamTrack } | undefined }>,
): boolean {
  if (!track || track.readyState !== 'live') return false;
  for (const publication of publications) {
    if (publication.source === 'microphone' && !publication.isMuted &&
        publication.track?.mediaStreamTrack === track) return true;
  }
  return false;
}
