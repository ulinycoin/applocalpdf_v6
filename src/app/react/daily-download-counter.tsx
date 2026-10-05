import { useEffect, useState } from 'react';
import { usePlatform } from './platform-context';
import { checkDailyFileQuota, dailyFileQuotaMessage, subscribeDailyFileQuota, type DailyFileQuotaCheck } from '../platform/daily-file-quota';

/**
 * Free-tier downloads left today. Mirrors `requestDailyDownloadAllowance` exactly: the counter is
 * only meaningful while the plan is `basic`, because every other plan is unlimited by definition.
 * Shown in the studio top bar and on the tool pages so the limit never arrives as a surprise.
 */
export function DailyDownloadCounter({ className = '' }: { className?: string }) {
  const { runtime } = usePlatform();
  const [plan, setPlan] = useState(() => runtime.billing.getContext().plan);
  const [quota, setQuota] = useState<DailyFileQuotaCheck>(() => checkDailyFileQuota());

  useEffect(() => {
    return runtime.billing.subscribe((context) => setPlan(context.plan));
  }, [runtime.billing]);

  useEffect(() => {
    return subscribeDailyFileQuota(() => setQuota(checkDailyFileQuota()));
  }, []);

  if (plan !== 'basic') {
    return null;
  }

  const exhausted = quota.remaining === 0;
  const label = exhausted
    ? 'No downloads left today'
    : `${quota.remaining} of ${quota.limit} downloads left today`;

  return (
    <span
      className={`daily-download-counter${exhausted ? ' daily-download-counter--exhausted' : ''}${className ? ` ${className}` : ''}`}
      title={dailyFileQuotaMessage()}
      role="status"
      aria-live="polite"
    >
      {label}
    </span>
  );
}
