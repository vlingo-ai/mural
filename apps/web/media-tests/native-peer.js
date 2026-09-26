// Test-only instrumentation; all media and connections still use native WebRTC.
const NativePeer = window.RTCPeerConnection;
const peers = new Set();
const detached = new Map();
window.RTCPeerConnection = class extends NativePeer {
  constructor(config, ...args) {
    super({ ...config, iceServers: [] }, ...args);
    peers.add(this);
  }
};

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
