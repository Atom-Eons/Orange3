# Refund Runbook — operator process

This is the documented procedure for honoring the refund clauses in LICENSE §8 (Material Failure Guarantee) and §8A (Workflow-Fit Refund).

**Audience:** Atom McCree (operator) and any future support staff.

**SLA committed in LICENSE:** Refunds issued via Stripe / Lemon Squeezy to the buyer's original payment method within **5 business days** of the refund request being received.

---

## Inbox monitoring

- **Address:** `a.mccree@gmail.com`
- **Trigger subjects:** any email with `ORANGEBOX refund`, `refund request`, `material failure`, or general buyer-flagged ORANGEBOX-related complaint.
- **Cadence:** check this inbox **once per business day minimum**. Twice a day during launch window.
- **Vacation rule:** if Atom is unreachable for >2 business days, the inbox auto-responder sends an acknowledgement extending the SLA — still inside the 30-day refund window the LICENSE promises.

---

## Step-by-step (Stripe / direct US flow)

1. **Receive refund request email.**
2. **Acknowledge within 4 hours** (auto-responder OK) confirming receipt and stating: "Refund will be processed within 5 business days to your original payment method."
3. **Verify the purchase.**
   - Open Stripe Dashboard → Payments.
   - Search by buyer email.
   - Confirm: purchase exists, amount is $49, date is within 30 days (per LICENSE §8A).
4. **Process the refund.**
   - On the matching payment, click **Refund**.
   - Refund full amount ($49). Reason: "Customer requested refund (Workflow-Fit)" or "Material Failure (install/launch failure on supported platform)."
   - Click **Refund**.
5. **Confirm to buyer** with subject `ORANGEBOX refund processed`. Include:
   - Refund transaction ID
   - Refund amount + currency
   - Expected timeline (3–10 business days for card to credit back, varies by issuing bank)
   - One sentence asking what we could have done better (optional but helpful)
6. **Log the refund.**
   - Maintain a CSV at `<your-ops-folder>/refunds-log.csv` with columns: `date,buyer_email,reason,stripe_refund_id,amount,notes`.
   - This log is for AtomEons internal tracking only (not buyer-facing).

## Step-by-step (Lemon Squeezy / Merchant-of-Record flow)

1. **Receive refund request email.**
2. **Acknowledge within 4 hours.**
3. **Open Lemon Squeezy Dashboard → Orders.**
4. **Find the order by buyer email.**
5. **Click Refund** on the order.
6. **Lemon Squeezy handles the tax adjustment automatically** (VAT/sales tax refunded too).
7. **Confirm to buyer.**
8. **Log the refund.**

---

## Edge cases

### Buyer requests refund after 30 days

- Default response: politely decline, citing LICENSE §8A 30-day window. Offer to help troubleshoot the actual issue instead.
- Operator discretion: at low sales volume, granting a 31–45-day refund is fine if the buyer is sincere. Beyond 45 days, decline.

### Buyer claims Material Failure on a non-supported platform

- LICENSE §8 explicitly excludes ARM64 Windows, Server, Win7/8, virtualized guests, Wine.
- Response: confirm the buyer's platform. If unsupported, offer the Workflow-Fit Refund (§8A) instead. Same outcome for the buyer (full refund) — different legal basis.

### Buyer requests refund but threatens to chargeback

- Process the refund immediately. Threats of chargeback are a red flag for fraud but a granted refund pre-empts any chargeback fee ($15–25 saved).
- Note in the refund log: `notes: customer threatened chargeback; pre-empted with immediate refund`.

### Buyer asks to "uninstall but keep the license"

- Not a refund scenario. The license is per-install, perpetual. The buyer keeps the license whether they uninstall the binary or not. Reply: "Your license remains valid. You can reinstall any time. No action needed."

### Buyer asks for a refund 18 hours after purchase, says "this isn't what I expected"

- Standard Workflow-Fit refund. Process within 5 business days. Welcome them to revisit when ORANGEBOX v2.0 ships.

---

## Chargeback procedure

If Stripe / Lemon Squeezy alerts that a chargeback was filed:

1. **Within 24 hours**, open the dispute in the dashboard.
2. **Submit evidence** (Stripe accepts):
   - Purchase email (from the buyer's confirmation)
   - License terms acceptance (the buyer ran the installer; the EULA was presented and clicked through)
   - SHA-256 verification request (we ask buyers to verify install integrity — proof of delivery)
   - Material Failure Guarantee terms (proves we offered a refund the buyer could have used instead)
3. **Stripe / Lemon Squeezy adjudicates.** If we win: the funds are returned and we keep the dispute fee. If we lose: $49 + ~$15–25 dispute fee net loss.

At $49 mass-market price point, expect ~1 chargeback per 100 sales (industry baseline ~1%). Acceptable.

---

## Volume scaling notes

- **Up to 5 refunds/week:** manual is fine.
- **5–20 refunds/week:** consider a simple template-response macro + weekly batch.
- **>20 refunds/week:** the refund rate has crossed into "product-market-fit warning" territory. Investigate why buyers are returning. Likely a UX or expectation-setting gap that should be fixed before more sales.

---

## When NOT to refund

- After 30 days from purchase (LICENSE §8A explicitly bars).
- If the buyer is on a sanctioned country (LICENSE §15) and the merchant should have blocked the sale — the merchant handles this; the dispute will not reach this runbook.
- If the buyer threatens, demands, or attempts to extort beyond the license terms. Politely decline; escalate to the merchant.

---

*This runbook is operator-internal. The buyer's view of the refund process is in LICENSE §8 + §8A + PRIVACY.md.*
