import { describe, test, expect } from 'bun:test';
import { headlessLaunchChannel, launchWithHeadlessChannelFallback } from '../src/browser-manager';

// On Windows, Playwright's default headless launch uses chrome-headless-shell.exe,
// a console-subsystem (WINDOWS_CUI) binary. When the browse server runs as a
// detached console-less daemon, that spawn allocates a fresh VISIBLE console
// window (the recurring "AppData\Loca…" popup). Full chrome.exe is GUI-subsystem
// and its new headless mode never allocates a console (microsoft/playwright#40741),
// so headless launches on win32 must opt into channel: 'chromium'.
describe('browser-manager: headlessLaunchChannel', () => {
  test('win32 + headless → chromium channel (avoids console-subsystem headless shell)', () => {
    expect(headlessLaunchChannel('win32', true)).toBe('chromium');
  });

  test('win32 + headed (extensions mode) → undefined (headed already uses full chromium)', () => {
    expect(headlessLaunchChannel('win32', false)).toBeUndefined();
  });

  test('linux + headless → undefined (no console subsystem; keep lighter headless shell)', () => {
    expect(headlessLaunchChannel('linux', true)).toBeUndefined();
  });

  test('darwin + headless → undefined (no console subsystem; keep lighter headless shell)', () => {
    expect(headlessLaunchChannel('darwin', true)).toBeUndefined();
  });
});

// The full-Chromium binary for the pinned playwright revision may be absent
// (e.g. only chromium_headless_shell-<rev> in the ms-playwright cache). A
// missing executable must degrade to the default headless shell — a console
// flash is annoying; a daemon that cannot launch any browser is broken.
describe('browser-manager: launchWithHeadlessChannelFallback', () => {
  const base = { headless: true, chromiumSandbox: false };

  test('no channel → launches once with base options unchanged', async () => {
    const calls: any[] = [];
    const launchFn = async (opts: any) => { calls.push(opts); return 'browser'; };
    const result = await launchWithHeadlessChannelFallback(launchFn, base, undefined);
    expect(result).toBe('browser');
    expect(calls.length).toBe(1);
    expect('channel' in calls[0]).toBe(false);
  });

  test('channel available → launches once with channel included', async () => {
    const calls: any[] = [];
    const launchFn = async (opts: any) => { calls.push(opts); return 'browser'; };
    const result = await launchWithHeadlessChannelFallback(launchFn, base, 'chromium');
    expect(result).toBe('browser');
    expect(calls.length).toBe(1);
    expect(calls[0].channel).toBe('chromium');
  });

  test('channel executable missing → retries without channel and succeeds', async () => {
    const calls: any[] = [];
    const launchFn = async (opts: any) => {
      calls.push(opts);
      if (opts.channel) throw new Error("browserType.launch: Executable doesn't exist at C:\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe");
      return 'fallback-browser';
    };
    const result = await launchWithHeadlessChannelFallback(launchFn, base, 'chromium');
    expect(result).toBe('fallback-browser');
    expect(calls.length).toBe(2);
    expect(calls[0].channel).toBe('chromium');
    expect('channel' in calls[1]).toBe(false);
  });

  test('unrelated launch error → propagates without retry', async () => {
    const calls: any[] = [];
    const launchFn = async (opts: any) => { calls.push(opts); throw new Error('browserType.launch: Timeout 30000ms exceeded'); };
    await expect(launchWithHeadlessChannelFallback(launchFn, base, 'chromium')).rejects.toThrow('Timeout');
    expect(calls.length).toBe(1);
  });
});
