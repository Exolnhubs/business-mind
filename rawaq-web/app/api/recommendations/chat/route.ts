import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { handleApiError, ApiException } from "@/lib/errors";
import { requireAuth } from "@/lib/auth";
import { limiters, checkRateLimit } from "@/lib/rate-limit";
import { isTransientGeminiError, runGeminiWithFallback } from "@/lib/gemini";
import type { Database } from "@/types/database";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(
  organizers: { id: string; name: string }[],
  context: { savedCount: number; hasFeatured: boolean; hasHotOffers: boolean; joinedCommunityNames: string[] },
): string {
  const organizerBlock =
    organizers.length > 0
      ? `\nFOLLOWED ORGANIZERS: The user follows these organizers: ${organizers.map((o) => o.name).join(", ")}. When you have results from these organizers, mention it — e.g. "I found something from [Organizer] who you already follow 🎉". Prioritise their events when they match preferences.\n`
      : "";

  const savedBlock =
    context.savedCount > 0
      ? `\nSAVED EVENTS: The user has ${context.savedCount} saved event${context.savedCount > 1 ? "s" : ""} in their wishlist. If they mention wanting to revisit saved events, let them know they can tap the bookmark icon on the Home screen. Don't re-recommend events they've already saved unless they specifically ask.\n`
      : "";

  const featuredBlock = context.hasFeatured
    ? `\nFEATURED EVENTS: Rawaq currently has curated featured events — editorially selected highlights. When results include featured events, mention them as "hand-picked" or "trending right now" to create excitement.\n`
    : "";

  const hotOffersBlock = context.hasHotOffers
    ? `\nHOT OFFERS: Some events have limited-time discounted tickets (Hot Offers 🔥). When search results include hot-offer events, highlight the discount excitement — e.g. "This one has a special deal right now — grab it before it's gone! 🔥". Always mention the savings angle.\n`
    : "";

  const communitiesBlock =
    context.joinedCommunityNames.length > 0
      ? `\nCOMMUNITIES: The user is a member of these Rawaq communities: ${context.joinedCommunityNames.join(", ")}. When relevant events match their community interests, say something like "This looks perfect for the ${context.joinedCommunityNames[0]} community you're in 🤝". Also, if they seem interested in a niche (e.g. running, art), suggest they explore Rawaq Communities to connect with like-minded people.\n`
      : `\nCOMMUNITIES: Rawaq has a thriving Communities feature where users join local and interest-based groups. If the user shows interest in a recurring theme (e.g. fitness, music, tech), naturally suggest they explore Rawaq Communities — e.g. "There's also a great community for [interest] on Rawaq if you want to connect with people beyond just this event 🤝"\n`;

  return `You are Rawaq's smart, warm event discovery assistant. Your goal is to recommend events the user will genuinely love through a short, friendly conversation — while naturally surfacing the best of what Rawaq has to offer.

LANGUAGE: Detect the language of the user's very first message and use that same language for ALL your conversational replies throughout the session. If the user writes in Arabic, reply in Arabic. If they write in English, reply in English. Never switch languages mid-conversation unless the user does first. The technical blocks [SEARCH]...[/SEARCH] must always stay in English (the server parses them), but every word the user reads must be in their language.

PERSONALITY: Enthusiastic, concise, never robotic. Use 1-2 emojis per message. Keep messages to 2-3 sentences. Ask ONE question at a time.
${organizerBlock}${savedBlock}${featuredBlock}${hotOffersBlock}${communitiesBlock}
RAWAQ FEATURES YOU KNOW ABOUT (weave these in naturally, never list them robotically):
- Hot Offers 🔥: Limited-time discounted tickets. Always worth a mention when available.
- Featured Events ✨: Hand-picked highlights by the Rawaq team — curated, trending, or special.
- Saved Events 🔖: Users can bookmark events for later from any event card.
- Communities 🤝: Local and interest-based groups users can join to connect with like-minded people and discover community events.

CONVERSATION FLOW:
1. Greet warmly. Ask which city they're in (give examples: Riyadh, Jeddah, Dubai, Cairo, Amman…)
2. Ask what kind of events they enjoy (music 🎵, tech 💻, art 🎨, sports ⚽, food 🍽️, business 💼, education 📚, community 🤝)
3. Ask free vs paid vs no preference
4. Optionally ask timing (this week / this month / any time)

Once you have city + at least one interest, output EXACTLY this on its own line:
[SEARCH]{"city":"Riyadh","interests":["music"],"freeOnly":false,"dateRange":"month"}[/SEARCH]
Then add a short "Let me search for you! 🔍" message.

HANDLING SEARCH RESULTS:
After you output [SEARCH], the system will inject a [SEARCH_CONTEXT] block showing what was found. Use this to:
- If exact results include hot-offer events → lead with the savings angle 🔥
- If exact results include featured events → call them out as "hand-picked" or "trending" ✨
- If exact results found (no special flags) → "Great news, I found some events for you! 🎉"
- If only fallback results → naturally pivot: "I didn't find X but I did find Y nearby — want to check those out?"
- If nothing at all → apologise briefly, ask if they want to try a different city, category, or time. Optionally suggest joining a relevant community to stay updated.

RULES:
- NEVER dead-end the conversation. Always offer an alternative or ask a follow-up.
- NEVER repeat the same question twice.
- Accept vague or partial answers and move on.
- Mention Hot Offers, Featured Events, or Communities at most once each per session — don't spam features.
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
  hasHotOffers?: boolean;
  hasFeatured?: boolean;
}

interface UserContext {
  savedCount: number;
  hasFeatured: boolean;
  hasHotOffers: boolean;
  joinedCommunityNames: string[];
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
      featured_at,
      featured_until,
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
  function detectFlags(events: unknown[]): { hasHotOffers: boolean; hasFeatured: boolean } {
    const now = new Date().toISOString();
    let hasHotOffers = false;
    let hasFeatured = false;
    for (const e of events as Record<string, unknown>[]) {
      if (!hasFeatured && e.featured_at && (!e.featured_until || (e.featured_until as string) > now)) {
        hasFeatured = true;
      }
      if (!hasHotOffers) {
        const tts = e.ticket_types as { is_hot_offer?: boolean; hot_offer_ends_at?: string | null }[] | undefined;
        if (tts?.some((t) => t.is_hot_offer && (!t.hot_offer_ends_at || t.hot_offer_ends_at > now))) {
          hasHotOffers = true;
        }
      }
      if (hasHotOffers && hasFeatured) break;
    }
    return { hasHotOffers, hasFeatured };
  }

  // 1. Exact match
  const exact = await queryEvents(params, organizerIds);
  if (exact.length > 0) {
    const flags = detectFlags(exact);
    return { events: exact, strategy: "exact", description: "", ...flags };
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

async function fetchUserContext(userId: string | null): Promise<UserContext> {
  if (!userId) return { savedCount: 0, hasFeatured: false, hasHotOffers: false, joinedCommunityNames: [] };

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const now = new Date().toISOString();

  const [savedRes, featuredRes, hotRes, commRes] = await Promise.all([
    supabase.from("saved_events").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("events").select("id", { count: "exact", head: true })
      .eq("is_published", true).not("featured_at", "is", null)
      .gte("start_at", now).limit(1),
    supabase.from("ticket_types").select("id", { count: "exact", head: true })
      .eq("is_hot_offer", true).or(`hot_offer_ends_at.is.null,hot_offer_ends_at.gt.${now}`).limit(1),
    supabase.from("community_members").select("community:communities(name)")
      .eq("user_id", userId).eq("status", "active").limit(5),
  ]);

  const joinedCommunityNames: string[] = [];
  if (commRes.data) {
    for (const row of commRes.data as { community: { name: string } | null }[]) {
      if (row.community?.name) joinedCommunityNames.push(row.community.name);
    }
  }

  return {
    savedCount: savedRes.count ?? 0,
    hasFeatured: (featuredRes.count ?? 0) > 0,
    hasHotOffers: (hotRes.count ?? 0) > 0,
    joinedCommunityNames,
  };
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    await checkRateLimit(limiters.recommendations, ctx.userId);

    const body = await req.json();
    const { messages, followedOrganizers = [] } = body as {
      messages: ChatMessage[];
      followedOrganizers?: { id: string; name: string }[];
    };
    const userId = ctx.userId;

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

    const userContext = await fetchUserContext(userId);

    const systemInstruction = buildSystemPrompt(followedOrganizers, userContext);
    const sendGeminiChat = async (
      history: ChatMessage[],
      text: string,
      operation: string,
    ) => runGeminiWithFallback(async (modelName) => {
      const model = genAI.getGenerativeModel({ model: modelName, systemInstruction });
      const chat = model.startChat({ history });
      const result = await chat.sendMessage(text);
      return result.response.text();
    }, { route: "recommendations/chat", operation });

    // ── First Gemini call ────────────────────────────────────────────────────
    const rawText = await sendGeminiChat(
      messages.slice(0, -1),
      lastMessage.parts[0].text,
      "initial",
    );

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
      const flags: string[] = [];
      if (fetchResult.hasHotOffers) flags.push("SOME_RESULTS_HAVE_HOT_OFFER_DISCOUNTS");
      if (fetchResult.hasFeatured) flags.push("SOME_RESULTS_ARE_FEATURED_EVENTS");
      const flagNote = flags.length > 0 ? `\nSpecial signals in results: ${flags.join(", ")}. Highlight these naturally in your reply.` : "";
      if (flagNote) {
        const contextBlock = `[SEARCH_CONTEXT]\nExact results found.${flagNote}\nDo NOT output another [SEARCH] block.\n[/SEARCH_CONTEXT]`;
        const updatedHistory: ChatMessage[] = [
          ...messages,
          { role: "model", parts: [{ text: rawText }] },
          { role: "user", parts: [{ text: contextBlock }] },
        ];
        const exactReply = await sendGeminiChat(
          updatedHistory.slice(0, -1),
          updatedHistory[updatedHistory.length - 1].parts[0].text,
          "exact_context",
        );
        return NextResponse.json({
          data: { reply: exactReply, events: fetchResult.events, done: true },
        });
      }
      return NextResponse.json({
        data: { reply: replyText, events: fetchResult.events, done: true },
      });
    }

    // Fallback or nothing found — inject context and ask Gemini to pivot
    const noneExtra = fetchResult.strategy === "none" && userContext.joinedCommunityNames.length > 0
      ? ` You can suggest they check their Rawaq Communities (${userContext.joinedCommunityNames.join(", ")}) for local event announcements.`
      : "";
    const contextBlock =
      fetchResult.strategy === "none"
        ? `[SEARCH_CONTEXT]\nNo events found at all for: city=${searchParams.city ?? "any"}, interests=${searchParams.interests?.join(",") ?? "any"}, dateRange=${searchParams.dateRange ?? "any"}.\nPlease apologise briefly and ask if they want to try a different city, category, or time period.${noneExtra}\n[/SEARCH_CONTEXT]`
        : `[SEARCH_CONTEXT]\n${fetchResult.description}\nFallback strategy: ${fetchResult.strategy}. Found ${fetchResult.events.length} events.${fetchResult.hasHotOffers ? " Some include Hot Offer discounts — mention the deal angle 🔥." : ""}${fetchResult.hasFeatured ? " Some are Featured events — call them out as hand-picked ✨." : ""}\nPlease suggest these alternatives naturally and warmly. Do NOT output another [SEARCH] block.\n[/SEARCH_CONTEXT]`;

    // Build updated history including the first Gemini reply + the context injection
    const updatedHistory: ChatMessage[] = [
      ...messages,
      { role: "model", parts: [{ text: rawText }] },
      { role: "user", parts: [{ text: contextBlock }] },
    ];

    const pivotReply = await sendGeminiChat(
      updatedHistory.slice(0, -1),
      updatedHistory[updatedHistory.length - 1].parts[0].text,
      "fallback_context",
    );

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
    // ApiException (including RateLimitException with statusCode 429) must go
    // through handleApiError — not the Gemini busy path, which checks status 429.
    if (!(err instanceof ApiException) && isTransientGeminiError(err)) {
      return NextResponse.json({
        data: {
          reply: "The recommendation assistant is busy right now. Please try again in a moment.",
          events: [],
          done: false,
          temporaryUnavailable: true,
        },
      });
    }
    return handleApiError(err);
  }
}
