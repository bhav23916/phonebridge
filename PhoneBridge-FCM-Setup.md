# PhoneBridge wake-on-demand setup

PhoneBridge now has an FCM wake path for paired devices. When an authenticated dashboard connects, the server requests a wake for paired phones that are not currently connected. FCM may deliver the request later if the phone is temporarily offline; the message expires after 24 hours. The dashboard shows online/offline state, last-seen time, last reported network, and a manual **Wake phone** retry button.

## 1. Add Firebase to the Android app

1. Open the Firebase console and create a Firebase project, or add Firebase to the Google Cloud project you already use.
2. Add an Android app with package name `com.example.test` (the current PhoneBridge `applicationId`).
3. Download `google-services.json` and place it at `myprojects/app/google-services.json`.
4. Make sure Firebase Cloud Messaging is available for the project. If you use a separate sender project, grant its service account the **Firebase Cloud Messaging API Admin** role in the target project.

The Gradle integration is conditional: the Android project can still sync/build without this file, but push wake will not work until it is present.

## 2. Apply the Supabase migration

In the Supabase SQL Editor, run:

`supabase/migrations/202610030001_phonebridge_device_wake_status.sql`

It adds last-seen/network fields and a separate push-token table that is inaccessible to browser users. The server uses the existing `SUPABASE_SECRET_KEY` to manage these rows.

## 3. Give the server permission to send FCM messages

1. In Firebase Project Settings → **Service accounts**, generate a private key JSON for the Firebase project.
2. In Google Cloud IAM, grant that service account the **Firebase Cloud Messaging API Admin** role.
3. In the Render server service, add an environment variable named `FIREBASE_SERVICE_ACCOUNT_JSON` and paste the entire JSON key as its value. Do not commit the private key or put it in the Android app.
4. Deploy the server after the migration has been applied.

## 4. Build and connect the phone

1. Sync and build the Android app after adding `google-services.json`.
2. Install the new build and open PhoneBridge once while the phone has internet. Keep the existing pairing; the app sends its FCM token through the authenticated device connection.
3. Open the dashboard. It automatically sends a wake request to paired phones that are offline. Use **Wake phone** to retry manually.

## Status meanings

- **Online** means the phone currently has a server WebSocket.
- **Offline / not reachable** means the server cannot currently reach the app. The last-seen time and network details are historical.
- **Internet available / No internet connection** is reported by Android when telemetry is received. When the phone is offline, the dashboard cannot know whether mobile data was specifically turned off versus the app being stopped, the phone sleeping, or another network failure.
- FCM can be delayed or blocked by Android/Realme settings, missing Google Play services, force-stop, or lack of internet. It is a wake attempt, not a guarantee.

The current phone service uses Android's `dataSync` foreground-service type. Android applies a time budget to that type for modern target SDKs, so this wake flow restores connectivity on demand but does not make an always-on connection exempt from Android's background limits.
