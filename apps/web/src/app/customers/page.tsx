import { redirect } from 'next/navigation';
import { currentUser } from '@/server/session';
import { CustomersClient } from './CustomersClient';

/*
 * The session is checked here, on the server, so a signed-out visitor is redirected before any
 * markup is sent. Leaving it to the client meant the page rendered, fired its first request,
 * and only then bounced to /login — a visible flash of a screen the visitor may not open.
 */
export default async function Page() {
  if (!(await currentUser())) redirect('/login');
  return <CustomersClient />;
}
