export function observeBrowserOffline(
  onOffline: () => void,
  source: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> = globalThis,
  onOnline?: () => void,
): () => void {
  source.addEventListener('offline', onOffline);
  if (onOnline) source.addEventListener('online', onOnline);
  return () => {
    source.removeEventListener('offline', onOffline);
    if (onOnline) source.removeEventListener('online', onOnline);
  };
}
