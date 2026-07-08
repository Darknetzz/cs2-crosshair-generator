# CS2 Crosshair Generator

A lightweight web app for designing Counter-Strike 2 crosshairs. Tweak every `cl_crosshair` setting, preview it live at true in-game size, load pro player presets, and copy console commands instantly.

![CS2 Crosshair Generator screenshot](docs/screenshot.png)

## Features

- **Live preview** — crosshair rendered at true 1:1 size (64×64 px at 1080p) with dynamic style animation
- **Background options** — solid colors (dark, light, black, white, checker) and CS2 map screenshots
- **Pro presets** — one-click crosshairs from donk, ZywOo, s1mple, NiKo, m0NESY, ropz, dev1ce, EliGE, XANTARES, and kyousuke
- **Full settings** — style, size, gap, thickness, color, outline, dynamic behavior, sniper options, and more
- **Console commands** — copy a ready-to-paste command block for the in-game console
- **Share links** — settings are encoded in the URL and saved to `localStorage`

## Usage

Open `index.html` in a browser, or serve the folder locally:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

1. Adjust settings in the right panel, or click a **Pro preset**
2. Pick a preview background to test visibility
3. Use **Auto / Dark / Light** in the header to change the page theme (saved automatically)
4. Click **Copy commands**
5. In CS2, press `` ` `` to open the console, paste, and press Enter

## Theme

The page defaults to **Auto**, which follows your system light/dark preference. Use the **Auto / Dark / Light** buttons in the header to override it. Your choice is saved in `localStorage` with your other settings.

## Project structure

```
├── index.html
├── css/style.css
├── js/
│   ├── app.js                 # UI, state, persistence
│   ├── backgrounds.js         # Preview background definitions
│   ├── commands.js            # Console command serialization
│   ├── crosshair-renderer.js  # Canvas preview renderer
│   ├── crosshair-settings.js  # Cvar definitions and defaults
│   └── presets.js             # Pro player crosshair presets
├── assets/maps/               # Map background images (WebP)
└── docs/screenshot.png
```

## Map backgrounds

Map screenshots are from the [ghostcap-gaming/cs2-map-images](https://github.com/ghostcap-gaming/cs2-map-images) community repository.

## License

No license specified. Map image rights belong to their respective contributors.
