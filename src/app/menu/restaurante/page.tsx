import type { Metadata } from "next";
import MenuCliente from "../MenuCliente";
import { getMenu } from "../data";

export const metadata: Metadata = {
  title: "Menú — Sazón con Amor",
  description: "Pide desde tu mesa y lo llevamos hasta allí.",
};

export default async function MenuRestaurantePage() {
  const menu = await getMenu();
  return <MenuCliente modo="restaurante" menu={menu} />;
}
