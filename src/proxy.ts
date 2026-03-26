import { type NextRequest, NextResponse } from 'next/server';

// Pass-through proxy - auth handled by middleware.ts
export default function proxy(_request: NextRequest) {
  return NextResponse.next();
}
