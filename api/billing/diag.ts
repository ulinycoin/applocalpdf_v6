/**
 * TEMPORARY diagnostic route. It exists to surface why `./refresh` (and anything importing a sibling
 * api file) fails at runtime in production, where the platform gives no logs without an authenticated
 * CLI. Delete it once the cause is fixed.
 */
export default async function handler(_req: any, res: any) {
  const report: Record<string, unknown> = { node: process.version };

  const probe = async (name: string, load: () => Promise<unknown>) => {
    try {
      const mod: any = await load();
      report[name] = { ok: true, exports: Object.keys(mod) };
    } catch (error: any) {
      report[name] = {
        ok: false,
        name: error?.name,
        code: error?.code,
        message: String(error?.message ?? error),
        stack: String(error?.stack ?? '').split('\n').slice(0, 6),
      };
    }
  };

  await probe('restore', () => import('./restore'));
  await probe('refresh', () => import('./refresh'));
  return res.status(200).json(report);
}
