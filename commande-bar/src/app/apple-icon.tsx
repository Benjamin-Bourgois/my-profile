import { ImageResponse } from "next/og";

// Icône de l'écran d'accueil (iPhone / iPad) : un verre au trait, sable sur noir mat.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1D1C1A" }}>
        <svg width="112" height="112" viewBox="0 0 64 64">
          <path d="M20 16h24l-12 16z" fill="none" stroke="#FBF9F5" strokeWidth="3" strokeLinejoin="round" />
          <path d="M32 32v15M25 48h14" fill="none" stroke="#FBF9F5" strokeWidth="3" strokeLinecap="round" />
          <circle cx="32" cy="21.5" r="2" fill="#A6895A" />
        </svg>
      </div>
    ),
    size,
  );
}
