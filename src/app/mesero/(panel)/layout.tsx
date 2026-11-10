import Link from "next/link";
import { requireMesero } from "@/lib/supabase/auth";
import { signOutMesero } from "./actions";
import styles from "./layout.module.scss";

export const instant = false;

export default async function MeseroLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { perfil } = await requireMesero();
  const nombre = perfil.nombre?.trim() || perfil.usuario || "Mesero";

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/mesero" className={styles.brand}>
          Sazón <span>con Amor</span>
          <small>Meseros</small>
        </Link>

        <div className={styles.acciones}>
          <span className={styles.usuario} title={nombre}>
            {nombre}
          </span>

          <form action={signOutMesero}>
            <button type="submit" className={styles.salir}>
              Salir
            </button>
          </form>
        </div>
      </header>

      <main id="contenido" tabIndex={-1} className={styles.content}>
        {children}
      </main>
    </div>
  );
}
