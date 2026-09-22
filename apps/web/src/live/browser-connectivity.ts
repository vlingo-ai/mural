export function observeBrowserOffline(
  onOffline: () => void,
  source: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> = globalThis,
): () => void {
  source.addEventListener('offline', onOffline);
  return () => source.removeEventListener('offline', onOffline);
}
