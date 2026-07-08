# CS2 Crosshair Generator

A lightweight web app for designing Counter-Strike 2 crosshairs. Tweak every `cl_crosshair` setting, preview it live at true in-game size, load pro player presets, save custom presets, and copy console commands instantly.

![CS2 Crosshair Generator screenshot](docs/screenshot.png)

## Features

- **Live preview** — crosshair rendered at true 1:1 size (64×64 px at 1080p) with dynamic style animation
- **Preview modes** — normal, grenade lineup reticle, and sniper scope overlay
- **Background options** — solid colors (dark, light, black, white, checker) and CS2 map screenshots with thumbnails
- **Zoom** — scale the preview from 50% to 300%
- **Pro presets** — one-click crosshairs from donk, ZywOo, s1mple, NiKo, m0NESY, ropz, dev1ce, EliGE, XANTARES, and kyousuke
- **Custom presets** — save up to 20 of your own crosshairs, export/import as JSON
- **Full settings** — style, size, gap, thickness, color, outline, dynamic behavior, sniper options, grenade lineup, and more
- **Console commands** — copy all commands or only changed settings
- **Command import** — paste console commands back into the app and apply them
- **Share links** — delta-encoded settings in the URL, including preview background and mode
- **Themes** — auto (system), dark, or light page theme

## Usage

Open `index.html` in a browser, or serve the folder locally:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

1. Adjust settings in the right panel, or click a **Pro preset**
2. Pick a preview background and mode (Normal, Lineup, or Sniper) to test visibility
3. Use **Auto / Dark / Light** in the header to change the page theme (saved automatically)
4. Click **Copy commands** (or **Copy changed only** for a minimal export)
5. To import: paste commands into the textarea and click **Apply pasted**
6. In CS2, press `` ` `` to open the console, paste, and press Enter

## Theme

The page defaults to **Auto**, which follows your system light/dark preference. Use the **Auto / Dark / Light** buttons in the header to override it. Your choice is saved in `localStorage` with your other settings.

## Project structure

```
├── index.html
├── css/style.css
├── js/
│   ├── app.js                 # UI, state, persistence
│   ├── backgrounds.js         # Preview background definitions
│   ├── commands.js            # Console command serialization & import
│   ├── crosshair-renderer.js  # Canvas preview renderer
│   ├── crosshair-settings.js  # Cvar definitions and defaults
│   ├── custom-presets.js      # User-saved presets (localStorage)
│   ├── preview-mode.js        # Normal / lineup / sniper preview modes
│   ├── preview-zoom.js        # Display zoom (50%–300%)
│   └── presets.js             # Pro player crosshair presets
├── assets/maps/               # Map background images (WebP)
└── docs/screenshot.png
```

## Map backgrounds

Map screenshots are from the [ghostcap-gaming/cs2-map-images](https://github.com/ghostcap-gaming/cs2-map-images) community repository.

## License

MIT License. Map image rights belong to their respective contributors.
