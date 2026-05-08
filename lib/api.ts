const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export type YouTubeMeta = {
  id: string;
  title: string;
  duration: number;
  thumbnail: string | null;
  channel: string | null;
  upload_date: string | null;
  webpage_url: string;
};

export async function fetchYouTubeMeta(url: string): Promise<YouTubeMeta> {
  const res = await fetch(`${API_BASE}/api/youtube/meta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || "메타데이터 조회 실패");
  }
  return res.json();
}

export type UploadMeta = {
  file_id: string;
  title: string;
  duration: number;
  thumbnail: string | null;
};

export async function uploadVideo(
  file: File,
  onProgress?: (loaded: number, total: number) => void,
): Promise<UploadMeta> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/uploads`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("응답 파싱 실패"));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.detail || "업로드 실패"));
        } catch {
          reject(new Error("업로드 실패"));
        }
      }
    };
    xhr.onerror = () => reject(new Error("네트워크 오류"));
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

export type Transcript = {
  language: string | null;
  duration: number | null;
  text: string;
  segments: TranscriptSegment[];
};

export type STTProvider = "groq" | "openai";
export type LLMProvider = "gemini" | "anthropic";
export type TranscribeMode = "stt" | "video";

export async function transcribe(args: {
  url?: string;
  fileId?: string;
  mode: TranscribeMode;
  provider: string;
  apiKey?: string;
  language?: string;
}): Promise<Transcript> {
  const res = await fetch(`${API_BASE}/api/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: args.url,
      file_id: args.fileId,
      mode: args.mode,
      provider: args.provider,
      language: args.language,
      api_key: args.apiKey,
    }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || "트랜스크립트 실패");
  }
  return res.json();
}

export type HighlightCriteria = {
  name: string;
  label: string;
  description: string;
};

export type Cut = {
  start: number;
  end: number;
  reason?: string;
};

export type Highlight = {
  criteria: string;
  title: string;
  reason: string;
  script: string;
  cuts: Cut[];
};

export async function fetchCriteria(): Promise<HighlightCriteria[]> {
  const res = await fetch(`${API_BASE}/api/highlights/criteria`);
  if (!res.ok) throw new Error("기준 목록 조회 실패");
  return res.json();
}

export type CropMode = "1:1" | "16:9" | "9:16-center" | "9:16-face";

export type RenderResultItem = {
  index: number;
  criteria: string;
  title: string;
  cuts: { start: number; end: number }[];
  duration: number;
  url: string;
  filename: string;
};

export type JobStatus = {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  message: string;
  result: RenderResultItem[] | null;
  error: string | null;
  created_at: string;
};

export async function startRender(args: {
  url?: string;
  fileId?: string;
  highlights: Highlight[];
  transcript: Transcript | null;
  cropMode: CropMode;
  burnSubtitles: boolean;
  removeSilence: boolean;
  emphasizeHook: boolean;
}): Promise<{ job_id: string }> {
  const res = await fetch(`${API_BASE}/api/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: args.url,
      file_id: args.fileId,
      highlights: args.highlights,
      transcript: args.transcript,
      crop_mode: args.cropMode,
      burn_subtitles: args.burnSubtitles,
      remove_silence: args.removeSilence,
      emphasize_hook: args.emphasizeHook,
    }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || "렌더 시작 실패");
  }
  return res.json();
}

export async function getJob(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${API_BASE}/api/jobs/${jobId}`);
  if (!res.ok) throw new Error("잡 상태 조회 실패");
  return res.json();
}

export function fileUrl(path: string): string {
  // R2 presigned URL은 절대 URL이라 그대로 사용
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE}${path}`;
}

export async function selectHighlights(args: {
  transcript: Transcript;
  criteriaList: string[];
  minSeconds: number;
  maxSeconds: number;
  provider: LLMProvider;
  apiKey?: string;
}): Promise<Highlight[]> {
  const body = {
    transcript: args.transcript,
    criteria_list: args.criteriaList,
    min_seconds: args.minSeconds,
    max_seconds: args.maxSeconds,
    provider: args.provider,
    api_key: args.apiKey,
  };
  const res = await fetch(`${API_BASE}/api/highlights/select`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail || "하이라이트 선정 실패");
  }
  return res.json();
}
