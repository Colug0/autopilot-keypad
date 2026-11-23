# Autopilot keypad

A Signal K plotter extension that adds an autopilot keypad window to chart
plotters such as [Freeboard-SK](https://github.com/SignalK/freeboard-sk)
(3.5 and later).

- A mode bar as on a multifunction display: **S** Standby, **A** Heading
  hold, **ND** No Drift, **W** Wind, **N** Nav, and whatever else the pilot
  offers.
- The value that matters in each mode: the heading in standby, the target
  heading when holding a course, the apparent and target wind angle in wind
  mode, with a red (port) or green (starboard) marker instead of a sign.
- The rudder angle, when `steering.rudderAngle` is available.
- Keys laid out like a pilot keypad: `<10 <1 1> 10>` (port red, starboard
  green), **STBY**, **AUTO**, **WIND** and **MODE** for the rest. **DODGE**,
  **TACK** and **GYBE** appear when the pilot says it can do them.
- Optionally opens by itself when the pilot is engaged (MODE → *Open when
  engaged*, set per device).

It talks to the pilot through the Signal K Autopilot API, so it works with any pilot provider plugin (signalk-autopilot, pypilot, …):
it follows the API's default pilot.

## Use

1. Install the plugin and enable it.
2. In Freeboard-SK, press the keypad button in the map toolbar. The window can
   be moved and resized; Freeboard remembers where you put it.
3. Steering needs a user with write access to Signal K.

## Development

```
npm install
npm run build   # bundles src/ into public/
npm test
```

## License

Apache-2.0. See [NOTICE](NOTICE) for the parts taken from other projects.
