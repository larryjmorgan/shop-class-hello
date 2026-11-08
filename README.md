# StoryBox Studio 🎬

A kid-friendly studio for making short (up to **3 minutes**) animated videos. It borrows the useful ideas from three tools:

| Idea from… | What you get here |
| --- | --- |
| **Adobe Animate** | A stage with characters and props you drag around. Move the playhead, drag a character, and a ◆ keyframe is created so it glides there (smooth / bouncy / springy / jump easing, idle wiggle/hop/float/spin, pop/fade/slide entrances). |
| **DaVinci Resolve** | A multi-track timeline: scenes, one row per character/prop, voices, music, sound effects. Drag bars to move, drag edges to trim, scrub the ruler, cross-fade between scenes, music that ducks under dialogue, undo/redo, export to a video file. |
| **ElevenLabs** | Type what a character says and generate a voice (with your own ElevenLabs key), or use a computer voice, or **record your own voice** (with a squeaky or deep effect). The character's mouth flaps while their voice plays. |

Everything runs in the browser. There is no server and no account. Your story autosaves in the browser, and you can also save/open a single `.storybox.json` file (recordings included).

## Run it

Requires Node 20+.

```bash
npm install
npm run dev      # then open the printed http://localhost:5173
```

Other scripts: `npm run build` (type-check + production build into `dist/`), `npm test` (unit tests).

Use a current **Chrome or Edge**. It has only been tested in Chromium; Safari and Firefox are untested (see "Exporting").

## Making a video

1. **Scenes** tab: pick a background. It starts at the playhead; add another later for a scene change.
2. **Characters / Props**: click to add at the playhead. Drag on stage; round handle = turn (hold Shift to snap), square handle = resize.
3. **Animate**: slide the playhead and drag something. Drag ◆ in the timeline to retime, double-click one to delete it. Untick "Animate" in the inspector to move a whole path instead.
4. **Voice**: choose who's talking and add their line. **Music** and **Sounds** add loops and effects (all synthesised in the app, so nothing to license). You can also import your own audio file if you own the rights.
5. **Export video** (top right).

Shortcuts: `Space` play/pause · `←/→` nudge playhead (`Shift` = 1 s) · `Delete` remove selected · `Ctrl/⌘+Z` undo.

A sample story loads the first time so you can poke around; use **Project → New blank story** to start fresh.

## Voices: what ends up in the exported video

| Voice source | Preview in editor | In the exported video |
| --- | --- | --- |
| **ElevenLabs** (needs API key) | ✅ | ✅ |
| **Microphone** | ✅ | ✅ |
| **Computer voice** (browser speech) | ✅ | ❌ **silent** |

Browsers do not let a web page capture their built-in speech synthesis into a recording, so computer voices are for drafting only. They are drawn with a striped bar on the timeline and the export dialog warns you how many clips will be silent. For the final video, redo those lines with ElevenLabs or the microphone.

**ElevenLabs setup:** ⚙ Settings → paste your API key → *Test & save*. The key is kept in this browser's `localStorage` and only sent to `api.elevenlabs.io`. Generating audio uses your ElevenLabs credits. Don't do this on a shared computer. Generated audio is stored in the browser (IndexedDB) and embedded when you save a project file.

## Exporting

Export records the stage and the mixed audio **in real time**, so a 3-minute story takes 3 minutes and **the tab has to stay open and visible** while it records.

* Chrome/Edge (desktop) normally produce a ready-to-share **.mp4** (H.264 + AAC). The dialog tells you if your browser produced something else.
* If you get a **.webm**, it plays on computers and uploads to YouTube. For iPads/iPhones/TVs, convert it (needs [ffmpeg](https://ffmpeg.org)):

```bash
./scripts/to-mp4.sh my-story.webm
```

Choices are 720p or 1080p at 30 fps.

## Known limitations

* Real-time export (above); no faster-than-real-time render.
* The art is built in (6 characters, 14 props, 8 scenes, 4 music loops, 8 sound effects). There is no image/video import yet.
* Characters are single pieces with a flapping mouth and blinking; there is no limb rigging or frame-by-frame drawing.
* Playback preview of computer voices uses the browser's speech engine, so timing can drift slightly from the bars; the length of a clip comes from the last time you pressed "Hear it" (or an estimate).
* The ElevenLabs integration was tested against a mocked endpoint, **not** the live service, so the first real generation is worth a quick check.
* Projects live in this browser's storage; use *Project → Save file…* for backups.
* Sound is scheduled when you press Play, so changes you make to voices/music *while it is playing* are heard on the next play (pictures update immediately).
* Audio recordings of deleted clips stay in browser storage until you clear site data (they're small, and Undo needs them).

## Code map

```
src/model.ts        data model, easing, keyframe sampling (unit-tested in model.test.ts)
src/assets.ts       built-in characters/props (SVG) and backgrounds (canvas)
src/render.ts       draws a frame; shared by the editor preview and the exporter
src/audio.ts        synthesised music/SFX, mixer with ducking, browser TTS, ElevenLabs, mic
src/exporter.ts     canvas + audio -> MediaRecorder
src/store.ts        app state, undo/redo, autosave, editing actions
src/transport.ts    play / pause / seek
src/ui/             React UI: Stage, Timeline, Library, VoicePanel, Inspector, Dialogs
```
