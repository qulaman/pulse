import { LabScreen } from "@/components/lab/LabScreen";
import { parseLabTab } from "@/lib/lab/tabs";

export default async function LabPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  return <LabScreen tab={parseLabTab((await searchParams).tab)} />;
}
