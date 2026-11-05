import { ImageResponse } from "next/og";
import { NOMBRE_SITIO } from "@/lib/seo";

export const alt = `${NOMBRE_SITIO} — Comida casera a domicilio y en restaurante`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background:
            "radial-gradient(circle at 15% 15%, #f7d3ad 0%, transparent 42%), radial-gradient(circle at 85% 5%, #efb8a9 0%, transparent 40%), #fdf6ec",
          color: "#2b2320",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <div
            style={{
              width: "18px",
              height: "70px",
              borderRadius: "999px",
              background: "#c0392b",
            }}
          />
          <div
            style={{
              display: "flex",
              fontSize: "28px",
              fontWeight: 700,
              letterSpacing: "4px",
              textTransform: "uppercase",
              color: "#2e7d4f",
            }}
          >
            Comida casera hecha con amor
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: "112px",
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: "-4px",
            }}
          >
            <span style={{ color: "#c0392b" }}>Sazón</span>
            <span style={{ color: "#e67e22" }}>&nbsp;con Amor</span>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: "28px",
              fontSize: "40px",
              color: "#6f665f",
            }}
          >
            Pide a domicilio o come en el restaurante
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "2px solid #e4d8c6",
            paddingTop: "28px",
            fontSize: "26px",
            color: "#6f665f",
          }}
        >
          <span style={{ display: "flex" }}>Menú · Domicilio · Restaurante</span>
          <span style={{ display: "flex", color: "#c0392b", fontWeight: 700 }}>
            {NOMBRE_SITIO}
          </span>
        </div>
      </div>
    ),
    size,
  );
}
