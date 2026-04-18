import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { handleApiError } from "@/lib/errors";
import type { Database } from "@/types/database";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(organizers: { id: string; name: string }[]): string {
  const organizerBlock =
    organizers.length > 0
      ? `\nFOLLOWED ORGANIZERS: The user follows these organizers: ${organizers.map((o) => o.name).join(", ")}. When you have results from these organizers, mention it — e.g. "I found something from [Organizer] who you already follow 🎉". Prioritise their events when they match preferences.\n`
      : "";

  return `You are Rawaq's smart, warm event discovery assistant. Your goal is to recommend events the user will genuinely love through a short, friendly conversation.

PERSONALITY: Enthusiastic, concise, never robotic. Use 1-2 emojis per message. Keep messages to 2-3 sentences. Ask ONE question at a time.${organizerBlock}
CONVERSATION FLOW:
1. Greet warmly. Ask which city they're in (give examples: Riyadh, Jeddah, Dubai, Cairo, Amman…)
2. Ask what kind of events they enjoy (music 🎵, tech 💻, art 🎨, sports ⚽, food 🍽️, business 💼, education 📚, community 🤝)
3. Ask free vs paid vs no preference
4. Optionally ask timing (this week / this month / any time)

Once you have city + at least one interest, output EXACTLY this on its own line:
[SEARCH]{"city":"Riyadh","interests":["music"],"freeOnly":false,"dateRange":"month"}[/SEARCH]
Then add a short "Let me search for you! 🔍" message.

HANDLING SEARCH RESULTS:
After you output [SEARCH], the system will inject a [SEARCH_CONTEXT] block showing what was found (exact matches, fallbacks, etc.). Use this to:
- If exact results found → say something like "Great news, I found some events for you! 🎉" — the app will show the cards below.
- If only fallback results found → naturally pivot: "I didn't find X but I did find Y nearby — want to check those out?"
- If fallback results are from a different category → "No music events this week, but there are some great art events in Riyadh this month. Interested? 🎨"
- If nothing at all → apologise briefly, ask if they want to try a different city, category, or time.

RULES:
- NEVER dead-end the conversation. Always offer an alternative or ask a follow-up.
- NEVER repeat the same question twice.
- Accept vague or partial answers and move on.
- city must be one of: Riyadh, Jeddah, Dammam, Mecca, Medina, Khobar, Dubai, Abu Dhabi, Cairo, Alexandria, Giza, Amman, Aqaba, Kuwait City, Doha, Manama, Muscat, Salalah, Beirut, Ramallah, Casablanca, Marrakech, Tunis, Baghdad — or null.
- interests: music, tech, art, sports, food, business, education, community, health, entertainment
- freeOnly: true/false/null
- dateRange: "week", "month", or null`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "model";
  parts: [{ text: string }];
}

interface SearchParams {
  city?: string | null;
  interests?: string[];
  freeOnly?: boolean | null;
  dateRange?: "week" | "month" | null;
}

interface FetchResult {
  events: unknown[];
  strategy:
    | "exact"
    | "relaxed_date"
    | "relaxed_city"
    | "relaxed_category"
    | "followed_organizers"
    | "none";
  description: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractSearchParams(text: string): SearchParams | null {
  const start = text.indexOf("[SEARCH]");
  const end = text.indexOf("[/SEARCH]");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(text.slice(start + 8, end));
  } catch {
    return null;
  }
}

function stripSearchBlock(text: string): string {
  const start = text.indexOf("[SEARCH]");
  const end = text.indexOf("[/SEARCH]");
  if (start === -1 || end === -1) return text.trim();
  return (text.slice(0, start) + text.slice(end + 9)).trim();
}

// ── Supabase event query ──────────────────────────────────────────────────────

async function queryEvents(
  params: SearchParams,
  organizerIds: string[] = [],
  organizerOnly = false,
) {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let query = supabase
    .from("events")
    .select(
      `
      *,
      organizer:profiles!organizer_id(
        id, display_name, avatar_url,
        organizer_profile:organizer_profiles!user_id(business_name, business_name_ar, logo_url, verified)
      ),
      category:event_categories(id, name_en, name_ar, icon),
      ticket_types(id, price, is_free, is_active, is_hot_offer, hot_offer_price, hot_offer_ends_at)
    `,
    )
    .eq("is_published", true)
    .eq("is_cancelled", false)
    .gte("start_at", new Date().toISOString())
    .order("start_at", { ascending: true })
    .limit(6);

  if (params.city) query = query.eq("city", params.city);
  if (params.freeOnly === true) query = query.eq("is_free", true);

  if (params.dateRange === "week") {
    const end = new Date();
    end.setDate(end.getDate() + 7);
    query = query.lte("start_at", end.toISOString());
  } else if (params.dateRange === "month") {
    const end = new Date();
    end.setMonth(end.getMonth() + 1);
    query = query.lte("start_at", end.toISOString());
  }

  if (organizerOnly && organizerIds.length > 0) {
    query = query.in("organizer_id", organizerIds);
  } else if (params.interests && params.interests.length > 0) {
    const { data: cats } = await supabase
      .from("event_categories")
      .select("id")
      .in(
        "name_en",
        params.interests.map((i) => i.charAt(0).toUpperCase() + i.slice(1)),
      );
    if (cats && cats.length > 0) {
      query = query.in(
        "category_id",
        cats.map((c) => c.id),
      );
    }
  }

  const { data } = await query;
  return data ?? [];
}

// ── Fallback search strategy ──────────────────────────────────────────────────

async function fetchEventsWithFallback(
  params: SearchParams,
  organizerIds: string[],
  organizerNames: string[],
): Promise<FetchResult> {
  // 1. Exact match
  const exact = await queryEvents(params, organizerIds);
  if (exact.length > 0) {
    return { events: exact, strategy: "exact", description: "" };
  }

  // 2. Relax date (keep city + category)
  if (params.dateRange) {
    const relaxed = await queryEvents(
      { ...params, dateRange: null },
      organizerIds,
    );
    if (relaxed.length > 0) {
      const label = params.dateRange === "week" ? "this week" : "this month";
      return {
        events: relaxed,
        strategy: "relaxed_date",
        description: `No events found for ${label}, but there are upcoming events beyond that window.`,
      };
    }
  }

  // 3. Relax city (keep category + date)
  if (params.city) {
    const relaxed = await queryEvents({ ...params, city: null }, organizerIds);
    if (relaxed.length > 0) {
      return {
        events: relaxed,
        strategy: "relaxed_city",
        description: `No events found in ${params.city}, but there are matching events in other cities.`,
      };
    }
  }

  // 4. Relax category (keep city + date — any events in that location)
  if (params.interests && params.interests.length > 0) {
    const relaxed = await queryEvents(
      { ...params, interests: [] },
      organizerIds,
    );
    if (relaxed.length > 0) {
      const cats = params.interests.join(" / ");
      return {
        events: relaxed,
        strategy: "relaxed_category",
        description: `No ${cats} events found, but there are other events in ${params.city ?? "your area"} you might enjoy.`,
      };
    }
  }

  // 5. Followed organizers' upcoming events (regardless of preferences)
  if (organizerIds.length > 0) {
    const relaxed = await queryEvents({ dateRange: null }, organizerIds, true);
    if (relaxed.length > 0) {
      return {
        events: relaxed,
        strategy: "followed_organizers",
        description: `Nothing matching your preferences right now, but here are upcoming events from organizers you follow (${organizerNames.join(", ")}).`,
      };
    }
  }

  return {
    events: [],
    strategy: "none",
    description: "No events found matching any criteria.",
  };
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, followedOrganizers = [] } = body as {
      messages: ChatMessage[];
      followedOrganizers?: { id: string; name: string }[];
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages array required" },
        { status: 400 },
      );
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") {
      return NextResponse.json(
        { error: "Last message must be from user" },
        { status: 400 },
      );
    }

    const organizerIds = followedOrganizers.map((o) => o.id);
    const organizerNames = followedOrganizers.map((o) => o.name);

    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL ?? "gemini-1.5-flash",
      systemInstruction: buildSystemPrompt(followedOrganizers),
    });

    // ── First Gemini call ────────────────────────────────────────────────────
    const chat = model.startChat({ history: messages.slice(0, -1) });
    const result = await chat.sendMessage(lastMessage.parts[0].text);
    const rawText = result.response.text();

    const searchParams = extractSearchParams(rawText);
    const replyText = stripSearchBlock(rawText);

    // No search triggered yet — normal conversational turn
    if (!searchParams) {
      return NextResponse.json({
        data: { reply: replyText, events: [], done: false },
      });
    }

    // ── Search triggered — run with fallback ─────────────────────────────────
    const fetchResult = await fetchEventsWithFallback(
      searchParams,
      organizerIds,
      organizerNames,
    );

    // Exact match found — done
    if (fetchResult.strategy === "exact") {
      return NextResponse.json({
        data: { reply: replyText, events: fetchResult.events, done: true },
      });
    }

    // Fallback or nothing found — inject context and ask Gemini to pivot
    const contextBlock =
      fetchResult.strategy === "none"
        ? `[SEARCH_CONTEXT]\nNo events found at all for: city=${searchParams.city ?? "any"}, interests=${searchParams.interests?.join(",") ?? "any"}, dateRange=${searchParams.dateRange ?? "any"}.\nPlease apologise briefly and ask the user if they want to try a different city, category, or time period.\n[/SEARCH_CONTEXT]`
        : `[SEARCH_CONTEXT]\n${fetchResult.description}\nFallback strategy: ${fetchResult.strategy}. Found ${fetchResult.events.length} events.\nPlease suggest these alternatives naturally and warmly. Do NOT output another [SEARCH] block.\n[/SEARCH_CONTEXT]`;

    // Build updated history including the first Gemini reply + the context injection
    const updatedHistory: ChatMessage[] = [
      ...messages,
      { role: "model", parts: [{ text: rawText }] },
      { role: "user", parts: [{ text: contextBlock }] },
    ];

    const chat2 = model.startChat({ history: updatedHistory.slice(0, -1) });
    const result2 = await chat2.sendMessage(
      updatedHistory[updatedHistory.length - 1].parts[0].text,
    );
    const pivotReply = result2.response.text();

    return NextResponse.json({
      data: {
        reply: pivotReply,
        events: fetchResult.events,
        // done only if we actually have events to show
        done: fetchResult.events.length > 0,
        // Let client know this is a fallback so it can display events but keep chat open
        isFallback: fetchResult.events.length > 0,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
