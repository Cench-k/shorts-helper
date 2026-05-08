"use client";

import { useEffect, useState } from "react";

import { loadKeys, saveKeys, type ApiKeys } from "@/lib/keys";

type Props = {
  open: boolean;
  onClose: () => void;
};

const fields: {
  key: keyof ApiKeys;
  label: string;
  placeholder: string;
  hint: string;
  href: string;
}[] = [
  {
    key: "groq",
    label: "Groq (STT, 무료 권장)",
    placeholder: "gsk_...",
    hint: "Groq Whisper 사용 시 필요",
    href: "https://console.groq.com/keys",
  },
  {
    key: "openai",
    label: "OpenAI (STT, 유료)",
    placeholder: "sk-...",
    hint: "OpenAI Whisper 사용 시 필요",
    href: "https://platform.openai.com/api-keys",
  },
  {
    key: "gemini",
    label: "Google Gemini (LLM, 무료 권장)",
    placeholder: "AIza...",
    hint: "하이라이트 선정용. 무료 한도 충분",
    href: "https://aistudio.google.com/apikey",
  },
  {
    key: "anthropic",
    label: "Anthropic Claude (LLM, 유료)",
    placeholder: "sk-ant-...",
    hint: "고품질 하이라이트 선정",
    href: "https://console.anthropic.com/settings/keys",
  },
];

export function SettingsModal({ open, onClose }: Props) {
  const [keys, setKeys] = useState<ApiKeys>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setKeys(loadKeys());
      setSaved(false);
    }
  }, [open]);

  if (!open) return null;

  function update(k: keyof ApiKeys, v: string) {
    setKeys((prev) => ({ ...prev, [k]: v.trim() || undefined }));
    setSaved(false);
  }

  function onSave() {
    saveKeys(keys);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>API 키 설정</h2>
          <button className="btn-ghost btn" onClick={onClose}>
            닫기
          </button>
        </div>

        <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
          키는 이 브라우저에만 저장됩니다 (localStorage). 사용하는 프로바이더만 입력하면 됩니다.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {fields.map((f) => (
            <div key={f.key}>
              <label
                style={{
                  display: "block",
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                {f.label}
              </label>
              <input
                className="input"
                type="password"
                placeholder={f.placeholder}
                value={keys[f.key] ?? ""}
                onChange={(e) => update(f.key, e.target.value)}
                autoComplete="off"
              />
              <div
                className="muted"
                style={{
                  fontSize: 12,
                  marginTop: 4,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>{f.hint}</span>
                <a
                  href={f.href}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--accent)" }}
                >
                  키 발급 →
                </a>
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 24,
            alignItems: "center",
          }}
        >
          {saved && <span className="muted" style={{ fontSize: 13 }}>저장됨 ✓</span>}
          <button className="btn" onClick={onSave}>
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
