# StoryBox Studio 🎬

Two things in one app, for making short (up to **3 minutes**) animated movies:

* **🎭 Puppet Theater: for a young child.** It opens first. She picks a backdrop and friends with giant picture buttons, drags them around, taps them to make them hop, wiggle, spin and boing, and presses the **one big red button** to record while she talks. The characters' mouths move to her real voice. When she stops, her movie is saved and she can watch it right away on the **🎞️ My movies** shelf. There is nothing to read, no menus and no timeline. Saving a movie to the computer, deleting one, and the full editor are behind a small sum a toddler can't answer (a "grown-ups lock" 🔒).
* **🎬 The Studio: for grown-ups.** A full story editor (below) for planned stories with scenes, music and recorded narration.

The Studio borrows the useful ideas from three tools:

| Idea from… | What you get here |
| --- | --- |
| **Adobe Animate** | A stage with characters and props you drag around. Move the playhead, drag a character, and a ◆ keyframe is created so it glides there (smooth / bouncy / springy / jump easing, idle wiggle/hop/float/spin, pop/fade/slide entrances). |
| **DaVinci Resolve** | A multi-track timeline: scenes, one row per character/prop, voices, music, sound effects. Drag bars to move, drag edges to trim, scrub the ruler, cross-fade between scenes, music that ducks under dialogue, undo/redo, export to a video file. |
| **ElevenLabs** | **Record your own voice** (with a squeaky or deep effect), or type a line and generate a studio-quality voice with your own ElevenLabs key. The character's mouth flaps while the voice plays. There are deliberately **no robotic computer voices**. |

Everything runs in the browser. There is no server and no account. **My stories** keeps as many stories as you like, each autosaved in the browser, and you can also save a story to a `.storybox.json` file (recordings included) and add it back later.

## Run it

### Easiest: one file, nothing to install

Open **`standalone/StoryBox.html`** (in this repo) by double-clicking it. It opens on the child's Puppet Theater screen; the 🔒 (answer the sum) opens the Studio. It is the whole app in a single file and runs in Chrome or Edge with no Node.js, no server and no internet. On GitHub: open the file → the **⬇ Download raw file** button → double-click the downloaded file.

* Stories are saved in that browser on that computer. Keep using the same browser (Chrome/Edge) and **don't rename or move the file between uses** if you can avoid it, since the browser links saved stories to where the file lives. Use **Project → Save file…** now and then for a backup.
* The browser asks permission to use the microphone, and may ask again each time you open the file.
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

## The Puppet Theater (for a young child)

1. **Open the app.** It starts on two giant pictures: 🎭 (make a movie) and 🎞️ (my movies).
2. **Pick a backdrop** (round pictures on the left) and tap **friends and things** along the bottom to put them on the stage (up to 8).
3. **Play:** drag a friend to move it (it faces the way it walks); **tap** it and it hops, wiggles, spins or squashes with a sound. Drag a friend onto the 🗑️ in the corner to put it away. The 🎵 button cycles gentle music.
4. **Press the big red button.** The microphone question appears (for a grown-up to answer), then a big **3 – 2 – 1**, then the stage gets a red frame. Talk, sing and play: the last friend she touched moves its mouth when she makes a sound. Press the big ⏹ when done (it stops by itself at 3 minutes).
5. **The movie plays back straight away and is already saved.** ✅ goes to the shelf, 🎭 makes another.

**Grown-ups:** on the shelf, press 🔒 and answer the sum to **save a movie file** to the computer (to share it) or delete one. The 🔒 on the home screen opens the Studio (or add `#studio` to the end of the web address to go straight there). The microphone is only on while recording. Movies are stored in this browser (about 20 MB a minute), so download the ones you want to keep.

## The Studio: making a planned video

1. **Scenes** tab: pick a background. It starts at the playhead; add another later for a scene change.
2. **Characters / Props**: click to add at the playhead. Drag on stage; round handle = turn (hold Shift to snap), square handle = resize.
3. **Animate**: slide the playhead and drag something. Drag ◆ in the timeline to retime, double-click one to delete it. Untick "Animate" in the inspector to move a whole path instead.
4. **Voice**: choose who's talking and add their line. **Music** and **Sounds** add loops and effects (all synthesised in the app, so nothing to license). You can also import your own audio file if you own the rights.
5. **Export video** (top right).

Shortcuts: `Space` play/pause · `←/→` nudge playhead (`Shift` = 1 s) · `Delete` remove selected · `Ctrl/⌘+Z` undo.

### My stories

**📚 My stories** (top bar) shows every story as a picture card: open, copy or delete them, or start a new one. Switching stories never loses anything: the one you leave is saved first, and opening a story doesn't count as editing it. **Project → Add a story from a file…** adds a saved `.storybox.json` as a *new* story (it never replaces the one you're on). Deleting a story also erases the recordings only it used. A sample story is added the first time so you can poke around.

## Voices: what ends up in the exported video

| Voice source | Preview in editor | In the exported video |
| --- | --- | --- |
| **ElevenLabs** (needs API key) | ✅ | ✅ |
| **Microphone** (your voice, hers) | ✅ | ✅ |
| **A written line with no voice yet** (a "draft") | silent | silent |

There are **no computer/robot voices**. A line you add with **📝 Add this line to record later** (or the lines in the sample story) is a silent placeholder, drawn with a striped bar on the timeline; the Voice tab and the Export dialog tell you how many lines still need a voice. Stories saved by an earlier version that used the computer voice open with those lines as silent placeholders.

**🎙 Record my lines** turns drafts into the real thing in one go: it walks through each line that has no voice yet, shows the words in big letters, records your (or your daughter's) voice, lets you listen back (✓ keep / ↺ try again), and swaps the sound in. The words, the speaker and the start time stay as they were, and the character's mouth flaps to your voice. Start it from the banner in the Voice tab, from the warning in the Export dialog, or per line with **Re-record this line** in the inspector. The Voice tab opens on the microphone by default.

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

A deployed copy is worth having: the **microphone only works on https** (or `localhost`), it can be **added to an iPad/iPhone/Android home screen** like an app, it **keeps working offline** after the first visit, and installed apps are less likely to have their saved stories cleared by the browser.

Every push to `main` is built by `.github/workflows/deploy.yml`, which always attaches two downloads to the run (Actions tab → the run → *Artifacts*): **StoryBox-single-file** (the double-click file above) and **storybox-site** (the full website as a ZIP, for any static host).

**GitHub Pages (optional; free for public repos, paid plan needed for private ones):**

1. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables → New repository variable**: name `DEPLOY_PAGES`, value `true`.
3. Push to `main` (or run the workflow by hand from the *Actions* tab). Your app appears at `https://<your-user>.github.io/<repo>/`.

**Anywhere else:** run `npm run build` and upload the `dist/` folder to any static host (Netlify Drop, Cloudflare Pages, a school/web server). The build uses relative links, so it works at a site root or in a sub-folder.

**Install it:** on an iPad/iPhone open the page in Safari → Share → **Add to Home Screen**. In Chrome/Edge use the install icon in the address bar (or ⋮ → *Install StoryBox*). Updates arrive by themselves the next time you open the app online (Help shows the build number).

Stories and recordings stay on the device that made them (they are not uploaded anywhere). To move a story to another device, use **Project → Save file…** and add it there with **Add a story from a file…**.

## Known limitations

* Real-time export (above); no faster-than-real-time render.
* The art is built in (6 characters, 14 props, 8 scenes, 4 music loops, 8 sound effects). There is no image/video import yet.
* Characters are single pieces with a flapping mouth and blinking; there is no limb rigging or frame-by-frame drawing.
* The Puppet Theater's microphone uses the browser's echo cancellation so music and sound effects from the speakers aren't recorded twice; this was **not** tested with a real room, speakers and a real child, so try it and tell me how it sounds. There is no live voice-changing effect in the theater (the Studio's microphone recorder has squeaky/deep).
* The theater's mouth movement follows how loud she is (open when she makes a sound), not the actual words, and only the last friend she touched talks.
* The Puppet Theater was tested with a mouse and a fake microphone in Chrome, **not** with a real toddler or a touchscreen.
* The ElevenLabs integration was tested against a mocked endpoint, **not** the live service, so the first real generation is worth a quick check.
* Stories live in this browser's storage on this device; use *Project → Save file…* for backups. **Safari (iPad/iPhone) can erase a website's stored data after about a week of not using it**; installing the app to the Home Screen is reported to avoid that, but save a project file for anything you care about.
* The **microphone only works on a secure page**: `http://localhost` on the same computer, or https (see *Put it online*). If you open the dev server from an iPad by its network address (`http://192.168…`) recording is blocked by the browser; the app tells you so.
* Sound is scheduled when you press Play, so changes you make to voices/music *while it is playing* are heard on the next play (pictures update immediately).
* Recordings of clips you delete stay in browser storage while the story exists (Undo needs them); deleting the whole story erases the ones nothing else uses.
* Offline use and Add-to-Home-Screen were verified in Chrome (including a simulated sub-folder deployment and update), **not** on a real iPad.

## Code map

```
src/model.ts        data model, easing, keyframe sampling (unit-tested in model.test.ts)
src/assets.ts       built-in characters/props (SVG) and backgrounds (canvas)
src/render.ts       draws a frame; shared by the editor preview and the exporter
src/audio.ts        synthesised music/SFX, mixer with ducking, browser TTS, ElevenLabs, mic
src/exporter.ts     canvas + audio -> MediaRecorder
src/store.ts        app state, undo/redo, autosave, editing actions, story switching
src/library.ts      the "My stories" storage (index + one key per story), recording bookkeeping
src/thumb.ts        library picture thumbnails
src/transport.ts    play / pause / seek
src/ui/             React UI: Root (kid screens vs studio), the Studio's Stage, Timeline, Library,
                    VoicePanel, Narration, Stories, Inspector, Dialogs, ErrorBoundary
src/kid/            the Puppet Theater: puppet.ts (logic), Theater/Home/Shelf screens, theaterAudio.ts
                    (mixer + recorder), movies.ts (shelf storage), gate.ts + ParentGate (grown-ups lock)
scripts/             inline-build.mjs (single-file build), to-mp4.sh (video converter)
public/             app manifest, icons, service worker (offline); vite.config.ts bakes the file list into it
.github/workflows/  deploy.yml (GitHub Pages)
```
