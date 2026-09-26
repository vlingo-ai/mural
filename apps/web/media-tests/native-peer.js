// Test-only instrumentation; all media and connections still use native WebRTC.
const NativePeer = window.RTCPeerConnection;
const peers = new Set();
const detached = new Map();
const diagnostics = new Map();
window.RTCPeerConnection = class extends NativePeer {
  constructor(config, ...args) {
    super({ ...config, iceServers: [] }, ...args);
    peers.add(this);
    const record = { candidates: [], errors: [] };
    diagnostics.set(this, record);
    this.addEventListener('icecandidate', ({ candidate }) => {
      if (candidate) record.candidates.push({ type: candidate.type,
        protocol: candidate.protocol, address: candidate.address });
    });
    this.addEventListener('icecandidateerror', event => record.errors.push(event.errorCode));
  }
};
// Never dump SDP, tokens, room metadata or ICE credentials.
window.rtcDiagnostics = () => [...diagnostics].map(([peer, record]) => ({
  connection: peer.connectionState, ice: peer.iceConnectionState,
  gathering: peer.iceGatheringState, ...record,
}));

export async function detachAudio(detach) {
  if (detach) {
    for (const peer of peers) for (const sender of peer.getSenders()) {
      if (sender.track?.kind !== 'audio') continue;
      detached.set(sender, sender.track);
      await sender.replaceTrack(null);
    }
    if (!detached.size) throw new Error('No native audio sender to detach');
  } else {
    for (const [sender, track] of detached) await sender.replaceTrack(track);
    detached.clear();
  }
  return detached.size;
}
