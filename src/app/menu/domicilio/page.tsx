import type { Metadata } from "next";
import MenuCliente from "../MenuCliente";
import { getLugares, getMenu } from "../data";

export const metadata: Metadata = {
  title: "Pedir a domicilio — Sazón con Amor",
  description: "Arma tu pedido y te lo llevamos a la puerta.",
};

export default async function MenuDomicilioPage() {
  const [menu, lugares] = await Promise.all([getMenu(), getLugares()]);
  return <MenuCliente modo="domicilio" menu={menu} lugares={lugares} />;
}
