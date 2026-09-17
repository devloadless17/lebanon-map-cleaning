import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { QueryProvider } from '@/lib/query/provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cleaning Route Planner',
  description: 'Book a customer while watching what it does to the whole day’s route.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="h-full">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
