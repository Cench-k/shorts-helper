"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { SettingsModal } from "@/components/SettingsModal";
import {
  fetchCriteria,
  fetchYouTubeMeta,
  fileUrl,
  getJob,
  selectHighlights,
  startRender,
  transcribe,
  uploadVideo,
  type CropMode,
  type Highlight,
  type HighlightCriteria,
  type JobStatus,
  type LLMProvider,
  type STTProvider,
  type Transcript,
  type UploadMeta,
  type YouTubeMeta,
} from "@/lib/api";
import { getKey } from "@/lib/keys";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getTranscriptText(
  transcript: Transcript | null,
  start: number,
  end: number,
): string {
  if (!transcript) return "";
  const parts: string[] = [];
  for (const s of transcript.segments) {
    if (s.end <= start || s.start >= end) continue;
    parts.push(s.text.trim());
  }
  return parts.join(" ");
}

function youtubeUrlAt(meta: YouTubeMeta | null, seconds: number): string | null {
  if (!meta) return null;
  if (!meta.webpage_url || !meta.webpage_url.includes("youtube.com") && !meta.webpage_url.includes("youtu.be")) {
    return null;
  }
  const t = Math.max(0, Math.floor(seconds));
  const sep = meta.webpage_url.includes("?") ? "&" : "?";
  return `${meta.webpage_url}${sep}t=${t}s`;
}

function TimeAdjuster({
  label,
  value,
  onChange,
  onNudge,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onNudge: (delta: number) => void;
}) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
        {label} ({formatDuration(value)})
      </div>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <button
          className="btn-ghost btn"
          style={{ padding: "4px 8px", fontSize: 11 }}
          onClick={() => onNudge(-1)}
          title="-1초"
        >
          −1
        </button>
        <button
          className="btn-ghost btn"
          style={{ padding: "4px 8px", fontSize: 11 }}
          onClick={() => onNudge(-0.5)}
          title="-0.5초"
        >
          −.5
        </button>
        <input
          className="input"
          type="number"
          step={0.1}
          value={value}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!Number.isNaN(v)) onChange(v);
          }}
          style={{ flex: 1, fontSize: 12, padding: "4px 6px", minWidth: 60 }}
        />
        <button
          className="btn-ghost btn"
          style={{ padding: "4px 8px", fontSize: 11 }}
          onClick={() => onNudge(0.5)}
          title="+0.5초"
        >
          +.5
        </button>
        <button
          className="btn-ghost btn"
          style={{ padding: "4px 8px", fontSize: 11 }}
          onClick={() => onNudge(1)}
          title="+1초"
        >
          +1
        </button>
      </div>
    </div>
  );
}

function NewInner() {
  const params = useSearchParams();
  const mode = params.get("mode") === "many-to-many" ? "many-to-many" : "one-to-many";

  const [url, setUrl] = useState("");
  const [metaLoading, setMetaLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<YouTubeMeta | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadMeta, setUploadMeta] = useState<UploadMeta | null>(null);

  const [provider, setProvider] = useState<STTProvider>("groq");
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [cropMode, setCropMode] = useState<CropMode>("9:16-center");
  const [burnSubtitles, setBurnSubtitles] = useState(true);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);

  const [criteriaPresets, setCriteriaPresets] = useState<HighlightCriteria[]>([]);
  const [selectedCriteria, setSelectedCriteria] = useState<string[]>([
    "hook",
    "emotional_peak",
    "key_message",
  ]);
  const [minSec, setMinSec] = useState(20);
  const [maxSec, setMaxSec] = useState(60);
  const [llmProvider, setLlmProvider] = useState<LLMProvider>("gemini");
  const [selecting, setSelecting] = useState(false);
  const [highlights, setHighlights] = useState<Highlight[] | null>(null);

  useEffect(() => {
    fetchCriteria()
      .then(setCriteriaPresets)
      .catch(() => setCriteriaPresets([]));
  }, []);

  useEffect(() => {
    if (!renderJobId) return;
    let stop = false;
    const tick = async () => {
      try {
        const s = await getJob(renderJobId);
        if (stop) return;
        setJobStatus(s);
        if (s.status === "completed" || s.status === "failed") return;
      } catch {
        // ignore transient
      }
      if (!stop) setTimeout(tick, 1500);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [renderJobId]);

  function addCriteria(name: string) {
    setSelectedCriteria((prev) => [...prev, name]);
  }
  function removeCriteriaAt(idx: number) {
    setSelectedCriteria((prev) => prev.filter((_, i) => i !== idx));
  }
  function moveCriteria(idx: number, dir: -1 | 1) {
    setSelectedCriteria((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  async function onFetchMeta() {
    if (!url.trim()) return;
    setMetaLoading(true);
    setError(null);
    setMeta(null);
    setFileId(null);
    setUploadMeta(null);
    setTranscript(null);
    setHighlights(null);
    try {
      const m = await fetchYouTubeMeta(url.trim());
      setMeta(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setMetaLoading(false);
    }
  }

  async function onUploadFile(file: File) {
    setError(null);
    setMeta(null);
    setUrl("");
    setFileId(null);
    setUploadMeta(null);
    setTranscript(null);
    setHighlights(null);
    setUploadProgress(0);
    try {
      const um = await uploadVideo(file, (loaded, total) => {
        setUploadProgress(Math.round((loaded / total) * 100));
      });
      setUploadMeta(um);
      setFileId(um.file_id);
      setMeta({
        id: um.file_id,
        title: um.title,
        duration: um.duration,
        thumbnail: um.thumbnail ? fileUrl(um.thumbnail) : null,
        channel: "(업로드 파일)",
        upload_date: null,
        webpage_url: "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploadProgress(null);
    }
  }

  async function onTranscribe() {
    if (!meta) return;
    const apiKey = getKey(provider);
    if (!apiKey) {
      setError(
        `${provider} API 키가 없습니다. 우측 상단 "설정"에서 키를 입력하세요.`,
      );
      return;
    }
    setTranscribing(true);
    setError(null);
    setTranscript(null);
    setHighlights(null);
    try {
      const t = await transcribe({
        url: fileId ? undefined : url.trim(),
        fileId: fileId ?? undefined,
        provider,
        apiKey,
      });
      setTranscript(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "트랜스크립트 실패");
    } finally {
      setTranscribing(false);
    }
  }

  async function onSelectHighlights() {
    if (!transcript) return;
    if (selectedCriteria.length === 0) {
      setError("기준을 최소 1개 이상 선택하세요");
      return;
    }
    const keyName = llmProvider === "gemini" ? "gemini" : "anthropic";
    const apiKey = getKey(keyName);
    if (!apiKey) {
      setError(
        `${keyName} API 키가 없습니다. 우측 상단 "설정"에서 키를 입력하세요.`,
      );
      return;
    }
    setSelecting(true);
    setError(null);
    setHighlights(null);
    try {
      const h = await selectHighlights({
        transcript,
        criteriaList: selectedCriteria,
        minSeconds: minSec,
        maxSeconds: maxSec,
        provider: llmProvider,
        apiKey,
      });
      setHighlights(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : "하이라이트 선정 실패");
    } finally {
      setSelecting(false);
    }
  }

  function labelOf(name: string): string {
    return criteriaPresets.find((c) => c.name === name)?.label ?? name;
  }

  function round1(n: number): number {
    return Math.round(n * 10) / 10;
  }

  function clampCut(start: number, end: number): { start: number; end: number } {
    const maxDuration = meta?.duration ?? Infinity;
    const s = Math.max(0, Math.min(maxDuration - 0.1, start));
    const e = Math.max(s + 0.1, Math.min(maxDuration, end));
    return { start: round1(s), end: round1(e) };
  }

  function updateCut(hIdx: number, cIdx: number, patch: { start?: number; end?: number }) {
    setHighlights((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const cuts = [...next[hIdx].cuts];
      const merged = { ...cuts[cIdx], ...patch };
      const clamped = clampCut(merged.start, merged.end);
      cuts[cIdx] = { ...merged, ...clamped };
      next[hIdx] = { ...next[hIdx], cuts };
      return next;
    });
  }

  function nudgeCut(hIdx: number, cIdx: number, field: "start" | "end", delta: number) {
    if (!highlights) return;
    const cur = highlights[hIdx].cuts[cIdx][field];
    updateCut(hIdx, cIdx, { [field]: cur + delta });
  }

  function removeCut(hIdx: number, cIdx: number) {
    setHighlights((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const cuts = next[hIdx].cuts.filter((_, i) => i !== cIdx);
      if (cuts.length === 0) return prev;
      next[hIdx] = { ...next[hIdx], cuts };
      return next;
    });
  }

  function addCut(hIdx: number) {
    setHighlights((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const lastCut = next[hIdx].cuts[next[hIdx].cuts.length - 1];
      const newStart = lastCut ? Math.min((meta?.duration ?? Infinity) - 3, lastCut.end + 1) : 0;
      const newEnd = Math.min(meta?.duration ?? Infinity, newStart + 3);
      next[hIdx] = {
        ...next[hIdx],
        cuts: [...next[hIdx].cuts, { start: round1(newStart), end: round1(newEnd), reason: "" }],
      };
      return next;
    });
  }

  function moveCut(hIdx: number, cIdx: number, dir: -1 | 1) {
    setHighlights((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const cuts = [...next[hIdx].cuts];
      const j = cIdx + dir;
      if (j < 0 || j >= cuts.length) return prev;
      [cuts[cIdx], cuts[j]] = [cuts[j], cuts[cIdx]];
      next[hIdx] = { ...next[hIdx], cuts };
      return next;
    });
  }

  async function onStartRender() {
    if (!highlights || !meta) return;
    setError(null);
    setJobStatus(null);
    try {
      const { job_id } = await startRender({
        url: fileId ? undefined : url.trim(),
        fileId: fileId ?? undefined,
        highlights,
        transcript,
        cropMode,
        burnSubtitles,
      });
      setRenderJobId(job_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "렌더 시작 실패");
    }
  }

  return (
    <div className="container">
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <Link href="/" className="muted" style={{ fontSize: 14 }}>
          ← 모드 선택으로
        </Link>
        <button className="btn btn-ghost" onClick={() => setSettingsOpen(true)}>
          ⚙️ 설정
        </button>
      </div>
      <h1 className="h1" style={{ marginTop: 8 }}>
        {mode === "one-to-many" ? "1개 영상 → N개 쇼츠" : "N개 영상 → N개 쇼츠"}
      </h1>
      <p className="muted" style={{ marginBottom: 32 }}>
        YouTube URL을 붙여넣거나, 로컬 영상 파일을 업로드하세요.
      </p>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <div className="card" style={{ marginBottom: 16 }}>
        <label
          style={{ display: "block", fontSize: 14, marginBottom: 8, fontWeight: 600 }}
        >
          YouTube URL
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onFetchMeta()}
            disabled={uploadProgress !== null}
          />
          <button
            className="btn"
            onClick={onFetchMeta}
            disabled={metaLoading || !url.trim() || uploadProgress !== null}
          >
            {metaLoading ? "조회 중..." : "확인"}
          </button>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            margin: "16px 0",
          }}
        >
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span className="muted" style={{ fontSize: 12 }}>또는</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>

        <label
          style={{ display: "block", fontSize: 14, marginBottom: 8, fontWeight: 600 }}
        >
          로컬 영상 파일 업로드
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            className="input"
            type="file"
            accept="video/mp4,video/quicktime,video/x-matroska,video/webm,video/x-msvideo,.mp4,.mov,.mkv,.webm,.avi,.m4v"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadFile(f);
              e.target.value = "";
            }}
            disabled={uploadProgress !== null || metaLoading}
            style={{ flex: 1 }}
          />
        </div>
        {uploadProgress !== null && (
          <div style={{ marginTop: 8 }}>
            <div
              style={{
                height: 4,
                background: "var(--border)",
                borderRadius: 2,
                overflow: "hidden",
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  width: `${uploadProgress}%`,
                  height: "100%",
                  background: "var(--accent)",
                  transition: "width 0.2s",
                }}
              />
            </div>
            <p className="muted" style={{ fontSize: 12 }}>
              업로드 중... {uploadProgress}%
            </p>
          </div>
        )}
        {uploadMeta && uploadProgress === null && (
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            ✅ 업로드 완료: {uploadMeta.title} ({Math.floor(uploadMeta.duration / 60)}:
            {String(uploadMeta.duration % 60).padStart(2, "0")})
          </p>
        )}
        {error && <div className="error">{error}</div>}
      </div>

      {meta && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
            {meta.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={meta.thumbnail}
                alt=""
                width={200}
                style={{ borderRadius: 8, objectFit: "cover" }}
              />
            )}
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                {meta.title}
              </h3>
              {meta.channel && (
                <p className="muted" style={{ fontSize: 14 }}>
                  {meta.channel}
                </p>
              )}
              <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>
                길이: {formatDuration(meta.duration)}
              </p>
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 14,
                marginBottom: 8,
                fontWeight: 600,
              }}
            >
              STT 프로바이더
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select
                className="input"
                style={{ width: 200 }}
                value={provider}
                onChange={(e) => setProvider(e.target.value as STTProvider)}
                disabled={transcribing}
              >
                <option value="groq">Groq Whisper (무료, 빠름)</option>
                <option value="openai">OpenAI Whisper (유료)</option>
              </select>
              <button
                className="btn"
                onClick={onTranscribe}
                disabled={transcribing}
              >
                {transcribing ? "트랜스크립트 생성 중..." : "트랜스크립트 생성"}
              </button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              영상 길이에 따라 30초~수 분 소요. 백엔드 .env에 해당 키가 있어야 합니다.
            </p>
          </div>
        </div>
      )}

      {transcript && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            트랜스크립트
            {transcript.language && (
              <span className="muted" style={{ fontSize: 13, fontWeight: 400, marginLeft: 8 }}>
                ({transcript.language})
              </span>
            )}
          </h3>

          <details>
            <summary
              className="muted"
              style={{ cursor: "pointer", fontSize: 13, marginBottom: 8 }}
            >
              {transcript.segments.length}개 세그먼트 보기
            </summary>
            <div
              style={{
                maxHeight: 300,
                overflowY: "auto",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 12,
                marginTop: 8,
              }}
            >
              {transcript.segments.length === 0 ? (
                <p className="muted">{transcript.text}</p>
              ) : (
                transcript.segments.map((s, i) => (
                  <div key={i} style={{ marginBottom: 6, fontSize: 14, lineHeight: 1.6 }}>
                    <span
                      className="muted"
                      style={{ marginRight: 8, fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatDuration(s.start)}
                    </span>
                    {s.text}
                  </div>
                ))
              )}
            </div>
          </details>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 16 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              하이라이트 선정 ({selectedCriteria.length}개 쇼츠)
            </h4>
            <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
              만들고 싶은 쇼츠 개수만큼 기준을 추가하세요. 같은 기준을 여러 번 추가하면 LLM이 매번 다른 구간을 선택합니다.
            </p>

            <div style={{ marginBottom: 12 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                기준 추가 (클릭):
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {criteriaPresets.map((c) => (
                  <button
                    key={c.name}
                    className="btn-ghost btn"
                    style={{ fontSize: 12, padding: "6px 10px" }}
                    onClick={() => addCriteria(c.name)}
                    disabled={selecting}
                    title={c.description}
                  >
                    + {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                선정 순서 (쇼츠 1번부터):
              </div>
              {selectedCriteria.length === 0 ? (
                <p className="muted" style={{ fontSize: 13 }}>
                  위에서 기준을 클릭해 추가하세요.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {selectedCriteria.map((name, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        fontSize: 13,
                      }}
                    >
                      <span
                        className="muted"
                        style={{ fontVariantNumeric: "tabular-nums", minWidth: 24 }}
                      >
                        #{i + 1}
                      </span>
                      <span style={{ flex: 1 }}>{labelOf(name)}</span>
                      <button
                        className="btn-ghost btn"
                        style={{ padding: "2px 8px", fontSize: 12 }}
                        onClick={() => moveCriteria(i, -1)}
                        disabled={selecting || i === 0}
                      >
                        ↑
                      </button>
                      <button
                        className="btn-ghost btn"
                        style={{ padding: "2px 8px", fontSize: 12 }}
                        onClick={() => moveCriteria(i, 1)}
                        disabled={selecting || i === selectedCriteria.length - 1}
                      >
                        ↓
                      </button>
                      <button
                        className="btn-ghost btn"
                        style={{ padding: "2px 8px", fontSize: 12 }}
                        onClick={() => removeCriteriaAt(i)}
                        disabled={selecting}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div>
                <label className="muted" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                  LLM
                </label>
                <select
                  className="input"
                  value={llmProvider}
                  onChange={(e) => setLlmProvider(e.target.value as LLMProvider)}
                  disabled={selecting}
                >
                  <option value="gemini">Gemini 2.5 Flash</option>
                  <option value="anthropic">Claude Sonnet 4.6</option>
                </select>
              </div>
              <div>
                <label className="muted" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                  최소 길이(초)
                </label>
                <input
                  className="input"
                  type="number"
                  min={5}
                  max={120}
                  value={minSec}
                  onChange={(e) => setMinSec(Number(e.target.value))}
                  disabled={selecting}
                />
              </div>
              <div>
                <label className="muted" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                  최대 길이(초)
                </label>
                <input
                  className="input"
                  type="number"
                  min={5}
                  max={180}
                  value={maxSec}
                  onChange={(e) => setMaxSec(Number(e.target.value))}
                  disabled={selecting}
                />
              </div>
            </div>

            <button
              className="btn"
              onClick={onSelectHighlights}
              disabled={selecting || selectedCriteria.length === 0}
            >
              {selecting ? "선정 중..." : `${selectedCriteria.length}개 쇼츠 하이라이트 선정`}
            </button>
          </div>
        </div>
      )}

      {highlights && (
        <div className="card">
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            선정된 하이라이트 ({highlights.length}개)
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {highlights.map((h, i) => (
              <div
                key={i}
                style={{
                  padding: 12,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 6,
                    gap: 8,
                  }}
                >
                  <h4 style={{ fontSize: 15, fontWeight: 600 }}>
                    {i + 1}. {h.title}
                  </h4>
                  <span
                    className="muted"
                    style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
                  >
                    컷 {h.cuts.length}개 · 합 {h.cuts.reduce((a, c) => a + (c.end - c.start), 0).toFixed(1)}s
                  </span>
                </div>
                <div
                  style={{
                    display: "inline-block",
                    fontSize: 11,
                    background: "var(--accent)",
                    color: "white",
                    padding: "2px 8px",
                    borderRadius: 4,
                    marginBottom: 8,
                  }}
                >
                  {labelOf(h.criteria)}
                </div>

                <p className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
                  💡 {h.reason}
                </p>
                <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>{h.script}</p>

                {transcript && (
                  <div
                    style={{
                      background: "var(--bg)",
                      border: "1px dashed var(--border)",
                      borderRadius: 6,
                      padding: 10,
                      marginBottom: 12,
                    }}
                  >
                    <div
                      className="muted"
                      style={{ fontSize: 11, marginBottom: 6, fontWeight: 600 }}
                    >
                      📽 이 쇼츠의 흐름 (컷 순서대로)
                    </div>
                    <p style={{ fontSize: 13, lineHeight: 1.6 }}>
                      {h.cuts.map((c, ci) => {
                        const text = getTranscriptText(transcript, c.start, c.end);
                        return (
                          <span key={ci}>
                            {ci > 0 && (
                              <span className="muted" style={{ margin: "0 6px" }}>
                                →
                              </span>
                            )}
                            <span style={{ opacity: 0.7, fontSize: 11 }}>
                              [{ci + 1}]
                            </span>{" "}
                            {text || <span className="muted">(자막 없음)</span>}
                          </span>
                        );
                      })}
                    </p>
                  </div>
                )}

                <div
                  style={{
                    background: "var(--panel)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 600 }}>컷 목록 (편집 순서대로)</span>
                    <button
                      className="btn-ghost btn"
                      style={{ padding: "4px 10px", fontSize: 11 }}
                      onClick={() => addCut(i)}
                    >
                      + 컷 추가
                    </button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {h.cuts.map((c, ci) => (
                      <div
                        key={ci}
                        style={{
                          padding: 8,
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          borderRadius: 4,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 6,
                            gap: 6,
                          }}
                        >
                          <span
                            className="muted"
                            style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
                          >
                            컷 #{ci + 1} · {(c.end - c.start).toFixed(1)}s
                          </span>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button
                              className="btn-ghost btn"
                              style={{ padding: "2px 6px", fontSize: 11 }}
                              onClick={() => moveCut(i, ci, -1)}
                              disabled={ci === 0}
                            >
                              ↑
                            </button>
                            <button
                              className="btn-ghost btn"
                              style={{ padding: "2px 6px", fontSize: 11 }}
                              onClick={() => moveCut(i, ci, 1)}
                              disabled={ci === h.cuts.length - 1}
                            >
                              ↓
                            </button>
                            <button
                              className="btn-ghost btn"
                              style={{ padding: "2px 6px", fontSize: 11 }}
                              onClick={() => removeCut(i, ci)}
                              disabled={h.cuts.length <= 1}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                        {c.reason && (
                          <p
                            className="muted"
                            style={{ fontSize: 11, marginBottom: 6, fontStyle: "italic" }}
                          >
                            {c.reason}
                          </p>
                        )}
                        {(() => {
                          const text = getTranscriptText(transcript, c.start, c.end);
                          const ytUrl = youtubeUrlAt(meta, c.start);
                          if (!text && !ytUrl) return null;
                          return (
                            <div
                              style={{
                                background: "var(--panel)",
                                border: "1px solid var(--border)",
                                borderRadius: 4,
                                padding: 6,
                                marginBottom: 6,
                              }}
                            >
                              {text && (
                                <p style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 4 }}>
                                  💬 "{text}"
                                </p>
                              )}
                              {ytUrl && (
                                <a
                                  href={ytUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    color: "var(--accent)",
                                    fontSize: 11,
                                    textDecoration: "underline",
                                  }}
                                >
                                  ▶ 유튜브에서 이 시점 보기
                                </a>
                              )}
                            </div>
                          );
                        })()}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 6,
                          }}
                        >
                          <TimeAdjuster
                            label="시작"
                            value={c.start}
                            onChange={(v) => updateCut(i, ci, { start: v })}
                            onNudge={(d) => nudgeCut(i, ci, "start", d)}
                          />
                          <TimeAdjuster
                            label="종료"
                            value={c.end}
                            onChange={(v) => updateCut(i, ci, { end: v })}
                            onNudge={(d) => nudgeCut(i, ci, "end", d)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {highlights && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            🎬 쇼츠 영상 렌더링
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div>
              <label className="muted" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                크롭 비율
              </label>
              <select
                className="input"
                value={cropMode}
                onChange={(e) => setCropMode(e.target.value as CropMode)}
                disabled={jobStatus?.status === "processing"}
              >
                <option value="9:16-center">9:16 (중앙 크롭)</option>
                <option value="9:16-face">9:16 (얼굴 추적)</option>
                <option value="1:1">1:1 (정사각형)</option>
                <option value="16:9">16:9 (가로형)</option>
              </select>
            </div>
            <div>
              <label className="muted" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                자막
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  height: 38,
                  fontSize: 13,
                }}
              >
                <input
                  type="checkbox"
                  checked={burnSubtitles}
                  onChange={(e) => setBurnSubtitles(e.target.checked)}
                  disabled={jobStatus?.status === "processing"}
                />
                영상에 자막 합성 (트랜스크립트 기반)
              </label>
            </div>
          </div>

          <button
            className="btn"
            onClick={onStartRender}
            disabled={jobStatus?.status === "processing"}
          >
            {jobStatus?.status === "processing"
              ? "렌더링 중..."
              : `${highlights.length}개 쇼츠 만들기`}
          </button>

          {jobStatus && (
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  height: 6,
                  background: "var(--border)",
                  borderRadius: 3,
                  overflow: "hidden",
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    width: `${jobStatus.progress}%`,
                    height: "100%",
                    background: "var(--accent)",
                    transition: "width 0.3s",
                  }}
                />
              </div>
              <p className="muted" style={{ fontSize: 13 }}>
                {jobStatus.status === "completed"
                  ? "✅ 완료"
                  : jobStatus.status === "failed"
                  ? `❌ 실패: ${jobStatus.error ?? ""}`
                  : `${jobStatus.message} (${Math.round(jobStatus.progress)}%)`}
              </p>
            </div>
          )}
        </div>
      )}

      {jobStatus?.status === "completed" && jobStatus.result && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            완성된 쇼츠 ({jobStatus.result.length}개)
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {jobStatus.result.map((r) => (
              <div
                key={r.index}
                style={{
                  padding: 12,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                    gap: 8,
                  }}
                >
                  <h4 style={{ fontSize: 14, fontWeight: 600 }}>
                    {r.index}. {r.title}
                  </h4>
                  <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                    {r.duration}s · {labelOf(r.criteria)}
                  </span>
                </div>
                <video
                  src={fileUrl(r.url)}
                  controls
                  style={{
                    width: "100%",
                    maxHeight: 360,
                    background: "black",
                    borderRadius: 6,
                    marginBottom: 8,
                  }}
                />
                <a className="btn" href={fileUrl(r.url)} download={r.filename}>
                  다운로드
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function NewPage() {
  return (
    <Suspense fallback={<div className="container">로딩 중...</div>}>
      <NewInner />
    </Suspense>
  );
}
