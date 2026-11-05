import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import { crearMetadata, esquemaMenu } from "@/lib/seo";
import MenuCliente from "../MenuCliente";
import { getMenu } from "../data";

export const metadata: Metadata = crearMetadata({
  titulo: "Menú",
  descripcion: "Pide desde tu mesa y lo llevamos hasta allí.",
  ruta: "/menu/restaurante",
});

export default async function MenuRestaurantePage() {
  const menu = await getMenu();
  return (
    <>
      <JsonLd
        datos={esquemaMenu(menu, "/menu/restaurante", "Menú del restaurante")}
      />
      <MenuCliente modo="restaurante" menu={menu} />
    </>
  );
}
