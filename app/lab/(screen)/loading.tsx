import { LabScreen } from "@/components/lab/LabScreen";

/** Route skeleton: the lab itself on its first tab — its panels wait on their own (D-122). */
export default function Loading() {
  return <LabScreen tab="models" />;
}
