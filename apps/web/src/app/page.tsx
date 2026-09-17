import { redirect } from 'next/navigation';

/** "Today" is a Beirut calendar day — the server's UTC date would be wrong after 21:00 local. */
export default function Home() {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Beirut',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  redirect(`/schedule/${today}`);
}
