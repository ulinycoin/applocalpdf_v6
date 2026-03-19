import { type ToolRunContext } from '../../core/types/contracts';

export const BASIC_CONTEXT: ToolRunContext = {
  userId: 'local-user',
  plan: 'basic',
  entitlements: [],
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
    private readonly jwtPublicKeyMap?: string,
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
    const rawToken = typeof localStorage !== 'undefined' ? localStorage.getItem(this.storageKey) : null;
    if (!rawToken) {
      this.currentContext = BASIC_CONTEXT;
      this.notify();
      return;
    }

    const verified = await this.verifyToken(rawToken);
    if (!verified) {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(this.storageKey);
      }
      this.currentContext = BASIC_CONTEXT;
      this.notify();
      return;
    }

    this.currentContext = {
      userId: 'local-user',
      plan: verified.plan,
      entitlements: verified.entitlements,
    };
    this.notify();
  }

  public async saveToken(rawToken: string): Promise<boolean> {
    const verified = await this.verifyToken(rawToken);
    if (!verified) {
      return false;
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.storageKey, rawToken);
    }

    this.currentContext = {
      userId: 'local-user',
      plan: verified.plan,
      entitlements: verified.entitlements,
    };
    this.notify();
    return true;
  }

  private async verifyToken(token: string): Promise<{ plan: 'basic' | 'pro', entitlements: string[] } | null> {
    try {
      if (!this.jwtPublicKeyMap) {
        return null; // Silent fail if no public key is explicitly provided to verify
      }

      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const header = JSON.parse(decodeBase64UrlUTF8(parts[0]));
      const payload = JSON.parse(decodeBase64UrlUTF8(parts[1]));
      const signatureBytes = Uint8Array.from(decodeBase64UrlBinary(parts[2]), c => c.charCodeAt(0));

      if (header.alg !== 'RS256') return null;

      // Check Expiry
      const now = Math.floor(Date.now() / 1000);
      if (typeof payload.exp === 'number' && payload.exp < now) {
        return null;
      }

      // Verify RS256 Signature
      const pemContent = this.jwtPublicKeyMap.replace(/(-----(BEGIN|END) (RSA )?PUBLIC KEY-----|\n|\r)/g, '');
      const binaryDer = Uint8Array.from(decodeBase64UrlBinary(pemContent, true), c => c.charCodeAt(0));

      // Global web crypto or node polyfilled crypto
      const cryptoLib = typeof crypto !== 'undefined' ? crypto : (await import('crypto')).webcrypto as unknown as Crypto;
      const key = await cryptoLib.subtle.importKey(
        'spki',
        binaryDer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );

      const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
      const isValid = await cryptoLib.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        key,
        signatureBytes,
        signedData
      );

      if (!isValid) return null;

      return {
        plan: payload.plan === 'pro' ? 'pro' : 'basic',
        entitlements: Array.isArray(payload.entitlements) ? payload.entitlements : [],
      };
    } catch {
      return null;
    }
  }
}
