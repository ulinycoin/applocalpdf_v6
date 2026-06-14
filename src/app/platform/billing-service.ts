import { type ToolRunContext } from '../../core/types/contracts';
import {
  getDefaultEntitlementsForPlan,
  normalizePlan,
  normalizeTier,
  sanitizeEntitlements,
} from './billing-contract';
import {
  getTrialState,
  markTrialTracked,
  startTrial,
  syncTrialStateWithIndexedDB,
} from './trial-manager';
import { trackMonetizationEvent } from '../react/monetization-telemetry';

export const BASIC_CONTEXT: ToolRunContext = {
  userId: 'local-user',
  plan: 'basic',
  entitlements: getDefaultEntitlementsForPlan('basic'),
};

export type BillingListener = (context: ToolRunContext) => void;

function decodeBase64UrlBinary(str: string, isBase64 = false): string {
  const b64 = isBase64 ? str : str.replace(/-/g, '+').replace(/_/g, '/');
  const padUrl = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=');
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(padUrl, 'base64').toString('binary');
  }
  return atob(padUrl);
}

function decodeBase64UrlUTF8(str: string): string {
  const binary = decodeBase64UrlBinary(str);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(binary, 'binary').toString('utf8');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export class BillingService {
  private currentContext: ToolRunContext = BASIC_CONTEXT;
  private listeners = new Set<BillingListener>();

  constructor(
    private readonly storageKey: string,
    private readonly jwtPublicKeyPem?: string,
  ) {}

  public getContext(): ToolRunContext {
    return this.currentContext;
  }

  public subscribe(listener: BillingListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.currentContext);
    }
  }

  public async initialize(): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      await syncTrialStateWithIndexedDB();
    }

    const trialState = getTrialState();
    if (trialState.isExpiredButNotTracked) {
      trackMonetizationEvent('trial_expired', { source: 'billing_init' });
      markTrialTracked();
    }

    const rawToken = typeof localStorage !== 'undefined' ? localStorage.getItem(this.storageKey) : null;
    if (!rawToken) {
      if (trialState.isActive) {
        this.currentContext = {
          userId: 'local-user',
          plan: 'pro',
          entitlements: getDefaultEntitlementsForPlan('trial'),
        };
      } else {
        this.currentContext = BASIC_CONTEXT;
      }
      this.notify();
      return;
    }

    const verified = await this.verifyToken(rawToken);
    if (!verified) {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(this.storageKey);
      }
      if (trialState.isActive) {
        this.currentContext = {
          userId: 'local-user',
          plan: 'pro',
          entitlements: getDefaultEntitlementsForPlan('trial'),
        };
      } else {
        this.currentContext = BASIC_CONTEXT;
      }
      this.notify();
      return;
    }

    this.currentContext = {
      userId: 'local-user',
      plan: verified.plan,
      entitlements: verified.entitlements,
    };

    // Если токен валиден и у пользователя был активен триал, отправляем trial_convert
    if (trialState.isActive || trialState.isExpiredButNotTracked) {
      trackMonetizationEvent('trial_convert', {
        trialDaysRemaining: trialState.daysRemaining,
        source: 'token_verified_init'
      });
      markTrialTracked();
    }

    this.notify();

    // Запускаем фоновое обновление токена, если до его истечения осталось менее 5 дней
    try {
      const parts = rawToken.split('.');
      const payload = JSON.parse(decodeBase64UrlUTF8(parts[1]));
      const now = Math.floor(Date.now() / 1000);
      if (typeof payload.exp === 'number' && (payload.exp - now) < 5 * 24 * 60 * 60) {
        this.refreshBillingToken(rawToken).then(async (newToken) => {
          if (newToken) {
            await this.saveToken(newToken);
          }
        }).catch(() => {});
      }
    } catch {}
  }

  public async saveToken(rawToken: string): Promise<boolean> {
    const verified = await this.verifyToken(rawToken);
    if (!verified) {
      return false;
    }

    const trialState = getTrialState();
    const wasTrial = trialState.isActive || trialState.isExpiredButNotTracked;

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.storageKey, rawToken);
      if (wasTrial) {
        trackMonetizationEvent('trial_convert', {
          trialDaysRemaining: trialState.daysRemaining,
          source: 'manual_save'
        });
        markTrialTracked();
      }
    }

    this.currentContext = {
      userId: 'local-user',
      plan: verified.plan,
      entitlements: verified.entitlements,
    };
    this.notify();
    return true;
  }

  public startTrial(): void {
    startTrial();
    this.currentContext = {
      userId: 'local-user',
      plan: 'pro',
      entitlements: getDefaultEntitlementsForPlan('trial'),
    };
    this.notify();
  }

  private async refreshBillingToken(token: string): Promise<string | null> {
    try {
      const response = await fetch('/api/billing/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (data.success && typeof data.token === 'string') {
        return data.token;
      }
    } catch (err) {
      console.error('Error in refreshBillingToken:', err);
    }
    return null;
  }

  private async verifyToken(token: string): Promise<{ plan: 'basic' | 'pro', entitlements: string[] } | null> {
    try {
      if (!this.jwtPublicKeyPem?.trim()) {
        return null;
      }

      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const header = JSON.parse(decodeBase64UrlUTF8(parts[0]));
      const payload = JSON.parse(decodeBase64UrlUTF8(parts[1]));
      const signatureBytes = Uint8Array.from(decodeBase64UrlBinary(parts[2]), c => c.charCodeAt(0));

      if (header.alg !== 'RS256' || header.typ !== 'JWT') return null;

      const now = Math.floor(Date.now() / 1000);
      if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
      if (typeof payload.iat !== 'number' || payload.iat > now + 300) return null;
      if (payload.nbf !== undefined && (typeof payload.nbf !== 'number' || payload.nbf > now + 300)) return null;
      if (payload.iss !== 'localpdf-billing') return null;
      if (payload.aud !== 'localpdf-v6') return null;
      if (typeof payload.sub !== 'string' || payload.sub.trim().length === 0) return null;

      const cleanPem = this.jwtPublicKeyPem.replace(/\\n/g, '\n');
      const pemContent = cleanPem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+/g, '');
      if (!pemContent) return null;
      const binaryDer = Uint8Array.from(decodeBase64UrlBinary(pemContent, true), c => c.charCodeAt(0));

      const cryptoLib = globalThis.crypto;
      if (!cryptoLib?.subtle) return null;
      const key = await cryptoLib.subtle.importKey(
        'spki',
        binaryDer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );

      const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
      const isValid = await cryptoLib.subtle.verify('RSASSA-PKCS1-v1_5', key, signatureBytes, signedData);
      if (!isValid) return null;

      const plan = normalizePlan(payload.plan);
      if (plan === 'trial') return null;
      const tier = normalizeTier(payload.tier, plan);
      if (!tier) return null;
      const entitlements = sanitizeEntitlements(payload.entitlements, plan);
      const defaultEntitlements = getDefaultEntitlementsForPlan(plan);

      return {
        plan,
        entitlements: entitlements.length > 0 ? entitlements : defaultEntitlements,
      };
    } catch {
      return null;
    }
  }
}
