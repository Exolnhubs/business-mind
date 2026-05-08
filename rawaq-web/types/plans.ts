// Plan & subscription types — kept separate from database.ts for clarity

export type PlanType = "user" | "organizer" | "individual";
export type SubscriptionStatus =
  | "active"
  | "cancelled"
  | "expired"
  | "past_due";

export interface PlanDefinition {
  id: string;
  type: PlanType;
  name: string;
  name_ar: string;
  price_sar: number;
  billing_interval: string;
  events_per_month: number | null; // null = unlimited
  attendees_per_event: number | null; // null = unlimited
  platform_fee_pct: number; // 0.0000-1.0000 (e.g. 0.10 = 10%)
  features: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PlanCountryPrice {
  plan_id: string;
  country_code: string;
  currency_code: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

export interface ResolvedPlanDefinition extends PlanDefinition {
  price_amount: number;
  price_currency: string;
  pricing_country_code: string | null;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  cancelled_at: string | null;
  payment_ref: string | null;
  is_simulated: boolean;
  created_at: string;
  updated_at: string;
  plan?: PlanDefinition;
}

export interface OrganizerMonthlyUsage {
  organizer_id: string;
  month: string; // ISO date, first day of month (e.g. "2026-03-01")
  events_created: number;
}

// Helpers
export function feePercent(plan: PlanDefinition): string {
  return `${(plan.platform_fee_pct * 100).toFixed(0)}%`;
}

export function isUnlimited(value: number | null): value is null {
  return value === null;
}

export interface PlatformSetting {
  key: string;
  value: unknown;
  updated_at: string;
  updated_by: string | null;
}
