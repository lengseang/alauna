# Building CHIWIWI, running it on your phone, and keeping builds fast

CHIWIWI contains native code (the llama.cpp AI engine via `llama.rn`), so it can **not** run in Expo Go.
You need a real Android build installed on the phone. There are two kinds, and mixing them up is the
usual reason builds feel slow:

| | Debug build (daily work) | Release build (QA, sharing) |
|---|---|---|
| Command | `npx expo run:android --device` | `./gradlew :app:assembleRelease` / GitHub Actions / EAS |
| JavaScript | loaded live from your PC (Metro) | baked into the APK |
| Change a `.ts`/`.tsx` file | **no rebuild**, phone updates in about a second | full rebuild |
| Compiles for | **only your phone's CPU** (the CLI detects it) | whatever `app.json` says (arm64-v8a) |

**Rule: do not build a release APK to try a code change.** Use section 1.

---

## 1. Run live on your phone over a USB cable (adb)

> Status: the steps are standard Android tooling and the behaviour of `expo run:android` (which CPU it
> builds for, how Metro connects) was checked in the Expo CLI source. They were **not** run against a
> physical phone, because the development sandbox has none. If a step differs on your phone, tell me which.

### 1.1 One-time phone setup

1. **Settings > About phone**, tap **Build number** 7 times, enter your PIN ("You are now a developer").
2. **Settings > System > Developer options**, turn on **USB debugging**.
   Xiaomi/Redmi/Poco also need **Install via USB** and **USB debugging (Security settings)**.
3. Plug in a **data** cable (some cables only charge). Pull down the notification "Charging this device via USB" and pick **File transfer**.
4. The phone asks **"Allow USB debugging?"**. Tick *Always allow from this computer*, tap **Allow**.

### 1.2 One-time PC setup

- **JDK 17 or newer** (Android Studio bundles JDK 21).
- **Android SDK**: easiest is to install Android Studio, then SDK Manager: *Android SDK Platform 36*,
  *Platform-Tools* (this is `adb`), *NDK 27.1.12297006*, *CMake 3.22.1*. Set `ANDROID_HOME` to the SDK folder.
  (Gradle downloads a missing NDK/CMake itself if the licences are accepted: `sdkmanager --licenses`.)
- **adb on your PATH**: Windows `%LOCALAPPDATA%\Android\Sdk\platform-tools`, macOS `brew install --cask android-platform-tools`,
  Linux `sudo apt install android-tools-adb`.
- **Node 22**, then `cd mobile && npm ci`.

Check the phone is seen:

```bash
adb devices
# R58M...     device        <- good
```

| `adb devices` shows | Meaning / fix |
|---|---|
| nothing | Charge-only cable, USB mode not "File transfer", or (Windows) missing USB driver: install your phone maker's USB driver. Try another port. |
| `unauthorized` | You did not accept the prompt. Unplug, replug, accept. Still stuck: Developer options > *Revoke USB debugging authorizations*, then replug. |
| `offline` | `adb kill-server && adb start-server`, replug. |

### 1.3 First run (slow, once)

```bash
cd mobile
npx expo run:android --device
```

This generates `mobile/android` (git-ignored), compiles a **debug** build **only for your phone's CPU**
(`getConnectedDeviceABI` in the Expo CLI), installs it, starts Metro, forwards the port, and launches the app.
Expect a few minutes the first time (the native build of the current code took 3 min 38 s for arm64 on 4 vCPUs,
see section 2, plus first-time dependency downloads).

### 1.4 Every day after that (seconds)

```bash
cd mobile
npx expo start                      # terminal 1: Metro
adb reverse tcp:8081 tcp:8081       # terminal 2: lets the phone reach Metro THROUGH THE CABLE (no Wi-Fi needed)
```

Open the CHIWIWI app on the phone. Edit a file, save: the screen updates by itself (Fast Refresh).
- Full reload: press `r` in the Metro terminal, or shake the phone > *Reload*, or `adb shell input keyevent 82` for the dev menu.
- "Could not connect to development server": run `adb reverse tcp:8081 tcp:8081` again (it is lost whenever the cable is unplugged), then reload.
- You do **not** need to run `adb reverse` for the very first `expo run:android` (the CLI does it).

### 1.5 When you DO have to rebuild native code

Adding or upgrading a package that contains native code, changing `app.json` (plugins, permissions, package name),
changing `mobile/plugins/`, or upgrading Expo / React Native / `llama.rn`. Then:

```bash
cd mobile
npx expo prebuild --platform android --clean   # only if app.json or plugins changed
npx expo run:android --device
```

Plain `.ts`/`.tsx`/JSON/image changes never need this.

### 1.6 Handy adb commands (package id: `com.chiwiwi.sovereign`)

```bash
adb logcat -s ReactNativeJS:V ReactNative:V AndroidRuntime:E     # JS console.log + crashes
adb logcat | grep -i rnllama                                      # engine logs (debug builds only)
adb install -r path/to/app-release.apk                            # install a release APK (INSTALL_FAILED_UPDATE_INCOMPATIBLE: adb uninstall com.chiwiwi.sovereign first)
adb shell pm clear com.chiwiwi.sovereign                          # back to a "fresh install" (wipes settings + app-storage vault)
adb shell appops set com.chiwiwi.sovereign MANAGE_EXTERNAL_STORAGE allow   # shortcut for "All files access" (use `deny` to undo)
adb exec-out screencap -p > shot.png                              # screenshot
adb push Model.gguf /sdcard/Documents/CHIWIWI/models/             # skip the download when testing (name must equal the catalog filename;
                                                                  # folder is <picked folder>/CHIWIWI/models, so pick "Documents" in the app first)
```

Do not use the `appops` shortcut when you are testing the permission screens themselves
(QA_PLAN section 1, step 4b): that row exists to check the real flow.

### 1.7 No cable: wireless debugging (Android 11+)

Developer options > **Wireless debugging** > *Pair device with pairing code*, then on the PC
`adb pair <ip>:<pairing-port>` and `adb connect <ip>:<port>` (phone and PC on the same Wi-Fi). Everything above works the same, including `adb reverse`.

### 1.8 No cable at all: EAS development-client APK + Metro over Wi-Fi

This is the path when no USB cable is available. One cloud build gives you an app that loads its JavaScript from your PC,
so after the first install every `.ts`/`.tsx` change appears on the phone in about a second.

```bash
cd mobile
git add -A && git commit -m "wip"        # EAS packs the git tree: uncommitted files are not in the build
npx eas-cli@latest login                 # once
npx eas-cli@latest build --platform android --profile development --no-wait
```

1. Open the build page printed by the CLI (expo.dev), wait for **Finished** (free tier: low-priority queue, can be 90+ min; 15 Android builds/month;
   a build that fails still costs one, so run `npm run check` and `npx expo export --platform android` first).
2. On the phone open the build page / scan its QR, download the APK, allow "install unknown apps" for that browser, install.
3. On the PC: `npx expo start --dev-client`. Phone and PC on the same Wi-Fi. Open the CHIWIWI app: the dev launcher lists the server, or scan the QR from the terminal.
   - Corporate/guest Wi-Fi blocks it, or Windows firewall: run `npx expo start --dev-client --tunnel`, or turn on the phone's hotspot and join the PC to it.
   - Windows firewall prompt for Node: allow **Private** networks.
4. Only a native change (new native package, `app.json` plugin, `plugins/`, `llama.rn` version) needs a new build. Everything under `src/` does not.
5. Native crash logs (llama.cpp aborts show only there) need wireless adb, section 1.7. JavaScript `console.log` already appears in the Metro terminal.

What this build contains: `llama.rn` 0.12.9 (arm64-v8a only), `expo-dev-client`, `expo-device`, `expo-file-system`, fonts. The first thing to run on it is the
smoke test in `docs/audit/04-validation-core.md` (section 4).

---

## 2. Release builds: what takes the time (measured)

All on 4 vCPUs, JDK 21, Gradle 9.3.1, arm64-v8a only, Maven mirror workaround in the sandbox.

| Run | Situation | Time |
|---|---|---|
| A | Completely cold (downloads everything). Project **still contained** Reanimated, Worklets and Gesture Handler (compiled for nothing; since removed) | **7 min 40 s** (468 tasks) |
| B | **Current code**, fresh project folder (all native code compiled from scratch), dependencies already downloaded | **3 min 38 s** (358 tasks) |
| C | B, then only a JavaScript file changed | **20 s** |
| D | B again with `org.gradle.caching` on, after `clean`; the cache is being **filled** (I was also running other commands, so this is noisy) | 5 min 53 s (287 tasks executed, 43 from cache) |
| E | Fresh project folder (`android/` deleted and regenerated, as on a new CI/EAS machine) with the Gradle cache **restored** | **70 s** (196 executed, 134 from cache) |

What D and E say: turning the cache on costs a little on the run that fills it (D), and pays back on every later run
that can restore it (E: about 3x faster than B). Caveat: E ran on the same machine and the same folder path. On EAS or
GitHub the folder paths differ, so some entries may not match and the gain may be smaller. Whether the cache is actually restored there
has to be checked in the first two real runs (look for `FROM-CACHE` in the Gradle log).

Run A vs B is not a like-for-like comparison of one change: it mixes "removed 3 unused modules" with "dependencies
were already downloaded". The cold-cache time of the current code was not measured separately (expect between B and A).

### What the native build does and does not compile

The AI engine (llama.cpp) is **not** compiled from source. `llama.rn` ships it prebuilt for `arm64-v8a` and
`x86_64` (several CPU-optimised variants, ~90 MB, which is why the APK is ~110 MB) and compiles only a small JNI wrapper
(`rnllamaBuildFromSource` defaults to false). An earlier version of this page claimed llama.cpp was compiled
for every CPU type; that was wrong. What costs time is the React Native C++ glue, Expo modules, every other
native module, Kotlin/Java compile, packaging, and the number of CPU types they are built for.

### Why a release build might take 2 hours for you

I cannot see your builds, so this is a diagnosis from the code on `main` (commit `94b571d`), not a measurement:

1. **Queue time on EAS.** Free-tier cloud builds wait in a queue before any compiling starts. If your
   build page says it was *Queued* for a long time, that is most of the 2 hours and nothing in the code can fix it.
2. **Four CPU types.** `main` has no `expo-build-properties`, so Expo's template builds `armeabi-v7a, arm64-v8a, x86, x86_64`:
   every native module is compiled four times.
3. **Many native modules.** `main` adds NativeWind, Reanimated, Worklets, MMKV + Nitro, keyboard-controller, Gesture Handler,
   flash-list, svg. Most of them contain C++ that is compiled per CPU type, and several of them are not used by the app
   (`className=` is only used inside `components/ui/*`, which nothing renders).
4. **Cold cache every time.** EAS machines are fresh. Your `eas.json` caches `~/.gradle/caches`, but without `org.gradle.caching=true`
   that only stores downloaded libraries, never compiled code.

**To find out which one it is:** open the build on expo.dev. It shows *Queued* time and *Build* time separately and lists the phases
(*Install dependencies*, *Prebuild*, *Run gradlew*). If *Run gradlew* is under ~20 min, the rest was queue. Send me those numbers and I can be exact.

### What was changed for speed (on branch `claude/modest-bohr-7h1a9l`)

| Change | Where | Effect |
|---|---|---|
| arm64-v8a only | `app.json` > `expo-build-properties` | one CPU type instead of four (also a smaller APK) |
| Removed 6 unused native modules | `package.json` | less C++/Java compiled |
| No minify / shrink on release | `app.json` | skips R8 |
| Gradle build cache + 3 GB heap | `mobile/plugins/withGradleSpeed.js` | see runs D/E; template default heap is 2 GB |
| Debug loop with no rebuild | section 1 | JS edits in about a second |
| Runner without an EAS queue | `.github/workflows/android-apk.yml` | no waiting (GitHub's free runners; public repos get 4 vCPU) |

## 3. Ways to get a release APK

**A. GitHub Actions (no queue)**: run *Android APK* from the Actions tab (or push a `v*` tag), download the `chiwiwi-arm64-apk` artifact.
Signed with the default debug key: fine for sideloading, not for Google Play. *(The workflow itself has not been run on GitHub yet.)*

**B. Locally** (needs the PC setup in 1.2):
```bash
cd mobile
npm ci
npx expo prebuild --platform android      # generates mobile/android (git-ignored)
cd android && ./gradlew :app:assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```
Keep `mobile/android` between builds: the second build is incremental. Only re-run `prebuild --clean` when `app.json` or plugins change.

**C. EAS cloud**: `cd mobile && npx eas-cli build -p android --profile preview` (subject to the queue; standalone APK, no Metro needed).
The `development` profile builds a **development client** APK (`developmentClient: true`, `expo-dev-client` is installed): see section 1.8.

On Windows: keep the project on a local SSD (not OneDrive/Google Drive), and exclude the project and `~/.gradle` from antivirus
real-time scanning; both are common causes of very slow Gradle builds (general advice, not measured here).

## 4. Checks that run in seconds (before any build)

```bash
cd mobile && npm run check          # strict typecheck (app + tests) + all unit tests
npx expo export --platform android  # compile the JS with Metro/Hermes
node scripts/verify-catalog.mjs     # every model: repo ungated, exact size + sha256, and a Range request on the real download URL (needs internet; works on Windows)
```

## 5. Troubleshooting

- **`Could not resolve ... 429 Too Many Requests` from Maven Central**: the registry is rate-limiting your IP.
  Re-run (Gradle keeps what it downloaded) or point Gradle at a mirror in `~/.gradle/init.d/`.
- **Gradle out of memory**: raise `-Xmx` in `mobile/plugins/withGradleSpeed.js` and re-run `prebuild`.
- **App says the engine is not available**: you are in Expo Go or a browser. Install the debug/release build.
- **Red screen "Unable to load script"** in a debug build: Metro is not running or `adb reverse tcp:8081 tcp:8081` was lost (1.4).
- **Changed `app.json`/plugins or added a native module**: `npx expo prebuild --platform android --clean`, then rebuild (1.5).
