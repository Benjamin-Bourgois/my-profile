import { ImageResponse } from "next/og";

// Icône de l'écran d'accueil (iPhone / iPad) : un verre ambré sur fond sombre.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1c1917" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 84, height: 108 }}>
          <div style={{ height: 28, background: "#fde68a", borderTopLeftRadius: 6, borderTopRightRadius: 6 }} />
          <div style={{ flex: 1, background: "#fbbf24", borderBottomLeftRadius: 18, borderBottomRightRadius: 18 }} />
        </div>
      </div>
    ),
    size,
  );
}
