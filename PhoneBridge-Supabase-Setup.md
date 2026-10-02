# PhoneBridge Supabase setup

This update adds Google sign-in, account workspaces, and secure phone pairing. Complete the database and Render configuration before deploying the updated server.

## 1. Apply the database migration

1. In Supabase, open **SQL Editor** and choose **New query**.
2. Open `supabase/migrations/202610020001_phonebridge_workspaces_devices.sql` from this project.
3. Copy all of its SQL into the Supabase query editor and click **Run**.
4. Confirm the query completes successfully.

The migration creates account workspaces for new Google sign-ins and an RLS-protected device ownership table. Do not switch off RLS.

## 2. Add server environment variables in Render

Open the PhoneBridge web service in Render, then open **Environment** and add:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | The project URL from Supabase **Project Settings → API** |
| `SUPABASE_PUBLISHABLE_KEY` | The `sb_publishable_...` key from Supabase **Project Settings → API Keys** |
| `SUPABASE_SECRET_KEY` | The `sb_secret_...` key from Supabase **Project Settings → API Keys** |

The secret key must remain in Render. Do not put it in the Android app, browser code, GitHub, or this chat. Do not use the Google OAuth client secret as `SUPABASE_SECRET_KEY`; they are separate credentials.

## 3. Deploy the updated server

Make sure the Render build command runs `npm install && npm run build` (or `npm ci && npm run build`) and the start command is `npm start`. The server now requires the three Supabase variables above.

## 4. Build the updated Android app before the server cutover

Build the Android project in Android Studio. The new app stores a private device credential and can show a temporary pairing code. Install the new APK before deploying the updated server if convenient; the old server ignores the added credential field, so this avoids keeping an outdated APK on the phone during the cutover.

After the new server is deployed, older app installations cannot register. Install this updated APK before trying to pair.

## 5. Sign in and pair

1. Open `https://phonebridge-jzxb.onrender.com/` and choose **Continue with Google**.
2. If Google shows a testing warning, use an account added under Google Auth Platform **Audience → Test users**.
3. Open PhoneBridge on the updated phone. Read the 6-digit code shown in the app.
4. Enter the code in the signed-in dashboard and choose **Pair device**.

Pairing codes expire after 10 minutes and refresh automatically. A device can be paired once; it cannot be silently claimed by another account.

## Next data features

Call logs, SMS, notifications, and location history are not persisted by this migration. The workspace/device ownership model is in place so those records can be added with workspace-scoped row security in later migrations.
