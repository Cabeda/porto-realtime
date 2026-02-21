import { redirect } from "next/navigation";

export default function ProposalsPage() {
  redirect("/community?section=proposals");
}
