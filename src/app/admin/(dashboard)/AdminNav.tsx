"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAvisos } from "./AvisosProvider";
import styles from "./layout.module.scss";

const ENLACES = [
  { href: "/admin", texto: "Pedidos" },
  { href: "/admin/menu", texto: "Menú" },
  { href: "/admin/lugares", texto: "Lugares" },
  { href: "/admin/meseros", texto: "Meseros" },
] as const;

export default function AdminNav() {
  const pathname = usePathname();
  const { sinVer } = useAvisos();

  return (
    <nav className={styles.nav} aria-label="Secciones del panel">
      {ENLACES.map(({ href, texto }) => {
        const activo = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={activo ? styles.activo : undefined}
            aria-current={activo ? "page" : undefined}
          >
            {texto}
            {href === "/admin" && sinVer > 0 ? (
              <span className={styles.navBadge}>{sinVer}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
