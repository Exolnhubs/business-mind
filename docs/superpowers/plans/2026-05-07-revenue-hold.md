# Revenue Hold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hold organizer revenue from ticket sales for a configurable number of hours (default 24, min 1) before it becomes withdrawable, with the held amount visible as an aggregate on the earnings page.

**Architecture:** A new `held_balance` column on `organizer_wallet` holds ticket-sale revenue until it matures. A `revenue_holds` table tracks one row per transaction with a `held_until` timestamp. The existing `fn_sync_wallet_on_payment` trigger is updated to route ticket credits to `held_balance`; a new `fn_release_expired_revenue_holds` function runs via pg_cron every 15 minutes to graduate held → available. Tips are unaffected. Refunds during the hold window cancel the hold first before touching `balance`.

**Tech Stack:** PostgreSQL (Supabase), pg_cron, Next.js 14 App Router, TypeScript, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-05-07-revenue-hold-design.md`

---

## File Map

| File | Change |
|---|---|
| `rawaq-web/supabase/migrations/00085_revenue_holds.sql` | CREATE — full DB migration |
| `rawaq-web/types/database.ts` | MODIFY — add `held_balance`, `RevenueHold`, `WalletLedgerReason` |
| `rawaq-web/app/api/organizer/wallet/route.ts` | MODIFY — select `held_balance` |
| `rawaq-web/components/owner/SettingsEditor.tsx` | MODIFY — add `'integer'` type, add `revenue_hold_hours` entry |
| `rawaq-web/app/(app)/organizer/earnings/page.tsx` | MODIFY — held balance card, `hold_released` label |

---

## Task 1: DB Migration

**Files:**
- Create: `rawaq-web/supabase/migrations/00085_revenue_holds.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- ============================================================
-- Migration 00085 — Revenue Hold System
--
-- Changes:
--   organizer_wallet  — ADD held_balance column
--   revenue_holds     — NEW table (per-transaction hold records)
--   platform_settings — SEED revenue_hold_hours = 24
--   wallet_ledger     — EXTEND reason CHECK for 'hold_released'
--   fn_sync_wallet_on_payment  — updated: tickets→held_balance, refund hits hold first
--   fn_release_expired_revenue_holds — NEW release function
--   pg_cron           — schedule release every 15 minutes
-- ============================================================

-- 1. Add held_balance to organizer_wallet
ALTER TABLE organizer_wallet
  ADD COLUMN held_balance NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (held_balance >= 0);

-- 2. revenue_holds table
CREATE TABLE revenue_holds (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id           UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payment_transaction_id UUID          NOT NULL REFERENCES payment_transactions(id),
  amount                 NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  held_until             TIMESTAMPTZ   NOT NULL,
  released_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (payment_transaction_id)
);

CREATE INDEX idx_revenue_holds_organizer ON revenue_holds(organizer_id, held_until);
CREATE INDEX idx_revenue_holds_pending   ON revenue_holds(held_until) WHERE released_at IS NULL;

ALTER TABLE revenue_holds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rh_read_own" ON revenue_holds FOR SELECT USING (organizer_id = auth.uid());
CREATE POLICY "rh_admin"    ON revenue_holds FOR ALL   USING (is_admin());

-- 3. Extend wallet_ledger reason CHECK
ALTER TABLE wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_reason_check;
ALTER TABLE wallet_ledger ADD CONSTRAINT wallet_ledger_reason_check
  CHECK (reason IN ('tip', 'ticket_sale', 'refund_deducted', 'payout', 'adjustment', 'hold_released'));

-- 4. Seed platform setting (default 24 hours)
INSERT INTO platform_settings (key, value)
VALUES ('revenue_hold_hours', '24'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 5. Update fn_sync_wallet_on_payment
--    Tips → balance directly (unchanged)
--    Ticket sales → held_balance + revenue_holds row (no ledger entry yet)
--    Refund → cancel active hold first, then deduct remainder from balance
CREATE OR REPLACE FUNCTION fn_sync_wallet_on_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance_after NUMERIC(12,2);
  v_hold_hours    INT;
  v_hold_amount   NUMERIC(10,2);
  v_hold_id       UUID;
BEGIN
  -- ── Credit ─────────────────────────────────────────────────
  IF NEW.status = 'succeeded'
     AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status != 'succeeded'))
  THEN
    IF NEW.type = 'tip' THEN
      -- Tips: credit balance directly, write ledger entry immediately
      INSERT INTO organizer_wallet (organizer_id, balance, total_earned, currency)
      VALUES (NEW.organizer_id, NEW.organizer_net, NEW.organizer_net, NEW.currency)
      ON CONFLICT (organizer_id) DO UPDATE
        SET balance      = organizer_wallet.balance + NEW.organizer_net,
            total_earned = organizer_wallet.total_earned + NEW.organizer_net,
            updated_at   = NOW();

      SELECT balance INTO v_balance_after
      FROM organizer_wallet WHERE organizer_id = NEW.organizer_id;

      INSERT INTO wallet_ledger
        (organizer_id, payment_transaction_id, type, reason, amount, balance_before, balance_after)
      VALUES
        (NEW.organizer_id, NEW.id, 'credit', 'tip', NEW.organizer_net,
         v_balance_after - NEW.organizer_net, v_balance_after);

    ELSE
      -- Ticket sales: credit held_balance, insert hold row.
      -- No ledger entry here — it is written at release time by fn_release_expired_revenue_holds.
      SELECT GREATEST(1, COALESCE((value #>> '{}')::int, 24))
      INTO   v_hold_hours
      FROM   platform_settings
      WHERE  key = 'revenue_hold_hours';

      v_hold_hours := COALESCE(v_hold_hours, 24);

      INSERT INTO organizer_wallet (organizer_id, held_balance, total_earned, currency)
      VALUES (NEW.organizer_id, NEW.organizer_net, NEW.organizer_net, NEW.currency)
      ON CONFLICT (organizer_id) DO UPDATE
        SET held_balance = organizer_wallet.held_balance + NEW.organizer_net,
            total_earned = organizer_wallet.total_earned + NEW.organizer_net,
            updated_at   = NOW();

      INSERT INTO revenue_holds
        (organizer_id, payment_transaction_id, amount, held_until)
      VALUES
        (NEW.organizer_id, NEW.id, NEW.organizer_net,
         NOW() + (v_hold_hours || ' hours')::interval);
    END IF;
  END IF;

  -- ── Debit (refund) ─────────────────────────────────────────
  IF TG_OP = 'UPDATE' AND OLD.status != 'refunded' AND NEW.status = 'refunded' THEN
    -- Check for an active (unreleased) hold on this transaction
    SELECT id, amount
    INTO   v_hold_id, v_hold_amount
    FROM   revenue_holds
    WHERE  payment_transaction_id = NEW.id AND released_at IS NULL;

    IF v_hold_id IS NOT NULL THEN
      -- Cancel the hold; deduct any remainder beyond hold amount from balance
      UPDATE revenue_holds SET released_at = NOW() WHERE id = v_hold_id;

      UPDATE organizer_wallet
      SET    held_balance = GREATEST(0, held_balance - v_hold_amount),
             balance      = GREATEST(0, balance - GREATEST(0, NEW.organizer_net - v_hold_amount)),
             updated_at   = NOW()
      WHERE  organizer_id = NEW.organizer_id;
    ELSE
      -- Hold already released: full deduction from balance
      UPDATE organizer_wallet
      SET    balance    = GREATEST(0, balance - NEW.organizer_net),
             updated_at = NOW()
      WHERE  organizer_id = NEW.organizer_id;
    END IF;

    SELECT balance INTO v_balance_after
    FROM organizer_wallet WHERE organizer_id = NEW.organizer_id;

    -- Ledger entry records the net impact on withdrawable balance
    INSERT INTO wallet_ledger
      (organizer_id, payment_transaction_id, type, reason, amount, balance_before, balance_after)
    VALUES
      (NEW.organizer_id, NEW.id, 'debit', 'refund_deducted', NEW.organizer_net,
       v_balance_after + CASE
         WHEN v_hold_id IS NOT NULL THEN GREATEST(0, NEW.organizer_net - v_hold_amount)
         ELSE NEW.organizer_net
       END,
       v_balance_after);
  END IF;

  RETURN NEW;
END;
$$;

-- 6. Revenue hold release function (called by pg_cron)
CREATE OR REPLACE FUNCTION fn_release_expired_revenue_holds()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_hold          RECORD;
  v_balance_after NUMERIC(12,2);
BEGIN
  FOR v_hold IN
    SELECT id, organizer_id, payment_transaction_id, amount
    FROM   revenue_holds
    WHERE  held_until <= NOW() AND released_at IS NULL
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Graduate held → available
    UPDATE organizer_wallet
    SET    balance      = balance + v_hold.amount,
           held_balance = GREATEST(0, held_balance - v_hold.amount),
           updated_at   = NOW()
    WHERE  organizer_id = v_hold.organizer_id;

    SELECT balance INTO v_balance_after
    FROM organizer_wallet WHERE organizer_id = v_hold.organizer_id;

    -- Mark hold released
    UPDATE revenue_holds SET released_at = NOW() WHERE id = v_hold.id;

    -- Write ledger entry now that funds are withdrawable
    INSERT INTO wallet_ledger
      (organizer_id, payment_transaction_id, type, reason, amount, balance_before, balance_after)
    VALUES
      (v_hold.organizer_id, v_hold.payment_transaction_id, 'credit', 'hold_released',
       v_hold.amount, v_balance_after - v_hold.amount, v_balance_after);
  END LOOP;
END;
$$;

-- 7. Schedule pg_cron job (every 15 minutes, matches happenings cleanup cadence)
SELECT cron.schedule(
  'release-revenue-holds',
  '*/15 * * * *',
  $$ SELECT fn_release_expired_revenue_holds(); $$
);
```

- [ ] **Step 2: Apply the migration via Supabase CLI**

```bash
cd rawaq-web
npx supabase db push
```

Expected: migration applies without errors. If you see "constraint does not exist" on the DROP CONSTRAINT, it means the constraint has a different auto-generated name. Find it with:
```sql
SELECT conname FROM pg_constraint WHERE conrelid = 'wallet_ledger'::regclass AND contype = 'c';
```
Then replace `wallet_ledger_reason_check` in the migration with the actual name.

- [ ] **Step 3: Verify the schema in Supabase Studio**

In Supabase Studio → Table Editor:
- `organizer_wallet` has a `held_balance` column with default 0
- `revenue_holds` table exists with the expected columns
- `platform_settings` has a row `revenue_hold_hours = 24`

- [ ] **Step 4: Smoke-test the trigger logic manually**

In the SQL editor, simulate a ticket payment and confirm the hold is created:
```sql
-- Check current state (substitute a real organizer UUID)
SELECT balance, held_balance, total_earned FROM organizer_wallet WHERE organizer_id = '<uuid>';
SELECT * FROM revenue_holds WHERE organizer_id = '<uuid>' ORDER BY created_at DESC LIMIT 5;
```
After a real test ticket purchase through the app, `held_balance` should increase and `balance` should stay the same.

- [ ] **Step 5: Commit**

```bash
git add rawaq-web/supabase/migrations/00085_revenue_holds.sql
git commit -m "feat(db): add revenue hold system — held_balance, revenue_holds, release cron"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `rawaq-web/types/database.ts`

- [ ] **Step 1: Add `hold_released` to `WalletLedgerReason` (line 106)**

Find:
```typescript
export type WalletLedgerReason =
  | "tip"
  | "ticket_sale"
  | "refund_deducted"
  | "payout"
  | "adjustment";
```

Replace with:
```typescript
export type WalletLedgerReason =
  | "tip"
  | "ticket_sale"
  | "refund_deducted"
  | "payout"
  | "adjustment"
  | "hold_released";
```

- [ ] **Step 2: Add `held_balance` to `OrganizerWallet` (line 396)**

Find:
```typescript
export interface OrganizerWallet {
  organizer_id: string;
  balance: number;
  total_earned: number;
  total_withdrawn: number;
  currency: string;
  is_simulated: boolean;
  updated_at: string;
}
```

Replace with:
```typescript
export interface OrganizerWallet {
  organizer_id: string;
  balance: number;
  held_balance: number;
  total_earned: number;
  total_withdrawn: number;
  currency: string;
  is_simulated: boolean;
  updated_at: string;
}
```

- [ ] **Step 3: Add `held_balance` to `OrganizerWalletRow` (line 851)**

Find:
```typescript
export interface OrganizerWalletRow {
  organizer_id: string;
  balance: number;
  total_earned: number;
  total_withdrawn: number;
  currency: string;
  updated_at: string;
}
```

Replace with:
```typescript
export interface OrganizerWalletRow {
  organizer_id: string;
  balance: number;
  held_balance: number;
  total_earned: number;
  total_withdrawn: number;
  currency: string;
  updated_at: string;
}
```

- [ ] **Step 4: Add `RevenueHold` interface after `OrganizerWalletRow`**

After the closing `}` of `OrganizerWalletRow`, insert:
```typescript
export interface RevenueHold {
  id: string;
  organizer_id: string;
  payment_transaction_id: string;
  amount: number;
  held_until: string;
  released_at: string | null;
  created_at: string;
}
```

- [ ] **Step 5: Add `revenue_holds` to the Database Tables type**

Find the `organizer_wallet` entry in the Database generic type (around line 1218):
```typescript
      organizer_wallet: {
        Row: R<OrganizerWalletRow>;
        Insert: R<OrganizerWalletRow>;
        Update: R<Partial<OrganizerWalletRow>>;
        Relationships: [];
      };
```

Insert after it:
```typescript
      revenue_holds: {
        Row: R<RevenueHold>;
        Insert: R<Omit<RevenueHold, "id" | "created_at">>;
        Update: R<Partial<RevenueHold>>;
        Relationships: [];
      };
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd rawaq-web
npx tsc --noEmit
```

Expected: no new errors. Fix any type errors that appear before moving on.

- [ ] **Step 7: Commit**

```bash
git add rawaq-web/types/database.ts
git commit -m "feat(types): add held_balance, RevenueHold, hold_released ledger reason"
```

---

## Task 3: Wallet API — expose `held_balance`

**Files:**
- Modify: `rawaq-web/app/api/organizer/wallet/route.ts`

The wallet table already has `held_balance` from the migration. The API just needs to include it in the select so it flows through to the client.

- [ ] **Step 1: Update the wallet select**

In `rawaq-web/app/api/organizer/wallet/route.ts`, find the `organizer_wallet` select (line 18):
```typescript
      supabase
        .from('organizer_wallet')
        .select('*')
        .eq('organizer_id', ctx.userId)
        .maybeSingle(),
```

The `*` already selects all columns including `held_balance` — no code change needed here. However, update the fallback object (line 41) to include `held_balance: 0` so the shape is consistent when an organizer has no wallet yet:

Find:
```typescript
    const wallet = walletRes.data ?? {
      organizer_id: ctx.userId,
      balance: 0,
      total_earned: 0,
      total_withdrawn: 0,
      currency: 'SAR',
    }
```

Replace with:
```typescript
    const wallet = walletRes.data ?? {
      organizer_id: ctx.userId,
      balance: 0,
      held_balance: 0,
      total_earned: 0,
      total_withdrawn: 0,
      currency: 'SAR',
    }
```

- [ ] **Step 2: Verify the API response**

Run the dev server (`npm run dev` in `rawaq-web`) and call the endpoint as an organizer:
```bash
curl -H "Cookie: <session-cookie>" http://localhost:3000/api/organizer/wallet
```

Expected: response includes `"held_balance": 0` (or the actual value) inside `data.wallet`.

- [ ] **Step 3: Commit**

```bash
git add rawaq-web/app/api/organizer/wallet/route.ts
git commit -m "feat(api): expose held_balance in organizer wallet endpoint"
```

---

## Task 4: SettingsEditor — `revenue_hold_hours` control

**Files:**
- Modify: `rawaq-web/components/owner/SettingsEditor.tsx`

The existing editor supports `'boolean'`, `'number'` (stored as decimal, displayed ×100 as percentage), and `'text'`. We need `'integer'` — stored as-is (no ÷100), displayed as a whole number input.

- [ ] **Step 1: Add `'integer'` to the `SettingMeta` type**

Find:
```typescript
interface SettingMeta {
  key: string
  label: string
  description: string
  type: 'boolean' | 'number' | 'text'
}
```

Replace with:
```typescript
interface SettingMeta {
  key: string
  label: string
  description: string
  type: 'boolean' | 'number' | 'integer' | 'text'
}
```

- [ ] **Step 2: Add `revenue_hold_hours` to `SETTINGS_META`**

Find the closing `]` of the `SETTINGS_META` array (after the `default_platform_fee_pct` entry):
```typescript
  {
    key: 'default_platform_fee_pct',
    label: 'Default Platform Fee (%)',
    description: 'Fallback fee applied when a plan has no explicit fee. Range: 0–100.',
    type: 'number',
  },
]
```

Replace with:
```typescript
  {
    key: 'default_platform_fee_pct',
    label: 'Default Platform Fee (%)',
    description: 'Fallback fee applied when a plan has no explicit fee. Range: 0–100.',
    type: 'number',
  },
  {
    key: 'revenue_hold_hours',
    label: 'Revenue Hold Period (hours)',
    description: 'Hours ticket-sale revenue is held before it becomes withdrawable. Minimum: 1 hour.',
    type: 'integer',
  },
]
```

- [ ] **Step 3: Add integer input rendering**

In the JSX block that renders each setting, find the `{meta.type === 'text' && ...}` block:
```typescript
                {meta.type === 'text' && (
                  <input
                    type="text"
                    value={typeof draft[meta.key] === 'string' ? (draft[meta.key] as string) : ''}
                    onChange={(e) => setDraftKey(meta.key, e.target.value)}
                    className="w-64 border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                    placeholder="Leave blank for default"
                  />
                )}
```

Insert before it (add the integer block):
```typescript
                {meta.type === 'integer' && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={typeof draft[meta.key] === 'number' ? (draft[meta.key] as number) : ''}
                      onChange={(e) => setDraftKey(meta.key, parseInt(e.target.value, 10))}
                      className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right"
                    />
                    <span className="text-sm text-gray-500">hrs</span>
                  </div>
                )}

                {meta.type === 'text' && (
```

- [ ] **Step 4: Fix `handleSave` to skip ÷100 for `'integer'` type**

Find in `handleSave`:
```typescript
        const updates = SETTINGS_META.map(({ key, type }) => {
          let value = draft[key]
          if (type === 'number') value = parseFloat(String(value)) / 100
          return { key, value }
        })
```

Replace with:
```typescript
        const updates = SETTINGS_META.map(({ key, type }) => {
          let value = draft[key]
          if (type === 'number') value = parseFloat(String(value)) / 100
          if (type === 'integer') value = Math.max(1, parseInt(String(value), 10) || 1)
          return { key, value }
        })
```

The `Math.max(1, ...)` enforces the minimum-1-hour rule client-side before sending to the API.

- [ ] **Step 5: Verify the settings editor renders correctly**

Start the dev server and open `/owner/settings` as an owner user. Confirm:
- "Revenue Hold Period (hours)" setting appears
- Input shows `24` (current DB value)
- Changing the value and clicking Save updates the DB (check Supabase Studio)
- Setting it to 0 still saves as 1 (Math.max enforcement)

- [ ] **Step 6: Commit**

```bash
git add rawaq-web/components/owner/SettingsEditor.tsx
git commit -m "feat(owner): add revenue_hold_hours setting to platform settings editor"
```

---

## Task 5: Earnings Page — held balance card

**Files:**
- Modify: `rawaq-web/app/(app)/organizer/earnings/page.tsx`

- [ ] **Step 1: Add `hold_released` to `REASON_LABELS`**

Find:
```typescript
const REASON_LABELS: Record<string, string> = {
  tip: '💝 Tip received',
  ticket_sale: '🎟️ Ticket sale',
  refund_deducted: '↩️ Refund deducted',
  payout: '🏦 Payout',
  adjustment: '⚙️ Adjustment',
}
```

Replace with:
```typescript
const REASON_LABELS: Record<string, string> = {
  tip: '💝 Tip received',
  ticket_sale: '🎟️ Ticket sale',
  refund_deducted: '↩️ Refund deducted',
  payout: '🏦 Payout',
  adjustment: '⚙️ Adjustment',
  hold_released: '✅ Hold released',
}
```

- [ ] **Step 2: Add the held balance summary card**

Find the wallet summary grid (the 3-card grid starting around line 201):
```typescript
      {/* Wallet summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5 bg-brand-50 border border-brand-200">
          <div className="text-2xl mb-1">💰</div>
          <div className="text-2xl font-bold text-brand-700">{formatCurrency(availableToWithdraw)}</div>
          <div className="text-xs text-gray-500 mt-0.5">Available to Withdraw</div>
          {pendingAmount > 0 && (
            <div className="text-xs text-amber-600 mt-1">
              🔒 {formatCurrency(pendingAmount)} pending withdrawal
            </div>
          )}
        </div>
        {[
          { label: 'Total Earned', value: formatCurrency(wallet?.total_earned ?? 0), icon: '📈' },
          { label: 'Total Withdrawn', value: formatCurrency(wallet?.total_withdrawn ?? 0), icon: '🏦' },
        ].map((s) => (
          <div key={s.label} className="card p-5">
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
```

Replace with:
```typescript
      {/* Wallet summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-5 bg-brand-50 border border-brand-200">
          <div className="text-2xl mb-1">💰</div>
          <div className="text-2xl font-bold text-brand-700">{formatCurrency(availableToWithdraw)}</div>
          <div className="text-xs text-gray-500 mt-0.5">Available to Withdraw</div>
          {pendingAmount > 0 && (
            <div className="text-xs text-amber-600 mt-1">
              🔒 {formatCurrency(pendingAmount)} pending withdrawal
            </div>
          )}
        </div>

        {(wallet?.held_balance ?? 0) > 0 && (
          <div className="card p-5 bg-amber-50 border border-amber-200">
            <div className="text-2xl mb-1">⏳</div>
            <div className="text-2xl font-bold text-amber-700">{formatCurrency(wallet?.held_balance ?? 0)}</div>
            <div className="text-xs text-gray-500 mt-0.5">Held (releases progressively)</div>
          </div>
        )}

        {[
          { label: 'Total Earned', value: formatCurrency(wallet?.total_earned ?? 0), icon: '📈' },
          { label: 'Total Withdrawn', value: formatCurrency(wallet?.total_withdrawn ?? 0), icon: '🏦' },
        ].map((s) => (
          <div key={s.label} className="card p-5">
            <div className="text-2xl mb-1">{s.icon}</div>
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
```

Note: the grid switches to `lg:grid-cols-4` so all four cards fit on wide screens. When `held_balance` is 0 the card is hidden and the grid naturally falls back to 3 columns on large screens.

- [ ] **Step 3: Verify the UI renders correctly**

Start the dev server and open `/organizer/earnings` as an organizer who has ticket sales. Confirm:
- If `held_balance > 0`: amber "Held" card appears between the Available card and Total Earned card
- If `held_balance = 0`: no held card — layout shows 3 cards as before
- `hold_released` entries in the ledger show "✅ Hold released"
- No hardcoded "SAR" text on the new card — it uses `formatCurrency` which follows the same pattern as other cards

- [ ] **Step 4: Commit**

```bash
git add rawaq-web/app/(app)/organizer/earnings/page.tsx
git commit -m "feat(ui): show held balance card on organizer earnings page"
```

---

## Task 6: End-to-End Verification

- [ ] **Step 1: Test ticket sale → hold created**

1. Make a test ticket purchase as a user
2. In Supabase Studio, check `revenue_holds` — a row should appear with `held_until ≈ NOW() + 24h` and `released_at = NULL`
3. Check `organizer_wallet` — `held_balance` increased, `balance` unchanged
4. Open `/organizer/earnings` — amber "Held" card shows the amount

- [ ] **Step 2: Test tip → no hold**

1. Make a test tip as a user
2. Check `revenue_holds` — no new row
3. Check `organizer_wallet` — `balance` increased (not `held_balance`)
4. Check `wallet_ledger` — entry with reason `'tip'` appears immediately

- [ ] **Step 3: Test hold release**

Manually trigger the release function to test without waiting 24 hours:
```sql
-- Shorten a hold to the past (substitute the hold UUID)
UPDATE revenue_holds SET held_until = NOW() - INTERVAL '1 minute' WHERE id = '<hold-uuid>';

-- Run the release function
SELECT fn_release_expired_revenue_holds();

-- Verify
SELECT balance, held_balance FROM organizer_wallet WHERE organizer_id = '<organizer-uuid>';
SELECT released_at FROM revenue_holds WHERE id = '<hold-uuid>';
SELECT * FROM wallet_ledger WHERE reason = 'hold_released' ORDER BY created_at DESC LIMIT 3;
```

Expected: `balance` increased by hold amount, `held_balance` decreased, `released_at` is set, ledger has `hold_released` entry.

- [ ] **Step 4: Test refund during hold window**

1. Find an active hold (`released_at IS NULL`)
2. Trigger a refund for that transaction via admin panel
3. Verify: `revenue_holds.released_at` is set (cancelled), `held_balance` decreased, `balance` unchanged (assuming refund ≤ hold amount), `wallet_ledger` has a `refund_deducted` entry

- [ ] **Step 5: Test owner settings**

1. Open `/owner/settings` as owner
2. Change "Revenue Hold Period" to 2 hours, save
3. Make a new ticket purchase
4. Check `revenue_holds` — `held_until` should be ~2 hours from now
5. Change back to 24 and save

- [ ] **Step 6: Test payout is blocked during hold**

1. Ensure all balance is in `held_balance` (no released funds)
2. Attempt to request a withdrawal — the "Withdraw Funds" button should be disabled (availableToWithdraw = 0)
3. Confirm the API also rejects: `POST /api/organizer/payouts` with amount > balance returns 400

- [ ] **Step 7: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during revenue hold e2e verification"
```
