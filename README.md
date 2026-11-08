# StoryBox Studio 🎬

A kid-friendly studio for making short (up to **3 minutes**) animated videos. It borrows the useful ideas from three tools:

| Idea from… | What you get here |
| --- | --- |
| **Adobe Animate** | A stage with characters and props you drag around. Move the playhead, drag a character, and a ◆ keyframe is created so it glides there (smooth / bouncy / springy / jump easing, idle wiggle/hop/float/spin, pop/fade/slide entrances). |
| **DaVinci Resolve** | A multi-track timeline: scenes, one row per character/prop, voices, music, sound effects. Drag bars to move, drag edges to trim, scrub the ruler, cross-fade between scenes, music that ducks under dialogue, undo/redo, export to a video file. |
| **ElevenLabs** | Type what a character says and generate a voice (with your own ElevenLabs key), or use a computer voice, or **record your own voice** (with a squeaky or deep effect). The character's mouth flaps while their voice plays. |

Everything runs in the browser. There is no server and no account. **My stories** keeps as many stories as you like, each autosaved in the browser, and you can also save a story to a `.storybox.json` file (recordings included) and add it back later.

## Run it

Requires Node 20+.

```bash
npm install
npm run dev      # then open the printed http://localhost:5173
```

Other scripts: `npm run build` (type-check + production build into `dist/`), `npm test` (unit tests).

Use a current **Chrome or Edge**. It has only been tested in Chromium; Safari and Firefox are untested (see "Exporting").

To use it on an iPad or share it with family, **put it online over https** (next section).

## Making a video

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
| **Microphone** | ✅ | ✅ |
| **Computer voice** (browser speech) | ✅ | ❌ **silent** |

Browsers do not let a web page capture their built-in speech synthesis into a recording, so computer voices are for drafting only. They are drawn with a striped bar on the timeline and the export dialog warns you how many clips will be silent.

**🎙 Record my lines** turns drafts into the real thing in one go: it walks through each computer-voice line, shows the words in big letters, records your (or your daughter's) voice, lets you listen back (✓ keep / ↺ try again), and swaps the sound in. The words, the speaker and the start time stay as they were, and the character's mouth flaps to your voice. Start it from the banner in the Voice tab, from the warning in the Export dialog, or per line with **Re-record this line** in the inspector. The Voice tab opens on the microphone by default.

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

**GitHub Pages (free for public repos; private repos need a paid GitHub plan):** the workflow in `.github/workflows/deploy.yml` builds and publishes the app.

1. Merge this branch into `main`.
2. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The *Deploy to GitHub Pages* workflow runs on every push to `main` (or run it by hand from the *Actions* tab). Your app appears at `https://<your-user>.github.io/<repo>/`.

**Anywhere else:** run `npm run build` and upload the `dist/` folder to any static host (Netlify Drop, Cloudflare Pages, a school/web server). The build uses relative links, so it works at a site root or in a sub-folder.

**Install it:** on an iPad/iPhone open the page in Safari → Share → **Add to Home Screen**. In Chrome/Edge use the install icon in the address bar (or ⋮ → *Install StoryBox*). Updates arrive by themselves the next time you open the app online (Help shows the build number).

Stories and recordings stay on the device that made them (they are not uploaded anywhere). To move a story to another device, use **Project → Save file…** and add it there with **Add a story from a file…**.

## Known limitations

* Real-time export (above); no faster-than-real-time render.
* The art is built in (6 characters, 14 props, 8 scenes, 4 music loops, 8 sound effects). There is no image/video import yet.
* Characters are single pieces with a flapping mouth and blinking; there is no limb rigging or frame-by-frame drawing.
* Playback preview of computer voices uses the browser's speech engine, so timing can drift slightly from the bars; the length of a clip comes from the last time you pressed "Hear it" (or an estimate).
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
src/ui/             React UI: Stage, Timeline, Library (side panel), VoicePanel, Narration,
                    Stories, Inspector, Dialogs, ErrorBoundary
public/             app manifest, icons, service worker (offline); vite.config.ts bakes the file list into it
.github/workflows/  deploy.yml (GitHub Pages)
```
