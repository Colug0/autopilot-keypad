# Autopilot keypad

An autopilot keypad for Signal K, in two forms with the same look and the same
keys:

- a **webapp** of its own, for a tablet or phone at the helm;
- a **plotter extension**: a window in chart plotters such as
  [Freeboard-SK](https://github.com/SignalK/freeboard-sk) (3.5 and later).

What it shows and does:

- A mode bar as on a multifunction display: **S** Standby, **A** Heading
  hold, **ND** No Drift, **W** Wind, **N** Nav, and whatever else the pilot
  offers.
- The value that matters in each mode: the heading in standby, the heading and
  the target when holding a course, the apparent and target wind angle in wind
  mode, with a red (port) or green (starboard) marker instead of a sign.
- The rudder angle, when `steering.rudderAngle` is available.
- Keys laid out like a pilot keypad: `<10 <1 1> 10>` with red (port) and green
  (starboard) arrows, a red **STBY**, **AUTO**, **WIND** and **MODE** for the
  rest. **DODGE**, **TACK** and **GYBE** appear when the pilot says it can do
  them.

It talks to the pilot through the Signal K Autopilot API, so it works with any
pilot provider plugin (signalk-autopilot, pypilot, …): it follows the API's
default pilot.

## Use

1. Install the plugin and enable it.
2. Steering needs a user with write access to Signal K.

**Webapp:** open *Autopilot keypad* in the server's webapps, or go to
`/autopilot-keypad/`. On a wide screen the keys stand beside the display. The
mode menu has two settings, kept in the browser:

- *Night mode*: Auto (follows the server's `environment.mode`), Day or Night.
- *Keep screen on*: keeps the screen from going dark while the page is shown,
  where the browser allows it.

The page can be added to a tablet's home screen.

**Freeboard-SK:** press the keypad button in the map toolbar. The window can be
moved and resized; Freeboard remembers where you put it. It follows
Freeboard's night mode. In the mode menu, *Open when engaged* opens the window
by itself when the pilot is engaged (set per device).

## Development

```
npm install
npm run build   # bundles src/ into public/
npm test
```

The icons in `public/` are drawn from `assets/icon.svg` by
`scripts/render-icons.ps1` (Windows).

## License

Apache-2.0. See [NOTICE](NOTICE) for the parts taken from other projects.
