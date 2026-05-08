import { createSupabaseAdminClient } from './supabase/admin'
import { ForbiddenException, NotFoundException } from './errors'
import type { PlanCountryPrice, PlanDefinition, ResolvedPlanDefinition } from '@/types/plans'

type PlanFeatures = Record<string, unknown>
type CountryResolutionSource = 'profile_preferences' | 'country_membership' | 'default'

interface CountryResolution {
  countryCode: string
  source: CountryResolutionSource
}

type OrganizerPlanRow = {
  plan_id: string
  plan: {
    name: string | null
    events_per_month: number | null
    attendees_per_event: number | null
    features: PlanFeatures | null
  } | null
}

type UserPlanRow = {
  plan_id: string
  plan: {
    name: string | null
    features: PlanFeatures | null
  } | null
}

export interface OrganizerPlanAccess {
  planId: string
  name: string
  eventsPerMonth: number | null
  attendeesPerEvent: number | null
  features: PlanFeatures
}

export interface UserPlanAccess {
  planId: string
  name: string
  features: PlanFeatures
}

export interface ResolvedPlanCatalog {
  countryCode: string
  source: CountryResolutionSource
  plans: ResolvedPlanDefinition[]
}

function normalizeFeatures(value: unknown): PlanFeatures {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as PlanFeatures
}

function normalizeCountryCode(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length === 2 ? value.trim().toUpperCase() : null
}

function getProfileCountryCode(preferences: unknown): string | null {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return null
  const record = preferences as Record<string, unknown>
  return (
    normalizeCountryCode(record.country_code) ??
    normalizeCountryCode(record.countryCode) ??
    normalizeCountryCode(record.community_country_code)
  )
}

async function resolveCountryCode(userId: string): Promise<CountryResolution> {
  const admin = createSupabaseAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('preferences')
    .eq('id', userId)
    .single()

  const preferenceCountry = getProfileCountryCode(profile?.preferences)
  if (preferenceCountry) {
    return { countryCode: preferenceCountry, source: 'profile_preferences' }
  }

  const { data: memberships } = await admin
    .from('community_memberships')
    .select('community_id')
    .eq('user_id', userId)
    .eq('status', 'active')

  const membershipIds = [...new Set((memberships ?? []).map((row) => row.community_id).filter(Boolean))]
  if (membershipIds.length > 0) {
    const { data: countryCommunities } = await admin
      .from('communities')
      .select('id, country, member_count')
      .eq('level', 'country')
      .in('id', membershipIds)

    const countryCommunity = (countryCommunities ?? [])
      .map((community) => ({
        countryCode: normalizeCountryCode(community.country),
        memberCount: community.member_count ?? 0,
      }))
      .filter((community): community is { countryCode: string; memberCount: number } => Boolean(community.countryCode))
      .sort((a, b) => b.memberCount - a.memberCount)[0]

    if (countryCommunity) {
      return { countryCode: countryCommunity.countryCode, source: 'country_membership' }
    }
  }

  return { countryCode: 'SA', source: 'default' }
}

function resolvePlanPrice(plan: PlanDefinition, overrides: Map<string, PlanCountryPrice>): ResolvedPlanDefinition {
  const override = overrides.get(plan.id)
  return {
    ...plan,
    price_amount: override ? Number(override.amount) : Number(plan.price_sar),
    price_currency: override?.currency_code ?? 'SAR',
    pricing_country_code: override?.country_code ?? null,
  }
}

export function hasPlanFeature(features: PlanFeatures | null | undefined, key: string): boolean {
  return features?.[key] === true
}

export function getNumericPlanFeature(features: PlanFeatures | null | undefined, key: string): number | null {
  const value = features?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function canUseTicketScanner(plan: OrganizerPlanAccess | null): boolean {
  return hasPlanFeature(plan?.features, 'ticket_scanner')
}

export function getSaveLimit(plan: UserPlanAccess | null): number | null {
  if (!plan) return null
  if (hasPlanFeature(plan.features, 'unlimited_saves')) return null
  return getNumericPlanFeature(plan.features, 'saves_limit')
}

export async function getResolvedPlanCatalog(userId: string, type: 'user' | 'organizer' | 'individual'): Promise<ResolvedPlanCatalog> {
  const admin = createSupabaseAdminClient()
  const country = await resolveCountryCode(userId)

  const [{ data: plans }, { data: pricingRows }] = await Promise.all([
    admin
      .from('plan_definitions')
      .select('*')
      .eq('type', type)
      .eq('is_active', true)
      .order('sort_order'),
    admin
      .from('plan_country_prices')
      .select('*')
      .eq('country_code', country.countryCode),
  ])

  const pricingMap = new Map<string, PlanCountryPrice>(
    ((pricingRows ?? []) as PlanCountryPrice[]).map((row) => [row.plan_id, row]),
  )

  return {
    countryCode: country.countryCode,
    source: country.source,
    plans: ((plans ?? []) as PlanDefinition[]).map((plan) => resolvePlanPrice(plan, pricingMap)),
  }
}

export async function getOrganizerPlanAccess(userId: string): Promise<OrganizerPlanAccess> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('organizer_profiles')
    .select('plan_id, plan:plan_definitions(name, events_per_month, attendees_per_event, features)')
    .eq('user_id', userId)
    .single()

  if (error || !data) throw new ForbiddenException('Organizer profile not found')

  const row = data as unknown as OrganizerPlanRow
  return {
    planId: row.plan_id,
    name: row.plan?.name ?? row.plan_id,
    eventsPerMonth: row.plan?.events_per_month ?? null,
    attendeesPerEvent: row.plan?.attendees_per_event ?? null,
    features: normalizeFeatures(row.plan?.features),
  }
}

export async function getUserPlanAccess(userId: string): Promise<UserPlanAccess> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('plan_id, plan:plan_definitions(name, features)')
    .eq('id', userId)
    .single()

  if (error || !data) throw new NotFoundException('Profile')

  const row = data as unknown as UserPlanRow
  return {
    planId: row.plan_id,
    name: row.plan?.name ?? row.plan_id,
    features: normalizeFeatures(row.plan?.features),
  }
}

export function getFeaturedPerMonth(plan: OrganizerPlanAccess | null): number {
  return getNumericPlanFeature(plan?.features, 'featured_per_month') ?? 0
}

export function isFreeSessionsOnly(plan: OrganizerPlanAccess | null): boolean {
  if (!plan) return true
  return hasPlanFeature(plan.features, 'free_sessions_only')
}

export function getPayoutHoldDays(plan: OrganizerPlanAccess | null): number {
  return getNumericPlanFeature(plan?.features, 'payout_hold_days') ?? 7
}

export function isIndividualPlan(plan: OrganizerPlanAccess | null): boolean {
  if (!plan) return false
  return plan.features.organizer_type === 'individual'
}
