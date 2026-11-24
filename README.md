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
- While the server knows a course (Signal K Course API): the next point and
  where it is in the route, the cross track error as a highway and a number,
  and distance, time to go and arrival. A tap on that row switches between
  the next point and the end of the route. In a mode that follows a route the
  bearing to the next point (CTS) takes the place of the target, and **NEXT
  WPT** appears when the pilot can skip to the next point.
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

**Settings** are under MODE → *Settings*, kept for each device:

- *Show navigation*: on or off.
- *XTE limit*: the cross track error at the edge of the highway (0.1 nm to
  start with).
- *Speed for TTG and ETA*: the average speed over ground of the last minutes
  (15 to start with), a fixed speed, or any Signal K path in m/s.

Distance and time to the end of the route need the server's course
calculations (`navigation.course.calcValues.route.distance`, from
@signalk/course-provider).

**Webapp:** open *Autopilot keypad* in the server's webapps, or go to
`/autopilot-keypad/`. On a wide screen the keys stand beside the display. Its
settings, kept in the browser, also have:

- *Night mode*: Auto (follows the server's `environment.mode`), Day or Night.
- *Keep screen on*: keeps the screen from going dark while the page is shown,
  where the browser allows it.

The page can be added to a tablet's home screen.

**Freeboard-SK:** press the keypad button in the map toolbar. The window can be
moved and resized; Freeboard remembers where you put it. It follows
Freeboard's night mode, and its settings have *Open when engaged*, which opens
the window by itself when the pilot is engaged.

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
