import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import { handleApiError } from '@/lib/errors'
import { extractBearerToken } from '@/lib/auth'
import type { Database } from '@/types/database'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

const SYSTEM_PROMPT = `You are Rawaq's friendly event discovery assistant. Your job is to have a short, warm conversation with the user to understand what kind of events they'd enjoy, then recommend matching events from the database.

Your conversation flow:
1. Greet them warmly and ask about their city/location (give common options: Riyadh, Jeddah, Dubai, Cairo, Amman, etc.)
2. Ask what kind of events they enjoy (give examples: music 🎵, tech 💻, art 🎨, sports ⚽, food 🍽️, business 💼, education 📚, community 🤝)
3. Ask whether they prefer free events, paid events, or both
4. Optionally ask if they have a date preference (this week, this month, any time)

Once you have gathered location + at least one interest, output a search block EXACTLY like this on its own line:
[SEARCH]{"city":"Riyadh","interests":["music","art"],"freeOnly":false,"dateRange":"month"}[/SEARCH]

Rules:
- Keep messages short and friendly (2–3 sentences max)
- Use 1–2 relevant emojis per message
- Ask one question at a time
- If the user gives a vague answer, accept it and move on
- After outputting [SEARCH]...[/SEARCH], add a brief friendly message like "Let me find some great events for you! 🔍"
- city must be one of: Riyadh, Jeddah, Dammam, Mecca, Medina, Khobar, Dubai, Abu Dhabi, Cairo, Alexandria, Giza, Amman, Aqaba, Kuwait City, Doha, Manama, Muscat, Salalah, Beirut, Ramallah, Casablanca, Marrakech, Tunis, Baghdad — or null if they don't specify
- interests is an array of: music, tech, art, sports, food, business, education, community, health, entertainment
- freeOnly: true/false/null (null = no preference)
- dateRange: "week", "month", or null`

interface ChatMessage {
  role: 'user' | 'model'
  parts: [{ text: string }]
}

interface SearchParams {
  city?: string | null
  interests?: string[]
  freeOnly?: boolean | null
  dateRange?: 'week' | 'month' | null
}

function extractSearchParams(text: string): SearchParams | null {
  const start = text.indexOf('[SEARCH]')
  const end = text.indexOf('[/SEARCH]')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(text.slice(start + 8, end))
  } catch {
    return null
  }
}

function stripSearchBlock(text: string): string {
  const start = text.indexOf('[SEARCH]')
  const end = text.indexOf('[/SEARCH]')
  if (start === -1 || end === -1) return text.trim()
  return (text.slice(0, start) + text.slice(end + 9)).trim()
}

async function fetchEvents(params: SearchParams) {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let query = supabase
    .from('events')
    .select(`
      *,
      organizer:profiles!organizer_id(
        id, display_name, avatar_url,
        organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified)
      ),
      category:event_categories(id, name_en, name_ar, icon)
    `)
    .eq('is_published', true)
    .eq('is_cancelled', false)
    .gte('start_at', new Date().toISOString())
    .order('start_at', { ascending: true })
    .limit(6)

  if (params.city) {
    query = query.eq('city', params.city)
  }

  if (params.freeOnly === true) {
    query = query.eq('is_free', true)
  }

  if (params.dateRange === 'week') {
    const end = new Date()
    end.setDate(end.getDate() + 7)
    query = query.lte('start_at', end.toISOString())
  } else if (params.dateRange === 'month') {
    const end = new Date()
    end.setMonth(end.getMonth() + 1)
    query = query.lte('start_at', end.toISOString())
  }

  // Filter by interests via category name
  if (params.interests && params.interests.length > 0) {
    const { data: cats } = await supabase
      .from('event_categories')
      .select('id, name_en')
      .in('name_en', params.interests.map((i) => i.charAt(0).toUpperCase() + i.slice(1)))

    if (cats && cats.length > 0) {
      query = query.in('category_id', cats.map((c) => c.id))
    }
  }

  const { data } = await query
  return data ?? []
}

export async function POST(req: NextRequest) {
  try {
    // Support both Bearer token (mobile) and anon usage
    const token = extractBearerToken(req)

    const body = await req.json()
    const { messages } = body as { messages: ChatMessage[] }

    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: 'messages array required' }, { status: 400 })
    }

    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL ?? 'gemini-1.5-flash',
      systemInstruction: SYSTEM_PROMPT,
    })

    const chat = model.startChat({ history: messages.slice(0, -1) })
    const lastMessage = messages[messages.length - 1]

    if (!lastMessage || lastMessage.role !== 'user') {
      return NextResponse.json({ error: 'Last message must be from user' }, { status: 400 })
    }

    const result = await chat.sendMessage(lastMessage.parts[0].text)
    const rawText = result.response.text()

    // Check if Gemini has gathered enough info and issued a search
    const searchParams = extractSearchParams(rawText)
    const replyText = stripSearchBlock(rawText)

    let events: unknown[] = []
    if (searchParams) {
      events = await fetchEvents(searchParams)
    }

    return NextResponse.json({
      data: {
        reply: replyText,
        events: events,
        done: searchParams !== null,
      },
    })
  } catch (err) {
    return handleApiError(err)
  }
}
