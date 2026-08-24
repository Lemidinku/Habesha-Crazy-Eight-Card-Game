import { describe, expect, it, vi } from 'vitest';
import { withColdStartWarning } from './coldStart';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('withColdStartWarning', () => {
  it('calls onSlow once the delay elapses before the promise settles', async () => {
    const onSlow = vi.fn();
    let resolvePromise!: (value: string) => void;
    const slow = new Promise<string>((resolve) => {
      resolvePromise = resolve;
    });

    const wrapped = withColdStartWarning(slow, onSlow, 10);
    await wait(30);
    expect(onSlow).toHaveBeenCalledTimes(1);

    resolvePromise('done');
    await expect(wrapped).resolves.toBe('done');
  });

  it('does not call onSlow when the promise settles before the delay', async () => {
    const onSlow = vi.fn();
    const fast = Promise.resolve('fast');

    const wrapped = withColdStartWarning(fast, onSlow, 50);
    await expect(wrapped).resolves.toBe('fast');
    await wait(80);
    expect(onSlow).not.toHaveBeenCalled();
  });

  it('propagates a rejection without calling onSlow if it rejects before the delay', async () => {
    const onSlow = vi.fn();
    const failing = Promise.reject(new Error('boom'));

    const wrapped = withColdStartWarning(failing, onSlow, 50);
    await expect(wrapped).rejects.toThrow('boom');
    await wait(80);
    expect(onSlow).not.toHaveBeenCalled();
  });
});
