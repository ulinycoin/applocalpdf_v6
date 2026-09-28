/**
 * Storage half of the developer Pro override.
 *
 * The 3-day trial is retired (see `studio-paywall.activateProTrial`) and there is
 * no in-product way to reach Pro without buying, so there was no way to exercise
 * Pro features locally. This is the switch that closes that gap.
 *
 * The *policy* — whether the override is allowed at all — lives in
 * `BillingService` and is wired to `import.meta.env.DEV`. These helpers are
 * deliberately dumb: they only read and write a flag, so a hand-written
 * localStorage entry can never unlock Pro on its own. In a production build the
 * policy is a literal `false` and every path below is unreachable.
 */
export const LOCAL_PRO_STORAGE_KEY = 'localpdf_dev_pro_override';

export function readLocalProOverride(): boolean {
  if (typeof localStorage === 'undefined') {
    return false;
  }
  try {
    return localStorage.getItem(LOCAL_PRO_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeLocalProOverride(enabled: boolean): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    if (enabled) {
      localStorage.setItem(LOCAL_PRO_STORAGE_KEY, '1');
    } else {
      localStorage.removeItem(LOCAL_PRO_STORAGE_KEY);
    }
  } catch {
    // Private mode / storage disabled — the override silently stays off.
  }
}
