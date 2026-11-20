"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { entradaSalida, transicionSuave } from "@/components/animacion";
import { createClient } from "@/lib/supabase/client";
import { formatearPrecio } from "@/lib/format";
import type { Pedido, TipoPedido } from "@/lib/pedidos";
import styles from "./avisos.module.scss";

type AvisoPedido = {
  id: string;
  numero: number;
  tipo: TipoPedido;
  origen: Pedido["origen"];
  mesa: number | null;
  cliente: string;
  total: number;
};

type PayloadPedido = {
  eventType: string;
  new: {
    id?: unknown;
    numero?: unknown;
    tipo?: unknown;
    origen?: unknown;
    mesa?: unknown;
    cliente_nombre?: unknown;
    total?: unknown;
  };
};

type AvisosContextValue = {
  sinVer: number;
  sonido: boolean;
  alternarSonido: () => void;
};

const AvisosContext = createContext<AvisosContextValue>({
  sinVer: 0,
  sonido: true,
  alternarSonido: () => {},
});

export function useAvisos() {
  return useContext(AvisosContext);
}

function Aviso({
  aviso,
  onCerrar,
}: {
  aviso: AvisoPedido;
  onCerrar: (id: string) => void;
}) {
  useEffect(() => {
    const temporizador = window.setTimeout(() => onCerrar(aviso.id), 6000);
    return () => window.clearTimeout(temporizador);
  }, [aviso.id, onCerrar]);

  return (
    <motion.div
      variants={entradaSalida}
      initial="oculto"
      animate="visible"
      exit="salida"
      transition={transicionSuave}
      className={styles.aviso}
    >
      <div className={styles.avisoCuerpo}>
        <strong>Pedido #{aviso.numero}</strong>
        <span>
          {aviso.tipo === "domicilio"
            ? "Domicilio"
            : aviso.mesa != null
              ? `Mesa ${aviso.mesa}`
              : "Restaurante"}
          {aviso.origen === "mesero" ? " · Mesero" : ""} · {aviso.cliente}
        </span>
      </div>
      <strong>{formatearPrecio(aviso.total)}</strong>
      <button
        type="button"
        className={styles.avisoCerrar}
        onClick={() => onCerrar(aviso.id)}
        aria-label="Cerrar aviso"
      >
        ×
      </button>
    </motion.div>
  );
}

function Avisos({
  avisos,
  sonido,
  onCerrar,
}: {
  avisos: AvisoPedido[];
  sonido: boolean;
  onCerrar: (id: string) => void;
}) {
  const audioRef = useRef<AudioContext | null>(null);
  const vistosRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    function desbloquear() {
      if (
        (!audioRef.current || audioRef.current.state === "closed") &&
        window.AudioContext
      ) {
        audioRef.current = new window.AudioContext();
      }
      if (audioRef.current?.state === "suspended") {
        void audioRef.current.resume().catch(() => {});
      }
    }

    window.addEventListener("pointerdown", desbloquear);
    window.addEventListener("keydown", desbloquear);
    return () => {
      window.removeEventListener("pointerdown", desbloquear);
      window.removeEventListener("keydown", desbloquear);
      const contexto = audioRef.current;
      if (contexto && contexto.state !== "closed") {
        void contexto.close().catch(() => {});
      }
      audioRef.current = null;
    };
  }, []);

  const reproducir = useCallback(() => {
    const contexto = audioRef.current;
    if (!contexto || contexto.state === "closed") return;
    if (contexto.state === "suspended") {
      void contexto.resume().catch(() => {});
    }

    const inicio = contexto.currentTime;
    [880, 1174].forEach((frecuencia, indice) => {
      const oscilador = contexto.createOscillator();
      const ganancia = contexto.createGain();
      const momento = inicio + indice * 0.16;

      oscilador.type = "sine";
      oscilador.frequency.value = frecuencia;
      ganancia.gain.setValueAtTime(0.0001, momento);
      ganancia.gain.exponentialRampToValueAtTime(0.12, momento + 0.02);
      ganancia.gain.exponentialRampToValueAtTime(0.0001, momento + 0.13);
      oscilador.connect(ganancia);
      ganancia.connect(contexto.destination);
      oscilador.start(momento);
      oscilador.stop(momento + 0.14);
    });
  }, []);

  useEffect(() => {
    for (const aviso of avisos) {
      if (vistosRef.current.has(aviso.id)) continue;
      vistosRef.current.add(aviso.id);
      if (sonido) reproducir();
    }
  }, [avisos, reproducir, sonido]);

  return (
    <div className={styles.avisos}>
      <AnimatePresence initial={false}>
        {avisos.map((aviso) => (
          <Aviso key={aviso.id} aviso={aviso} onCerrar={onCerrar} />
        ))}
      </AnimatePresence>
    </div>
  );
}

export default function AvisosProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const [pathnamePrevio, setPathnamePrevio] = useState(pathname);
  const [avisos, setAvisos] = useState<AvisoPedido[]>([]);
  const [noLeidos, setNoLeidos] = useState<string[]>([]);
  const [sonido, setSonido] = useState(true);
  const pedidosVistosRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  if (pathname !== pathnamePrevio) {
    setPathnamePrevio(pathname);
    if (pathname === "/admin") setNoLeidos([]);
  }

  const cerrarAviso = useCallback((id: string) => {
    setAvisos((actuales) => actuales.filter((aviso) => aviso.id !== id));
  }, []);

  const alternarSonido = useCallback(() => {
    setSonido((actual) => !actual);
  }, []);

  useEffect(() => {
    const supabase = createClient("admin");
    let activo = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function suscribir() {
      const { data } = await supabase.auth.getSession();
      if (!activo) return;

      if (data.session?.access_token) {
        supabase.realtime.setAuth(data.session.access_token);
      }

      channel = supabase
        .channel("pedidos-live")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "pedidos" },
          (payload: PayloadPedido) => {
            router.refresh();
            if (payload.eventType !== "INSERT") return;

            const fila = payload.new;
            const id = fila.id;
            const numero = fila.numero;
            if (
              typeof id !== "string" ||
              typeof numero !== "number" ||
              pedidosVistosRef.current.has(id)
            ) {
              return;
            }
            pedidosVistosRef.current.add(id);

            setAvisos((actuales) => [
              ...actuales,
              {
                id,
                numero,
                tipo: fila.tipo === "domicilio" ? "domicilio" : "restaurante",
                origen: fila.origen === "mesero" ? "mesero" : "cliente",
                mesa: typeof fila.mesa === "number" ? fila.mesa : null,
                cliente:
                  typeof fila.cliente_nombre === "string"
                    ? fila.cliente_nombre
                    : "Cliente",
                total: typeof fila.total === "number" ? fila.total : 0,
              },
            ]);

            if (pathnameRef.current !== "/admin") {
              setNoLeidos((actuales) =>
                actuales.includes(id) ? actuales : [...actuales, id],
              );
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "mesas_abiertas" },
          () => router.refresh(),
        )
        .subscribe((status: string) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("[admin realtime]", status);
          }
        });
    }

    function alVolver() {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }

    void suscribir();
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      activo = false;
      document.removeEventListener("visibilitychange", alVolver);
      if (channel) supabase.removeChannel(channel);
    };
  }, [router]);

  const valor = useMemo(
    () => ({ sinVer: noLeidos.length, sonido, alternarSonido }),
    [noLeidos.length, sonido, alternarSonido],
  );

  return (
    <AvisosContext.Provider value={valor}>
      {children}
      <Avisos avisos={avisos} sonido={sonido} onCerrar={cerrarAviso} />
    </AvisosContext.Provider>
  );
}
