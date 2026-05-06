# Payment strategy for the beta

This is product and implementation guidance, not legal advice. Before charging real users, get Dutch/EU legal review, Stripe approval where needed, and clear consumer terms.

## Decision

Do not launch the beta with "winner gets the pot".

Launch with:

- Pressure Pass: a normal app subscription for access to groups, live trace, leaderboards, and stats.
- Miss fee: a pre-agreed platform commitment fee when a user misses the required live checks.
- No cash prize: winners get rank, status, badges, streak protection, and platform-funded perks.
- No wallet: no user balance, no pooled pot, no user-to-user transfer, no cash-out.
- Transparent ledger: the group sees misses and fees, but nobody receives cash from another user's miss.

## Why

The risky version has three red flags:

- Gambling risk: cash or material prizes can turn a competition into regulated gambling or a game-of-skill prize product, depending on jurisdiction and structure.
- Payment services risk: holding money for users or routing it between users can look like escrow, peer-to-peer transfer, or marketplace money movement.
- Processor risk: Stripe prohibits or restricts several prize, gambling, money transmission, escrow, fundraising, and stored-value models.

## Safer MVP wording

Use:

- "Commitment fee"
- "Miss fee"
- "Platform fee"
- "Rank reward"
- "No cash-out"

Avoid:

- "Winner takes pot"
- "Bet"
- "Stake"
- "Cash prize"
- "Payout to winner"
- "Wallet balance"

## Stripe architecture

Recommended beta flow:

1. Create a Stripe Billing subscription with Checkout Sessions.
2. Save a payment method for future off-session fees with explicit consent.
3. When a deadline is missed, backend verifies the miss from app state and creates a fee charge.
4. Stripe webhooks update the user's payment status and the group ledger.
5. Customer Portal lets users manage subscription/payment method/cancellation.

Do not implement Connect payouts until legal review says the model is allowed and Stripe approves the use case.

## Locked until review

- Winner cash payout.
- Pooled group pot.
- User wallet or withdrawable credits.
- Charity routing without an approved donation/fundraising setup.
- Transfer of missed-user funds to another individual.

## Sources to review

- Kansspelautoriteit, Leidraad beoordeling kansspelen: https://kansspelautoriteit.nl/sites/default/files/leidraad_beoordeling_kansspelen.pdf
- DNB PSD2 overview: https://www.dnb.nl/voor-de-sector/open-boek-toezicht/wet-regelgeving/psd2/
- Stripe prohibited and restricted businesses: https://stripe.com/legal/restricted-businesses
- Stripe Checkout: https://docs.stripe.com/payments/checkout
- Stripe Billing subscriptions: https://docs.stripe.com/billing/subscriptions/overview
- Stripe Connect: https://docs.stripe.com/connect/how-connect-works
