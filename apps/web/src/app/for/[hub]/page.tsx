import { HubPage } from "@/components/HubPage";
import type { HubId } from "@/lib/hubs";
import { notFound } from "next/navigation";

const VALID: HubId[] = ["citizen", "planner", "operator", "press"];

export default async function ForHubPage({
  params,
}: {
  params: Promise<{ hub: string }>;
}) {
  const { hub } = await params;
  if (!VALID.includes(hub as HubId)) notFound();
  return <HubPage id={hub as HubId} />;
}
