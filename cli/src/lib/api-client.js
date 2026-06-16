import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const API_BASE = 'https://localpdf.online/api';
const CONFIG_DIR = join(homedir(), '.localpdf');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface LocalPdfConfig {
  apiKey?: string;
  tier?: string;
}

export function loadConfig(): LocalPdfConfig {
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }
  try {
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export function saveConfig(config: LocalPdfConfig): void {
  const { mkdirSync, writeFileSync } = require('fs');
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getApiKey(): string {
  const config = loadConfig();
  if (!config.apiKey) {
    console.error('Error: Not authenticated. Run: localpdf auth login');
    process.exit(1);
  }
  return config.apiKey;
}

export async function apiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const apiKey = getApiKey();

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `API error: ${response.status}`);
  }

  return data;
}

export async function validateApiKey(key: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/keys/validate`, {
      method: 'GET',
      headers: {
        'x-api-key': key,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}
