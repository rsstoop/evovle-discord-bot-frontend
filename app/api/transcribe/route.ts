import { NextResponse } from 'next/server'
import OpenAI from 'openai'

export const runtime = 'nodejs'

export async function POST() {
  // Deprecated: direct uploads exceed serverless body limits. Use storage flow instead.
  return NextResponse.json(
    { error: 'Direct upload not supported. Use /api/storage/signed-upload then /api/transcribe-from-storage.' },
    { status: 413 }
  )
}


