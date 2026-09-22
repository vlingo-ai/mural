import { describe, expect, it, vi } from 'vitest';
import { observeBrowserOffline } from './browser-connectivity';

describe('observeBrowserOffline', () => {
  it('reports an offline browser immediately and can be detached', () => {
    const source = new EventTarget();
    const onOffline = vi.fn();
    const stop = observeBrowserOffline(onOffline, source);

    source.dispatchEvent(new Event('offline'));
    expect(onOffline).toHaveBeenCalledTimes(1);

    stop();
    source.dispatchEvent(new Event('offline'));
    expect(onOffline).toHaveBeenCalledTimes(1);
  });
});
