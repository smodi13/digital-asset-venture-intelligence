import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Apple touch icon: same circular mark as app/icon.svg (charcoal ground, ivory
// ring, amber tick), sized for the iOS home screen.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#1c1917",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="180" height="180" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="15" cy="15" r="7" fill="none" stroke="#faf8f4" strokeWidth="3" />
          <path d="M15.5 21.5 L22 28" stroke="#b9832b" strokeWidth="3.4" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size,
  );
}
