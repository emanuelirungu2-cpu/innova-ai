# Innova AI

Innova AI is a workspace-based operations system for hotels and hospitality businesses. It brings reservations, room operations, restaurant point of sale, guest records, reports, expenses, team access, subscription billing, and an AI operations assistant into one app.

## Run locally

1. Install Node.js LTS and open this folder in VS Code.
2. Copy `.env.example` to `.env.local` and fill in the Supabase URL and publishable key.
3. In the VS Code terminal, run `npm install` and then `npm run dev`.
4. Open `http://localhost:3000`.

`.env.local` is ignored by Git. Keep private keys there and never put them in browser code or send them in chat.

## Database setup

For a new Supabase project, run every file in `supabase/migrations` in filename order. For the existing project that already has migrations through expense tracking, run `supabase/finish_setup.sql` once in the Supabase SQL Editor. It contains the reservation payment, daily room rate, AI usage, billing, workspace, and team invitation additions. It can be rerun if one of those additions was already applied.

## External services

The core hotel, restaurant, and reporting features use Supabase. The following features need private credentials and account-side setup before they can run:

- **AI assistant:** Add `OPENAI_API_KEY`. `OPENAI_MODEL` is optional and defaults to `gpt-6-luna`. The assistant sends aggregate property figures and the user's question to the OpenAI Responses API; it does not send guest names or contact details. Requests run server-side and are limited to 20 per owner, admin, or manager each day.
- **Subscriptions:** Create three recurring prices in Stripe and set `STRIPE_PRICE_ID_STARTER`, `STRIPE_PRICE_ID_GROWTH`, and `STRIPE_PRICE_ID_MULTI_PROPERTY` to those Price IDs. Set `STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `STRIPE_WEBHOOK_SECRET` as private server environment variables. Create a Stripe webhook pointed to `/api/stripe/webhook` and enable `checkout.session.completed` and `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, and `customer.subscription.resumed` events. Set `ENFORCE_SUBSCRIPTIONS=true` only after the webhook and plan prices work; active subscriptions are then required to use the product, Growth unlocks 20 AI questions per manager per day, and Multi-property unlocks additional workspaces and 50 questions per manager per day.
- **Team invitations and sign-in links:** Supabase email delivery and the Auth redirect allowlist must include the app's `/auth/callback` URL. The invite link expires after seven days.
- **Deployment:** Set the same environment variables in the hosting provider and update `NEXT_PUBLIC_SITE_URL` to the deployed HTTPS origin. Register that deployed origin in Supabase Auth and use the deployed webhook URL in Stripe.

Subscription prices and plan packaging are controlled in Stripe. Innova AI stores verified subscription status and the renewal date; Stripe handles checkout, billing portal, and card details.

## Main routes

- `/dashboard` — operational overview and workspace switcher
- `/workspaces` — create and switch property workspaces
- `/team` — invitations and access roles
- `/calendar` — room availability and nightly rates
- `/reservations` — bookings, check-in/out, payments, and refunds
- `/rooms` — room inventory and housekeeping
- `/menu` and `/pos` — restaurant catalogue and point of sale
- `/guests` — guest directory and booking history
- `/reports` and `/finance` — sales reporting and recorded expenses
- `/ai` — AI operations assistant
- `/billing` — subscription plans and billing management
