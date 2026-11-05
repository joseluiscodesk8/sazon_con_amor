import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Panel de administración",
    template: "%s — Panel de administración",
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

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
