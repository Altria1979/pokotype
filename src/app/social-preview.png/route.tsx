import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#f4f1eb", color: "#20251f", padding: "64px 72px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", fontSize: 38, fontWeight: 700 }}>Pokotype</div>
        <div style={{ display: "flex", gap: 14 }}>
          {["#1e5fce", "#235c34", "#ac481e"].map((color) => <div key={color} style={{ width: 42, height: 42, borderRadius: 21, background: color }} />)}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", fontSize: 76, lineHeight: 1.1, fontWeight: 700, maxWidth: 1000 }}>Japanese typing practice</div>
        <div style={{ display: "flex", fontSize: 32, color: "#514e48" }}>Hiragana, katakana and real sentences.</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 26, borderTop: "1px solid #b9b5ab", fontSize: 24, color: "#514e48" }}>
        <span>Learn at your own pace.</span>
        <span>Free kana &amp; sample exercises</span>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
