# Innova AI: owner setup checklist

The app code is ready. These steps need access to your own Supabase, OpenAI, Stripe, and hosting accounts. Keep all secret keys in `.env.local` locally and in the hosting provider's private environment-variable settings. Never paste them into source code, screenshots, or chat.

## 1. Finish the Supabase database setup

In VS Code, open `supabase/finish_setup.sql`. In the Supabase dashboard for the same project the app already uses:

1. Open **SQL Editor** and choose **New query**.
2. Copy the entire `finish_setup.sql` file into the query.
3. Click **Run** and wait for the success message.

This bundle includes reservation payments/refunds, date-specific room rates, AI usage limits, billing records, team invitations, and multi-property billing links. It is safe to rerun if some of these tables already exist.

## 2. Allow sign-in and invitation links

In Supabase, open **Authentication → URL Configuration**. Add these to the redirect URL allowlist:

- `http://localhost:3000/**`
- `https://YOUR-DEPLOYED-DOMAIN/**`

Replace `YOUR-DEPLOYED-DOMAIN` after the app is deployed. The invitation and email sign-in flows use Supabase email delivery, so confirm those emails can be sent. The invitation link adds the member to the workspace only after that person signs in with the invited email address.

## 3. Connect Innova AI

Create an API key in your OpenAI API account. Add it to `.env.local` as `OPENAI_API_KEY`. The app defaults to `OPENAI_MODEL=gpt-6-luna`; change that only if you choose another model. This API key is separate from a ChatGPT subscription.

The assistant sends the manager's question and aggregate room, sales, and expense figures to the API. It does not send guest names, emails, phone numbers, or payment references. Growth allows 20 questions per manager per day; Multi-property allows 50.

## 4. Choose prices and connect Stripe

In Stripe, create three recurring subscription prices. You choose the amounts and billing interval. Copy each Price ID into the matching setting in `.env.local`:

- `STRIPE_PRICE_ID_STARTER`
- `STRIPE_PRICE_ID_GROWTH`
- `STRIPE_PRICE_ID_MULTI_PROPERTY`

Also add these private values:

- `STRIPE_SECRET_KEY` — use the test-mode key while setting things up.
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase server-only service key; never use the publishable key here.
- `STRIPE_WEBHOOK_SECRET` — copy this after creating the webhook in the next step.

The app uses Stripe-hosted Checkout and the Stripe billing portal. Stripe stores the card details. A Multi-property subscription can cover additional workspaces under that subscription's property.

## 5. Deploy, then add the Stripe webhook

Deploy the `work/innova-ai` folder to your hosting provider (for example, Vercel). In its private environment-variable settings, enter all the values above, plus:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `ENFORCE_SUBSCRIPTIONS=false` while testing

After the first deployment, create a webhook in Stripe with this endpoint:

`https://YOUR-DEPLOYED-DOMAIN/api/stripe/webhook`

Vercel supplies the app's deployed URL automatically for sign-in, invitation, and billing redirects, so you do not need to add `NEXT_PUBLIC_SITE_URL` in Vercel.

Enable these events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, and `customer.subscription.resumed`. Copy the endpoint signing secret into `STRIPE_WEBHOOK_SECRET`, save the environment variables, and redeploy.

Test a subscription in Stripe test mode and confirm the status appears on the Innova **Billing** page. Once checkout and webhook updates work, change `ENFORCE_SUBSCRIPTIONS` to `true` in the hosting settings and redeploy. That setting sends workspaces without an active subscription to Billing.

## 6. Your normal local run

In VS Code, open the `work/innova-ai` project folder. In its terminal run:

```powershell
npm run dev
```

Then open `http://localhost:3000`. Keep your existing `.env.local` Supabase settings and add the new values to that file; do not replace it with `.env.example`.
