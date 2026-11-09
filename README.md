# StoryBox Studio 🎬

Two things in one app, for making short (up to **3 minutes**) animated movies:

* **📖 Story Maker: for a young child.** It opens first. She picks a story (Birthday Party, Beach Day, Bedtime, Space Trip, Under the Sea, Forest Picnic), picks which characters are in it, adds music and "stickers" to each scene, and presses ▶. The app animates the whole story: a title card, three scenes where her characters walk in, hop, dance, wave, fall asleep and so on, and "The End". There is nothing to read and no timeline; everything is big pictures. Her stories are saved on the **📚 My stories** shelf to watch again or change. There is also **🎭 Puppet play**, a free-play toy (drag characters, tap them to make them react).
* There is **no microphone and no voice recording** anywhere in the app.
* **🎬 The Studio: for grown-ups.** A full story editor (below). Grown-up tools on the kids' shelf (behind a small sum a toddler can't answer) save a story as a video file, open it in the Studio to fine-tune, or delete it.

The Studio borrows the useful ideas from three tools:

| Idea from… | What you get here |
| --- | --- |
| **Adobe Animate** | A stage with characters and props you drag around. Move the playhead, drag a character, and a ◆ keyframe is created so it glides there (smooth / bouncy / springy / jump easing, idle wiggle/hop/float/spin, pop/fade/slide entrances). |
| **DaVinci Resolve** | A multi-track timeline: scenes, one row per character/prop, voices, music, sound effects. Drag bars to move, drag edges to trim, scrub the ruler, cross-fade between scenes, music that ducks under dialogue, undo/redo, export to a video file. |
| **ElevenLabs** | Type a line and, optionally, generate a studio-quality voice with your own ElevenLabs key. The character's mouth flaps while the line plays. There is deliberately **no voice recording and no robotic computer voice**. |

Everything runs in the browser. There is no server and no account. **My stories** keeps as many stories as you like, each autosaved in the browser, and you can also save a story to a `.storybox.json` file (its audio included) and add it back later.

## Run it

### Easiest: one file, nothing to install

Open **`standalone/StoryBox.html`** (in this repo) by double-clicking it. It opens on the child's Puppet Theater screen; the 🔒 (answer the sum) opens the Studio. It is the whole app in a single file and runs in Chrome or Edge with no Node.js, no server and no internet. On GitHub: open the file → the **⬇ Download raw file** button → double-click the downloaded file.

* Stories are saved in that browser on that computer. Keep using the same browser (Chrome/Edge) and **don't rename or move the file between uses** if you can avoid it, since the browser links saved stories to where the file lives. Use **Project → Save file…** now and then for a backup.
* It can't be "installed" or work as an offline app the way the https version does; it doesn't need to, since it is already a local file.
* It is a snapshot of the app. To refresh it after changes, run `npm run build:standalone`, or download **StoryBox-single-file** from the latest *Build and publish* run in the Actions tab.

### Developers: run from source

Requires Node 20+.

```bash
npm install
npm run dev      # then open the printed http://localhost:5173
```

Other scripts: `npm run build` (type-check + production build into `dist/`), `npm test` (unit tests).

Use a current **Chrome or Edge**. It has only been tested in Chromium; Safari and Firefox are untested (see "Exporting").

To use it on an iPad or share it with family, **put it online over https** (next section).

## The Story Maker (for a young child)

1. **Open the app.** It starts on big pictures: 📖 **make a story** (the biggest), 📚 **my stories**, 🎭 **puppet play**.
2. **Pick a story** from six picture cards: 🎂 Birthday Party, 🏖️ Beach Day, 🌙 Bedtime, 🚀 Space Trip, 🐠 Under the Sea, 🍎 Forest Picnic.
3. **Pick who is in it.** Two friends are already picked; tap characters to add or remove them (1 to 4). The coloured dot on a picked character changes its colour. Press the big ✓.
4. **Make it hers.** Each of the 3 scenes shows a live little picture with:
   * 🎵: tap to change that scene's music (sunny ☀️, silly 🕺, adventure 🗺️, Twinkle Twinkle ⭐, sleepy 🌙, or off). A few seconds of it plays so she can hear it.
   * ➕: add up to 3 things to the scene (balloons, cake, a rainbow, a rocket, fish…). Tap one again to take it away.
   * The row of faces at the top (✏️) goes back to change who is in the story.
5. **Press the big green ▶.** The story plays full screen with music and sound effects (big ⏸ / 🔁 / ✅ buttons). It is about 35–40 seconds long.

Everything is saved automatically as soon as she reaches step 4. On **📚 My stories** she taps a story to watch it, or ✏️ to change it.

**Grown-ups:** on the shelf, press 🔒 and answer the sum to **🎬 save a story as a video file** (to share it), **🛠 open it in the Studio** (a copy, to fine-tune with the full editor), or **🗑 delete** it. The 🔒 on the home screen opens the Studio (or add `#studio` to the end of the web address to go straight there). Puppet movies recorded with an earlier version still appear on the shelf.

**🎭 Puppet play** is a free-play toy: pick a backdrop, tap friends and things to put them on the stage, drag them around (they face the way they walk), tap them to hop, wiggle, spin or squash, and drag them onto the 🗑️ to put them away. 🎵 cycles music. Nothing is recorded.

## The Studio: making a planned video

1. **Scenes** tab: pick a background. It starts at the playhead; add another later for a scene change.
2. **Characters / Props**: click to add at the playhead. Drag on stage; round handle = turn (hold Shift to snap), square handle = resize.
3. **Animate**: slide the playhead and drag something. Drag ◆ in the timeline to retime, double-click one to delete it. Untick "Animate" in the inspector to move a whole path instead.
4. **Voice**: choose who's talking and add their line. **Music** and **Sounds** add loops and effects (all synthesised in the app, so nothing to license). You can also import your own audio file if you own the rights.
5. **Export video** (top right).

Shortcuts: `Space` play/pause · `←/→` nudge playhead (`Shift` = 1 s) · `Delete` remove selected · `Ctrl/⌘+Z` undo.

### Studio stories

**📂 Studio stories** (top bar of the Studio) shows every Studio story as a picture card: open, copy or delete them, or start a new one. Switching stories never loses anything: the one you leave is saved first, and opening a story doesn't count as editing it. **Project → Add a story from a file…** adds a saved `.storybox.json` as a *new* story (it never replaces the one you're on). Deleting a story also erases the recordings only it used. A sample story is added the first time so you can poke around.

## Voices: what ends up in the exported video

| Voice source | Preview in editor | In the exported video |
| --- | --- | --- |
| **ElevenLabs** (needs API key) | ✅ | ✅ |
| **A written line** ("📝 Add as a silent line") | silent (mouth moves) | silent (mouth moves) |

There is **no voice recording and no computer/robot voice**. A written line is a silent placeholder: the character's mouth moves while it "plays", and it is drawn with a striped bar on the timeline. With an ElevenLabs key, the Voice tab can give one line a voice, or **✨ give all silent lines a voice** in one go (words, speaker and timing are kept). Lines recorded with the microphone in an earlier version still play.

**ElevenLabs setup:** ⚙ Settings → paste your API key → *Test & save*. The key is kept in this browser's `localStorage` and only sent to `api.elevenlabs.io`. Generating audio uses your ElevenLabs credits. Don't do this on a shared computer. Generated audio is stored in the browser (IndexedDB) and embedded when you save a project file.

## Exporting

Export records the stage and the mixed audio **in real time**, so a 3-minute story takes 3 minutes and **the tab has to stay open and visible** while it records.

* Chrome/Edge (desktop) normally produce a ready-to-share **.mp4** (H.264 + AAC). The dialog tells you if your browser produced something else.
* If you get a **.webm**, it plays on computers and uploads to YouTube. For iPads/iPhones/TVs, convert it (needs [ffmpeg](https://ffmpeg.org)):

```bash
./scripts/to-mp4.sh my-story.webm
```

Choices are 720p or 1080p at 30 fps.

## Put it online (https) and install it

A deployed copy is worth having: it can be **added to an iPad/iPhone/Android home screen** like an app, it **keeps working offline** after the first visit, and installed apps are less likely to have their saved stories cleared by the browser.

Every push to `main` is built by `.github/workflows/deploy.yml`, which always attaches two downloads to the run (Actions tab → the run → *Artifacts*): **StoryBox-single-file** (the double-click file above) and **storybox-site** (the full website as a ZIP, for any static host).

**GitHub Pages (optional; free for public repos, paid plan needed for private ones):**

1. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables → New repository variable**: name `DEPLOY_PAGES`, value `true`.
3. Push to `main` (or run the workflow by hand from the *Actions* tab). Your app appears at `https://<your-user>.github.io/<repo>/`.

**Anywhere else:** run `npm run build` and upload the `dist/` folder to any static host (Netlify Drop, Cloudflare Pages, a school/web server). The build uses relative links, so it works at a site root or in a sub-folder.

**Install it:** on an iPad/iPhone open the page in Safari → Share → **Add to Home Screen**. In Chrome/Edge use the install icon in the address bar (or ⋮ → *Install StoryBox*). Updates arrive by themselves the next time you open the app online (Help shows the build number).

Stories (and any ElevenLabs audio) stay on the device that made them (they are not uploaded anywhere). To move a story to another device, use **Project → Save file…** and add it there with **Add a story from a file…**.

## Known limitations

* Real-time export (above); no faster-than-real-time render.
* The art is built in (6 characters, 16 props, 8 scenes, 5 music loops, 8 sound effects) and the Story Maker has 6 scenarios. There is no image/video import yet. New scenarios are plain data in `src/kid/scenarios.ts`.
* Characters are single pieces with a flapping mouth and blinking; there is no limb rigging or frame-by-frame drawing.
* The Story Maker and Puppet play were tested in Chrome with a mouse and simulated touch, **not** with a real toddler or a real tablet. I can't listen to audio, so how the music and sound effects actually sound is untested by ear.
* The ElevenLabs integration was tested against a mocked endpoint, **not** the live service, so the first real generation is worth a quick check.
* Stories live in this browser's storage on this device; use *Project → Save file…* for backups. **Safari (iPad/iPhone) can erase a website's stored data after about a week of not using it**; installing the app to the Home Screen is reported to avoid that, but save a project file for anything you care about.
* Sound is scheduled when you press Play, so changes you make to voices/music *while it is playing* are heard on the next play (pictures update immediately).
* Audio of clips you delete stays in browser storage while the story exists (Undo needs them); deleting the whole story erases the ones nothing else uses.
* Offline use and Add-to-Home-Screen were verified in Chrome (including a simulated sub-folder deployment and update), **not** on a real iPad.

## Code map

```
src/model.ts        data model, easing, keyframe sampling (unit-tested in model.test.ts)
src/assets.ts       built-in characters/props (SVG) and backgrounds (canvas)
src/render.ts       draws a frame; shared by the editor preview and the exporter
src/audio.ts        synthesised music/SFX, mixer with ducking, ElevenLabs
src/exporter.ts     canvas + audio -> MediaRecorder
src/store.ts        app state, undo/redo, autosave, editing actions, story switching
src/library.ts      the "My stories" storage (index + one key per story), audio bookkeeping
src/thumb.ts        library picture thumbnails
src/transport.ts    play / pause / seek
src/ui/             React UI: Root (kid screens vs studio), the Studio's Stage, Timeline, Library,
                    VoicePanel, Narration, Stories, Inspector, Dialogs, ErrorBoundary
src/kid/            the kids' screens: scenarios.ts (story content), story.ts (choices -> movie, shelf
                    storage), StoryMaker/StoryPlayer/StoriesShelf/Home, Theater + puppet.ts (puppet play),
                    theaterAudio.ts (sounds + music), gate.ts + ParentGate (grown-ups lock), movies.ts (old movies)
scripts/             inline-build.mjs (single-file build), to-mp4.sh (video converter)
public/             app manifest, icons, service worker (offline); vite.config.ts bakes the file list into it
.github/workflows/  deploy.yml (GitHub Pages)
```
