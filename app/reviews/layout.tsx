import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Avaliações - PortoMove",
  description:
    "Avaliações e opiniões sobre linhas de autocarro, paragens e veículos no Porto. Partilhe a sua experiência com os transportes públicos.",
  openGraph: {
    title: "Avaliações - PortoMove",
    description: "Avaliações e opiniões sobre linhas de autocarro, paragens e veículos no Porto.",
    type: "website",
  },
};

export default function ReviewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
