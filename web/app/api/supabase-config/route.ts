import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return NextResponse.json(
      { error: "Supabase configuration belum tersedia." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    url,
    publishableKey,
  });
}