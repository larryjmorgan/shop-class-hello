# StoryBox Studio 🎬

Two things in one app, for making short (up to **3 minutes**) animated movies:

* **The kids' corner: for a young child.** It opens first, on six big picture tiles. There is nothing to read and no timeline.
  * **📖 Story time**: pick a ready-made story (Birthday Party, Beach Day, Bedtime, Space Trip, Under the Sea, Forest Picnic), pick who is in it, add music and "stickers" to each scene, press ▶.
  * **🎨 My own story**: the next step up. She builds the story scene by scene: 1 to 6 scenes, a backdrop, music and stickers for each, up to 4 friends per scene and 10 things they can do (walk in, hop, dance, spin, wave, sleep, fly, run around, wiggle, grow big).
  * **🖌️ Paint a friend**: paint a character with her fingers; the painted friend can then be used in her stories.
  * **🧮 Learn**: letters, first reading, counting, colours and shapes, in the spirit of Montessori materials.
  * **📚 My stories** (watch again or change) and **🎭 Puppet play** (a free-play toy).
* There is **no microphone and no voice recording** anywhere in the app.
* **🎬 The Studio: for grown-ups.** A full story editor (below). Grown-up tools on the kids' shelf (behind a small sum a toddler can't answer) save a story as a video file, open it in the Studio to fine-tune, or delete it.

The Studio borrows the useful ideas from three tools:

| Idea from… | What you get here |
| --- | --- |
| **Adobe Animate** | A stage with characters and props you drag around. Move the playhead, drag a character, and a ◆ keyframe is created so it glides there (smooth / bouncy / springy / jump easing, idle wiggle/hop/float/spin, pop/fade/slide entrances). |
| **DaVinci Resolve** | A multi-track timeline: scenes, one row per character/prop, voices, music, sound effects. Drag bars to move, drag edges to trim, scrub the ruler, cross-fade between scenes, music that ducks under dialogue, undo/redo, export to a video file. |
| **ElevenLabs** | Type a line and, optionally, generate a studio-quality voice with your own ElevenLabs key. The character's mouth flaps while the line plays. There is deliberately **no voice recording and no robotic computer voice**. |

Everything runs in the browser. There is no server and no account. **My stories** keeps as many stories as you like, each autosaved in the browser. **💾 Back up everything** saves all of it (every story, her painted friends, her Learn levels) into one file you can keep in iCloud Drive or anywhere else (see [Backing up](#backing-up-icloud-drive-another-computer)).

## Run it

### Easiest: one file, nothing to install

Open **`standalone/StoryBox.html`** (in this repo) by double-clicking it. It opens on the child's home screen; the 🔒 (answer the sum) opens the Studio. It is the whole app in a single file and runs in Chrome or Edge with no Node.js, no server and no internet. On GitHub: open the file → the **⬇ Download raw file** button → double-click the downloaded file.

* Stories are saved in that browser on that computer. Keep using the same browser (Chrome/Edge) and **don't rename or move the file between uses** if you can avoid it, since the browser links saved stories to where the file lives. Use **💾 Back up everything** now and then (see [Backing up](#backing-up-icloud-drive-another-computer)).
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

## The kids' corner (for a young child)

The home screen has six tiles, each with its name along the bottom: 📖 **Story time**, 🎨 **My own story**, 📚 **My stories**, 🖌️ **Paint a friend**, 🧮 **Learn**, 🎭 **Puppet play**, and a small 🔒 for grown-ups.

### 📖 Story time (ready-made stories)

1. **Pick a story** from six picture cards: 🎂 Birthday Party, 🏖️ Beach Day, 🌙 Bedtime, 🚀 Space Trip, 🐠 Under the Sea, 🍎 Forest Picnic.
2. **Pick who is in it.** Two friends are already picked; tap characters to add or remove them (1 to 4). The coloured dot on a picked character changes its colour. Press the big ✓.
3. **Make it hers.** Each of the 3 scenes shows a live little picture with:
   * 🎵: tap to change that scene's music (sunny ☀️, silly 🕺, adventure 🗺️, Twinkle Twinkle ⭐, sleepy 🌙, or off). A few seconds of it plays so she can hear it.
   * ➕: add up to 3 things to the scene (balloons, cake, a rainbow, a rocket, fish…). Tap one again to take it away.
   * The row of faces at the top (✏️) goes back to change who is in the story.
4. **Press the big green ▶.** The story plays full screen with music and sound effects (big ⏸ / 🔁 / ✅ buttons). It is about 35–40 seconds long.

Everything is saved automatically as soon as she reaches step 3. On **📚 My stories** she taps a story to watch it, or ✏️ to change it.

### 🎨 My own story (more choices)

Everything is on one screen, and the big picture keeps replaying the scene she is on, so every change shows straight away.

* **Scenes** along the top (1 to 6; a story is about 16 seconds with one scene and about 56 seconds with six). ➕ adds a scene that starts with the same friends and place. 🗑️ removes a scene after asking (🗑️ yes / ↩️ no).
* **Backdrops** down the side: tap one to change where this scene happens.
* **Friends** at the bottom: ➕ adds one (up to 4 per scene). Tap a friend (or tap it on the picture) to choose **what it does** from 10 pictures: 🚶 walk in, 🦘 hop, 💃 dance, 🌀 spin, 👋 wave, 😴 sleep, 🎈 fly, 🏃 run around, 🤪 wiggle, 🦒 grow big. The coloured dot changes its colour, 🗑️ takes it out of the scene, ✓ goes back.
* 🎵 music and ⭐ stickers (up to 3) per scene, as in Story time.
* ▶ plays the whole story. It is saved from her first change.

### 🖌️ Paint a friend

Pick a character; it appears white, like a colouring page. She paints it with a finger (several fingers work too): 9 colours plus 🌈 rainbow, a big or small brush, 🧽 rubber, ↩️ undo and 🗑️ start again (which ↩️ can undo). Paint only sticks to the character, so she can't go over the lines, and the eyes and mouth always show through. ✓ saves it.

Painted friends appear first in every friend picker (My own story, Story time, Puppet play, and the Studio's Characters tab), and they still blink and talk. In My own story the 🖌️ tile in the friend picker paints a new friend and puts it straight into the scene. Tapping a painted friend on the paint screen paints it again (every story using it updates); its 🗑️ throws it away after asking, and stories that used it show the plain character instead. Up to 20 painted friends are kept.

### 🧮 Learn

Five short activities modelled on well-known Montessori materials for ages 3 to 5. Each round earns a row of ⭐ and ends with a dancing friend. A wrong tap only makes things wiggle; there are no crosses or buzzers.

| Activity | What she does | Based on |
| --- | --- | --- |
| 🔢 **Counting** | Taps each object to count it (each gets its number), then taps the matching numeral | cards and counters |
| 🔤 **Letters** | Traces a big lowercase letter with a finger; a picture of something that starts with it appears (a 🍎, b 🐻 …) | sandpaper letters |
| 📖 **Reading** | Taps the letters of a short word left to right to sound it out (each letter has a picture clue for its sound), then sees or picks its picture | phonetic reading with short words (vowels blue, consonants red, as on a movable alphabet) |
| 🎨 **Colours** | Finds the colour tablet that matches | colour tablets |
| 🔷 **Shapes** | Drags shapes into their holes (or taps a shape, then its hole) | geometric insets |

Each activity has 3 levels that adjust by themselves: a round with no wrong taps moves up, three or more wrong taps moves down. Reading starts with sounding out a word and seeing its picture, then picking the right picture from three, then picking it from look-alike words (cat / hat / bat) without the clues. Counting goes up to 3, then 5, then 10. Colours go from red/yellow/blue to 11 colours, then to shades of one colour. Shapes go from 3 to 5 holes. Letters need more of the letter traced at higher levels.

### 📚 My stories and the grown-ups lock

Both kinds of story are on the shelf, newest first (🎨 marks her own). She taps one to watch it, or ✏️ to change it.

**Grown-ups:** on the shelf, press 🔒 and answer the sum to **🎬 save a story as a video file** (to share it), **🛠 open it in the Studio** (a copy, to fine-tune with the full editor), or **🗑 delete** it. **💾 Back up everything** and **📂 Restore a backup** are there too (see [Backing up](#backing-up-icloud-drive-another-computer)). The 🔒 on the home screen opens the Studio (or add `#studio` to the end of the web address to go straight there). Puppet movies recorded with an earlier version still appear on the shelf.

### 🎭 Puppet play

A free-play toy: pick a backdrop, tap friends and things to put them on the stage, drag them around (they face the way they walk), tap them to hop, wiggle, spin or squash, and drag them onto the 🗑️ to put them away. 🎵 cycles music. Nothing is recorded.

## Backing up (iCloud Drive, another computer)

On 📚 **My stories**, press 🔒, answer the sum, then:

* **💾 Back up everything** downloads one file, `StoryBox backup YYYY-MM-DD.json`. It holds every Story time and My own story story, every Studio story (with its ElevenLabs audio), her painted friends and her Learn levels. Your ElevenLabs key and settings are **not** included. The same two buttons are in the Studio under **Project**.
* **📂 Restore a backup** reads such a file. It adds anything that is missing and updates anything the backup has a newer copy of. It never replaces newer work and never deletes anything, so restoring the same file twice is harmless. It also accepts a single Studio `.storybox.json` file (added as a new Studio story).

Puppet movies recorded with an earlier version are videos and are not in the backup; save each one with its **⬇ Save** button.

### Automatic backup (Chrome or Edge on a computer)

Get Chrome at [google.com/chrome](https://www.google.com/chrome/). Microsoft Edge comes with Windows.

Set it up once and the backup file keeps itself up to date:

1. On the shelf's grown-up tools (or in the Studio under **Project**), press **🔄 Turn on automatic backup…**.
2. In the save window, choose **iCloud Drive** (Mac: in the sidebar; Windows: the iCloud Drive folder from iCloud for Windows) and keep the name `StoryBox backup.json`.
3. That's it. About 15 seconds after anything changes, the app rewrites that file, and iCloud uploads it. The shelf shows when it last saved. If nothing changed, nothing is written.

Things to know:

* **After the app is reopened, Chrome may ask again.** If it does, automatic backup pauses: a small orange dot appears on the home screen's 🔒, and the Studio (and the shelf's grown-up tools) shows **▶ Resume**. Press it; it catches up straight away. If Chrome's question offers **"Allow on every visit"**, choose it so you aren't asked again. Nothing is lost while paused; it just waits.
* It always writes the whole backup in one go (to a temporary file that replaces the old one), so the file is never half-written. It is the same file as **💾 Back up everything** makes, so **📂 Restore a backup** reads it.
* If the file is moved or deleted, or the app ever has trouble reopening it, it stops and asks you to **Choose file…** again.
* Changes from the last few seconds before the app is closed are written the next time it is opened.
* **Turn off** stops it (the file stays where it is). Safari and Firefox don't support this; use **💾 Back up everything** there.

**Putting the backup in iCloud Drive:**

* **Mac:** in Finder, drag the file from **Downloads** to **iCloud Drive** in the sidebar. Or have Chrome always ask where to save: ⋮ → **Settings** → **Downloads** → turn on **Ask where to save each file before downloading** (or **Change…** the location to iCloud Drive).
* **Windows:** install **iCloud for Windows** (Microsoft Store) and sign in. This adds an **iCloud Drive** folder in File Explorer. Drag the file there, or set Chrome's download location to it.
* **To restore**, press **📂 Restore a backup** and pick the file from iCloud Drive.

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

Stories (and any ElevenLabs audio) stay on the device that made them (they are not uploaded anywhere). To move everything to another device, use **💾 Back up everything** and **📂 Restore a backup** there.

## Known limitations

* Real-time export (above); no faster-than-real-time render.
* Automatic backup was tested in Chromium with a browser-managed stand-in for the chosen file (the test can't click the real save window), including closing and reopening the browser. It was not tested writing into a real iCloud Drive folder or from the double-click file, so check once that `StoryBox backup.json` shows a recent time in iCloud Drive.
* The art is built in (9 characters plus her painted ones, 16 props, 8 scenes, 5 music loops, 8 sound effects) and Story time has 6 scenarios. There is no image/video import yet. New scenarios are plain data in `src/kid/scenarios.ts`.
* Painted friends are kept in this browser on this device (they travel with **Back up everything**). A single Studio story saved with *Project → Save file…* and opened on another device shows the plain character in place of a painted one.
* The Learn activities are modelled on common Montessori materials, but a Montessori teacher has not reviewed them. The app has no voices, so it never says a letter's sound: **Letters and Reading work best with a grown-up saying the sounds with her** (tap a letter, say its sound, then run them together: "c… a… t… cat"). The picture clues help her remember the sounds on her own. Tracing checks how much of the letter is covered, not the stroke order. No app can promise to teach a 3-year-old to read; this is practice to do together.
* Characters are single pieces with a flapping mouth and blinking; there is no limb rigging or frame-by-frame drawing.
* The kids' screens (stories, painting, Learn, puppet play) were tested in Chrome with a mouse and simulated touch, **not** with a real toddler or a real tablet. I can't listen to audio, so how the music and sound effects actually sound is untested by ear.
* The ElevenLabs integration was tested against a mocked endpoint, **not** the live service, so the first real generation is worth a quick check.
* Stories live in this browser's storage on this device; use **💾 Back up everything** for backups. **Safari (iPad/iPhone) can erase a website's stored data after about a week of not using it**; installing the app to the Home Screen is reported to avoid that, but save a project file for anything you care about.
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
src/backup.ts       "Back up everything" / "Restore a backup" (one file for all stories, painted friends, Learn)
src/autoBackup.ts   automatic backup: keeps a chosen file (e.g. in iCloud Drive) up to date
src/library.ts      the "My stories" storage (index + one key per story), audio bookkeeping
src/thumb.ts        library picture thumbnails
src/transport.ts    play / pause / seek
src/ui/             React UI: Root (kid screens vs studio), the Studio's Stage, Timeline, Library,
                    VoicePanel, Narration, Stories, Inspector, Dialogs, ErrorBoundary
src/kid/            the kids' screens: scenarios.ts (story content), story.ts (choices -> movie, shelf
                    storage), StoryMaker (Story time), own.ts + OwnStoryMaker (My own story),
                    painted.ts + Painter (paint a friend), learn.ts + Learn (counting, letters, colours,
                    shapes), StoryPlayer/StoriesShelf/Home, Theater + puppet.ts (puppet play),
                    theaterAudio.ts (sounds + music), gate.ts + ParentGate (grown-ups lock), movies.ts (old movies)
scripts/             inline-build.mjs (single-file build), to-mp4.sh (video converter)
public/             app manifest, icons, service worker (offline); vite.config.ts bakes the file list into it
.github/workflows/  deploy.yml (GitHub Pages)
```
