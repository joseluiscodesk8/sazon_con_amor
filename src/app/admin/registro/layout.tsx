import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Crear administrador",
};

export default function RegistroLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
