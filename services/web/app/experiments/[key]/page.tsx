import Workspace from "../../_components/workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  return <Workspace experimentKey={(await params).key} />;
}
