import { WorkspaceClient } from './WorkspaceClient';

/** Next 16: route params are async and must be awaited. */
export default async function SchedulePage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  return <WorkspaceClient date={date} />;
}
