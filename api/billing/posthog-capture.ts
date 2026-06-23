const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';

export interface PostHogCaptureInput {
  event: string;
  distinctId: string;
  properties?: Record<string, unknown>;
  uuid?: string;
}

export async function capturePostHogEvent(input: PostHogCaptureInput): Promise<boolean> {
  const apiKey = process.env.POSTHOG_PROJECT_API_KEY
    ?? process.env.PUBLIC_POSTHOG_KEY
    ?? process.env.VITE_PUBLIC_POSTHOG_KEY;
  if (!apiKey?.trim()) {
    console.error('[posthog] Missing POSTHOG_PROJECT_API_KEY or PUBLIC_POSTHOG_KEY');
    return false;
  }

  const host = (process.env.POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST).replace(/\/$/, '');
  const body: Record<string, unknown> = {
    api_key: apiKey.trim(),
    event: input.event,
    distinct_id: input.distinctId,
    properties: {
      ...input.properties,
      $lib: 'localpdf-billing-webhook',
    },
  };
  if (input.uuid) {
    body.uuid = input.uuid;
  }

  const response = await fetch(`${host}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error('[posthog] capture failed', response.status, text);
    return false;
  }

  return true;
}
