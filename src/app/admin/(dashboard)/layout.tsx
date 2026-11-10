import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/auth";
import { emailDeUsuarioParaMostrar } from "@/lib/supabase/usuario";
import { signOut } from "./actions";
import styles from "./layout.module.scss";

export const instant = false;

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireAdmin();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Panel de administración">
        <Link href="/admin" className={styles.brand}>
          Sazón <span>con Amor</span>
        </Link>

        <nav className={styles.nav} aria-label="Secciones del panel">
          <Link href="/admin">Pedidos</Link>
          <Link href="/admin/menu">Menú</Link>
          <Link href="/admin/lugares">Lugares</Link>
          <Link href="/admin/meseros">Meseros</Link>
        </nav>

        <div className={styles.footer}>
          <span className={styles.user}>
            {emailDeUsuarioParaMostrar(user.email ?? "")}
          </span>
          <form action={signOut}>
            <button type="submit" className={styles.logout}>
              Salir
            </button>
          </form>
        </div>
      </aside>

      <main id="contenido" tabIndex={-1} className={styles.content}>
        {children}
      </main>
    </div>
  );
}
