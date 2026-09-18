import { redirect } from 'next/navigation';
import { currentUser } from '@/server/session';
import { beirutToday } from '@/lib/time';
import { LoginClient } from './LoginClient';

/** Someone already signed in has no use for this page; send them straight to the day. */
export default async function Page() {
  if (await currentUser()) redirect(`/schedule/${beirutToday()}`);
  return <LoginClient />;
}
