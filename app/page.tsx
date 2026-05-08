import Link from "next/link";

export default function Home() {
  return (
    <div className="container">
      <h1 className="h1">Shorts Helper</h1>
      <p className="muted" style={{ marginBottom: 32 }}>
        긴 영상을 쇼츠로 편집합니다. 모드를 선택하세요.
      </p>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
        <Link href="/new?mode=one-to-many" className="card" style={{ display: "block" }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            1개 → N개
          </h2>
          <p className="muted" style={{ fontSize: 14 }}>
            하나의 긴 영상에서 여러 쇼츠 구간을 추출합니다.
          </p>
        </Link>

        <Link href="/new?mode=many-to-many" className="card" style={{ display: "block" }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            N개 → N개
          </h2>
          <p className="muted" style={{ fontSize: 14 }}>
            여러 영상을 각각 쇼츠로 변환합니다.
          </p>
        </Link>
      </div>
    </div>
  );
}
