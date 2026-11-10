import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Meseros",
    template: "%s — Meseros",
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function MeseroRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
