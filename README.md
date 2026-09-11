# Dharma Motors Workshop

Mobile-first workshop management app for Dharma Motors. The client uses Supabase Auth and Postgres Row Level Security for customer and admin access.

## Supabase setup

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local` and add the project URL and anon key.
3. In Supabase Auth, keep the Email provider enabled and turn off **Confirm email**. No Phone provider or Twilio account is needed.
4. Run `supabase/schema.sql` in the Supabase SQL editor.
5. The app shows mobile-number fields, but securely authenticates with Supabase password auth using an internal identity derived from the mobile number. The actual mobile number is stored in `public.profiles.phone`.
6. Select **Create an account** in the app and create the owner's account using mobile number `7696707446` and the owner's password. This is required once because Supabase must create the Auth user.
7. Run `update public.profiles set role = 'admin' where phone = '+917696707446';` in the SQL editor.
8. Start the app with `npm run dev`.

For an existing database, run `supabase/referral_migration.sql` instead of rerunning the entire schema. It connects signup referral codes to `profiles.referred_by` and adds the one-time paid-bill reward trigger.

If the original schema is already installed, add the `walkin_requests` table and its admin policy from the latest `supabase/schema.sql` before using Walk-in.

For an existing live project, run `supabase/operations_migration.sql` and then `supabase/production_fixes.sql`. The second migration creates the standard booking slots if absent and enforces each slot's capacity directly in the database.

Referral rules are enforced in the database: every paid bill adds 10 points per ₹100 to the customer; when a referred customer's paid bill is ₹500 or more, the referrer receives 200 bonus points and the referred customer receives 100 bonus points. A bill can trigger the referral bonus only once.

The admin area is not selected by a client-side toggle. A signed-in account reaches it only when its `profiles.role` is `admin`; all other accounts receive the customer app. Passwords are handled by Supabase and are never stored in the app database or source code.

## Development

```bash
npm install
npm run dev
npm run build
```

## Installable app (PWA)

After deployment over HTTPS, customers can install Dharma Motors from their browser. On Android, use **Install app** or **Add to Home screen**. On iPhone, use Safari's **Share** menu and choose **Add to Home Screen**. The mascot app icons are stored in `public/icons/`.

## GitHub and Vercel

Push this folder to a GitHub repository. Import that repository into Vercel; the included `vercel.json` uses `npm run build` and publishes `dist`.

Add these Vercel environment variables for Production and Preview:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Do not upload `.env.local`. It is ignored by git.
