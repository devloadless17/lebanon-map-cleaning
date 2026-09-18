import { NextResponse } from 'next/server';

/** Cheap liveness only: no database round trip, no external call. */
export function GET() {
  return NextResponse.json({ status: 'ok' });
}
