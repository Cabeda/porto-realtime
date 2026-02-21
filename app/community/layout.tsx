import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Comunidade - PortoMove",
  description:
    "Avaliações, propostas e opiniões da comunidade sobre transportes públicos e mobilidade no Porto.",
  openGraph: {
    title: "Comunidade - PortoMove",
    description:
      "Avaliações, propostas e opiniões da comunidade sobre transportes públicos e mobilidade no Porto.",
    type: "website",
  },
};

export default function CommunityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
