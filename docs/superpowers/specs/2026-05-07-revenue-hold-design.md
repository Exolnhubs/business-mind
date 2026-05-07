# Revenue Hold — Design Spec
**Date:** 2026-05-07  
**Status:** Approved

## Problem

Organizer revenue from ticket sales is credited to `balance` immediately on payment success, making it withdrawable before the 24-hour refund window closes. This means a refund request can arrive after the organizer has already withdrawn the funds.

## Goal

Hold organizer revenue from **ticket sales** for a configurable number of hours before it becomes withdrawable. The held amount is visible to the organizer. Tips are unaffected. The hold duration is controlled by the platform owner via the existing settings dashboard.

---

## Decisions

| Question | Answer |
|---|---|
| Which payment types are held? | Ticket sales only — tips credit balance directly |
| Refund during hold window | Deduct from held_balance first, then balance |
| Hold visibility granularity | Single aggregate number on wallet summary |
| Minimum hold duration | 1 hour (enforced at API layer) |
| Can hold be disabled? | No — minimum 1 hour always applies |
| Release mechanism | pg_cron every 15 minutes |
| Currency | Always use wallet's own currency field — no SAR default |

---

## Schema Changes

### 1. `organizer_wallet` — new column

```sql
ALTER TABLE organizer_wallet
  ADD COLUMN held_balance NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (held_balance >= 0);
```

`balance` = withdrawable. `held_balance` = earned but locked. The two never overlap.

### 2. New table: `revenue_holds`

One row per held ticket-sale transaction.

```sql
CREATE TABLE revenue_holds (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id           UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payment_transaction_id UUID        NOT NULL REFERENCES payment_transactions(id),
  amount                 NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  held_until             TIMESTAMPTZ NOT NULL,
  released_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (payment_transaction_id)  -- one hold per transaction
);

CREATE INDEX idx_revenue_holds_organizer ON revenue_holds(organizer_id, held_until);
CREATE INDEX idx_revenue_holds_pending   ON revenue_holds(held_until) WHERE released_at IS NULL;
```

### 3. `platform_settings` — new seed row

```sql
INSERT INTO platform_settings (key, value)
VALUES ('revenue_hold_hours', '24'::jsonb)
ON CONFLICT (key) DO NOTHING;
```

Stored as integer. Minimum 1 enforced at API layer.

### 4. `wallet_ledger.reason` constraint

Extend the CHECK to include `'hold_released'`:

```sql
ALTER TABLE wallet_ledger DROP CONSTRAINT wallet_ledger_reason_check;
ALTER TABLE wallet_ledger ADD CONSTRAINT wallet_ledger_reason_check
  CHECK (reason IN ('tip', 'ticket_sale', 'refund_deducted', 'payout', 'adjustment', 'hold_released'));
```

---

## Trigger Changes: `fn_sync_wallet_on_payment`

### Credit path (payment succeeds)

**Tips** (`type = 'tip'`): unchanged — credit `balance`, ledger reason `'tip'`.

**Ticket sales** (`type = 'ticket'`):
1. Read `revenue_hold_hours` from `platform_settings` (PK lookup)
2. Upsert `organizer_wallet`, incrementing `held_balance` (not `balance`) and `total_earned`
3. Insert row into `revenue_holds` with `held_until = NOW() + (hold_hours || ' hours')::interval`
4. No wallet ledger entry at this point — ledger is written at release time

### Debit path (refund — status → `'refunded'`)

Only applies to ticket sales:
1. Look up `revenue_holds` for this `payment_transaction_id` where `released_at IS NULL`
2. If active hold exists:
   - `held_balance -= hold_amount` on `organizer_wallet`
   - `released_at = NOW()` on the hold row (cancelled, not released)
   - If `refund_amount > hold_amount`: deduct the remainder from `balance`
3. If no active hold (already released): deduct from `balance` as before
4. Write ledger entry with reason `'refund_deducted'`

---

## New Function: `fn_release_expired_revenue_holds()`

Called by pg_cron every 15 minutes. Processes all expired unreleased holds atomically using `FOR UPDATE SKIP LOCKED`.

For each expired hold:
1. `UPDATE organizer_wallet SET balance += amount, held_balance = GREATEST(0, held_balance - amount)`
2. `UPDATE revenue_holds SET released_at = NOW()`
3. `INSERT INTO wallet_ledger` with reason `'hold_released'`, recording balance before/after

```sql
SELECT cron.schedule(
  'release-revenue-holds',
  '*/15 * * * *',
  $$ SELECT fn_release_expired_revenue_holds(); $$
);
```

---

## API Changes

### `GET /api/organizer/wallet`

Add `held_balance` to the `organizer_wallet` select. Return it in the response payload alongside `balance`. No logic change.

### `POST /api/organizer/payouts`

No change. Validation `input.amount > wallet.balance` already excludes held funds since `held_balance` is a separate column.

### `GET /api/owner/settings` + `PATCH /api/owner/settings`

No code changes needed — the generic endpoint handles any key. Validation: when `key = 'revenue_hold_hours'`, enforce `value >= 1` (integer).

---

## Frontend Changes

### `SettingsEditor.tsx`

1. Add `'integer'` to the `SettingMeta` type union
2. Add integer input rendering (no ÷100 transform — stored as-is)
3. Add entry to `SETTINGS_META`:
   ```ts
   {
     key: 'revenue_hold_hours',
     label: 'Revenue Hold Period (hours)',
     description: 'Hours ticket-sale revenue is held before it becomes withdrawable. Minimum: 1 hour.',
     type: 'integer',
   }
   ```
4. In `handleSave`, skip the ÷100 transform for `'integer'` type fields

### `app/(app)/organizer/earnings/page.tsx`

1. Update wallet type to include `held_balance: number`
2. Add fourth summary card (visible only when `held_balance > 0`):
   - Icon: 🔒
   - Value: `formatCurrency(wallet.held_balance, wallet.currency)`
   - Label: `Held (releases progressively)`
3. Add `hold_released` to `REASON_LABELS`:
   ```ts
   hold_released: '✅ Hold released'
   ```
4. Currency: use `wallet.currency` throughout — no SAR hardcoding

### `types/database.ts`

Add `held_balance: number` to `OrganizerWallet` and `OrganizerWalletRow` interfaces.

---

## RLS

`revenue_holds` follows the same pattern as `wallet_ledger`:
- Organizer reads own rows only
- Admin reads all
- No direct insert/update from app layer (trigger-owned)

---

## Out of Scope

- Per-transaction hold countdown timers in the UI
- Push notifications when a hold releases
- Retroactive holds on existing transactions
- Hold bypass for specific organizers
