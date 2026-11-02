import { Suspense } from "react";
import type { Metadata } from "next";
import FormularioLogin from "./FormularioLogin";

export const metadata: Metadata = {
  title: "Acceso — Sazón con Amor",
};

export default function LoginPage() {
  return (
    <Suspense>
      <FormularioLogin />
    </Suspense>
  );
}
