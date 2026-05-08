"use client";

const STORAGE_KEY = "shorts_helper_api_keys_v1";

export type ApiKeys = {
  groq?: string;
  openai?: string;
  gemini?: string;
  anthropic?: string;
};

export function loadKeys(): ApiKeys {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ApiKeys;
  } catch {
    return {};
  }
}

export function saveKeys(keys: ApiKeys): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

export function getKey(provider: keyof ApiKeys): string | undefined {
  return loadKeys()[provider];
}
