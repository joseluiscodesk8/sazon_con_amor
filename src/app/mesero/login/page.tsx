import { Suspense } from "react";
import type { Metadata } from "next";
import FormularioLogin from "@/components/FormularioLogin";

export const metadata: Metadata = {
  title: "Acceso meseros",
};

export default function LoginMeseroPage() {
  return (
    <Suspense>
      <FormularioLogin tipo="mesero" />
    </Suspense>
  );
}
