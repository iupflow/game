# Building the apps

The game is wrapped with [Capacitor](https://capacitorjs.com): `android/` and `ios/` are the
native projects, and the game itself is the web build in `dist/`, copied into both.

## Requirements

- Node.js 22 or newer
- Android: JDK 21 and the Android SDK (platform 36, build tools 35), or simply Android Studio
- iOS: a Mac with the latest Xcode. A free Apple ID is enough to install on your own iPhone;
  TestFlight and the App Store need the paid Apple Developer Program

## After every change to the game

```
npm install
npm run build      # the game, into dist/
npx cap sync       # copies dist/ and the plugins into android/ and ios/
```

## Android

Debug build, installable on any Android phone:

```
cd android
./gradlew assembleDebug
# -> android/app/build/outputs/apk/debug/app-debug.apk
```

Install it with `adb install app-debug.apk`, or copy the file to the phone and open it
(Android asks to allow installing apps from that source once).

A Google Play upload needs a release bundle (`./gradlew bundleRelease`) signed with your own
upload key. Keep that key file safe and out of git; it is set up when the store release is
prepared.

## iOS (on a Mac)

1. Install Xcode from the App Store and open it once so it can install its components.
2. In the project folder: `npm install`, `npm run build`, `npx cap sync ios`, then
   `npx cap open ios` (opens `ios/App/App.xcodeproj`). The plugins come in through Swift
   Package Manager, so CocoaPods is not needed.
3. In Xcode, select the **App** target, open **Signing & Capabilities**, and under **Team**
   add your Apple ID and choose its *(Personal Team)*. If Xcode says the bundle identifier
   is not available, change it to something unique, e.g. `com.yourname.jellydrop`.
4. Connect the iPhone with a cable, tap **Trust** on the phone, and turn on
   **Settings → Privacy & Security → Developer Mode** (the phone restarts).
5. Pick the iPhone as the run destination at the top of Xcode and press **Run** (▶).
6. The first time, the phone refuses to open the app until you trust yourself as a developer:
   **Settings → General → VPN & Device Management** → your Apple ID → **Trust**.

Apps installed with a free Personal Team stop opening after 7 days; run them from Xcode
again to renew. TestFlight and the App Store need the Apple Developer Program.

## Placeholders to replace before a store release

- App name **Jelly Drop**: `capacitor.config.json` (`appName`),
  `android/app/src/main/res/values/strings.xml`, and `CFBundleDisplayName` in
  `ios/App/App/Info.plist`
- App ID **com.iupflow.jellydrop**: `capacitor.config.json` (`appId`), `namespace` and
  `applicationId` in `android/app/build.gradle` plus the Java package folder of
  `MainActivity`, and `PRODUCT_BUNDLE_IDENTIFIER` in the Xcode project. It can't be changed
  once the app is uploaded to a store
- Ads and purchases are still the browser placeholders from `src/ads.js`; real AdMob ads
  and store billing replace the `platform` functions there

## Icons and launch screen

The sources are in `assets/`, rendered from the game's own planet art (Earth and the Moon in
the gravity ring). After changing them, regenerate every size with:

```
npx capacitor-assets generate --ios --android
```

## App settings

- Portrait only, on both platforms; iPhone only on iOS (it still runs on iPads, scaled)
- The status bar is hidden; sound stops while the app is in the background
- The Android back button sends the game to the home screen instead of quitting it
