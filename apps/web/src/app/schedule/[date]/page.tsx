import { redirect } from 'next/navigation';
import { currentUser } from '@/server/session';
import { WorkspaceClient } from './WorkspaceClient';

/*
 * Guarded on the server: a signed-out visitor never receives the workspace markup, so the map
 * cannot flash into view before the redirect to /login lands.
 */
/** Next 16: route params are async and must be awaited. */
export default async function SchedulePage({ params }: { params: Promise<{ date: string }> }) {
  if (!(await currentUser())) redirect('/login');
  const { date } = await params;
  return <WorkspaceClient date={date} />;
}
