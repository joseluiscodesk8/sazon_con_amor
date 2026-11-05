import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import { crearMetadata, esquemaMenu } from "@/lib/seo";
import MenuCliente from "../MenuCliente";
import { getLugares, getMenu } from "../data";

export const metadata: Metadata = crearMetadata({
  titulo: "Pedir a domicilio",
  descripcion: "Arma tu pedido y te lo llevamos a la puerta.",
  ruta: "/menu/domicilio",
});

export default async function MenuDomicilioPage() {
  const [menu, lugares] = await Promise.all([getMenu(), getLugares()]);
  return (
    <>
      <JsonLd
        datos={esquemaMenu(menu, "/menu/domicilio", "Menú a domicilio")}
      />
      <MenuCliente modo="domicilio" menu={menu} lugares={lugares} />
    </>
  );
}
