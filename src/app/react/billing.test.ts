import { test, describe, mock, beforeEach, after } from 'node:test';
import * as assert from 'node:assert';
import { resolveBillingDestination, openBillingPlans, openCheckout } from './billing';

describe('billing helpers', () => {
  const originalWindow = global.window;

  beforeEach(() => {
    mock.restoreAll();
    // @ts-expect-error Mocking window
    global.window = {
      location: {
        assign: mock.fn(),
      },
      open: mock.fn(),
    };
  });

  after(() => {
    global.window = originalWindow;
  });


  describe('resolveBillingDestination', () => {
    test('returns default when raw is undefined', () => {
      assert.strictEqual(resolveBillingDestination(undefined), '/pricing');
    });

    test('returns default when raw is empty string', () => {
      assert.strictEqual(resolveBillingDestination('   '), '/pricing');
    });

    test('returns custom value', () => {
      assert.strictEqual(resolveBillingDestination('/custom-pricing'), '/custom-pricing');
    });
  });

  describe('openBillingPlans', () => {
    test('returns destination without window context (SSR)', () => {
      // @ts-expect-error Mocking SSR
      delete global.window;
      
      assert.strictEqual(openBillingPlans(undefined), '/pricing');
      
      // Restore for next tests handled by beforeEach
    });

    test('opens absolute url in new tab', () => {
      const openSpy = window.open as any;
      
      const res = openBillingPlans('https://example.com/pricing');
      assert.strictEqual(res, 'https://example.com/pricing');
      assert.strictEqual(openSpy.mock.calls.length, 1);
      assert.deepStrictEqual(openSpy.mock.calls[0].arguments, ['https://example.com/pricing', '_blank', 'noopener,noreferrer']);
    });

    test('navigates internally for relative urls', () => {
      const assignSpy = window.location.assign as any;
      
      const res = openBillingPlans('/pricing');
      assert.strictEqual(res, '/pricing');
      assert.strictEqual(assignSpy.mock.calls.length, 1);
      assert.deepStrictEqual(assignSpy.mock.calls[0].arguments, ['/pricing']);
    });
  });


  describe('openCheckout', () => {
    test('does nothing if url is undefined', () => {
      const openSpy = window.open as any;
      openCheckout(undefined);
      assert.strictEqual(openSpy.mock.calls.length, 0);
    });

    test('falls back to window.open if LemonSqueezy is not available', () => {
      const openSpy = window.open as any;
      
      openCheckout('https://store.lemonsqueezy.com/checkout/buy/123');
      assert.strictEqual(openSpy.mock.calls.length, 1);
      assert.deepStrictEqual(openSpy.mock.calls[0].arguments, ['https://store.lemonsqueezy.com/checkout/buy/123', '_blank', 'noopener,noreferrer']);
    });


    test('uses LemonSqueezy overlay if available', () => {
      const openSpy = mock.method(window, 'open', () => null);
      const lsOpenSpy = mock.fn();
      
      // @ts-expect-error Mocking LS global
      window.LemonSqueezy = { Url: { Open: lsOpenSpy } };
      
      openCheckout('https://store.lemonsqueezy.com/checkout/buy/123');
      
      assert.strictEqual(lsOpenSpy.mock.calls.length, 1);
      assert.deepStrictEqual(lsOpenSpy.mock.calls[0].arguments, ['https://store.lemonsqueezy.com/checkout/buy/123']);
      assert.strictEqual(openSpy.mock.calls.length, 0);
      
      // @ts-expect-error Cleanup
      delete window.LemonSqueezy;
    });
  });
});
