# Changelog

## [0.4.0](https://github.com/Colug0/autopilot-keypad/compare/v0.3.1...v0.4.0) (2026-11-24)


### Features

* a third key to choose, and the waypoint list ([20118b8](https://github.com/Colug0/autopilot-keypad/commit/20118b832a022da884bd8d9ab5d09a2de0b93ae3))
* app icon ([e3ff8e6](https://github.com/Colug0/autopilot-keypad/commit/e3ff8e672c74ec7b1ba2a6c15ea6ba005b225f38))
* autopilot keypad as a plotter extension ([1dcf0fe](https://github.com/Colug0/autopilot-keypad/commit/1dcf0feda7c3ed65b39be5ff2521c56927e5e3ef))
* grey step keys with coloured arrows, a red STBY key ([e9dcd91](https://github.com/Colug0/autopilot-keypad/commit/e9dcd910cddb54479c73f5fc30e32772e20d126b))
* navigation block and a settings menu ([bc3e4e6](https://github.com/Colug0/autopilot-keypad/commit/bc3e4e6353efd3dab61c9846d2c99c8eccbca9a0))
* NEXT WPT whenever a route is active ([e129ebd](https://github.com/Colug0/autopilot-keypad/commit/e129ebdd8e982a4c053fc1b3df9a8a5dc4ff8935))
* the keypad as a webapp of its own ([edd4ee6](https://github.com/Colug0/autopilot-keypad/commit/edd4ee6a9fdb3e179f0b76b857df3aee59cf2eba))


### Bug Fixes

* course values for the right destination, settings saved safely ([1c538c8](https://github.com/Colug0/autopilot-keypad/commit/1c538c8ef19217f8d22a50c3a375b27b3042cad0))
* one NEXT WPT at a time ([83670f6](https://github.com/Colug0/autopilot-keypad/commit/83670f6c6d3c3292b70062864e2f0d6c6326be33))
* room for the values beside the navigation block ([d5f92e5](https://github.com/Colug0/autopilot-keypad/commit/d5f92e5297abd616f4016eb1ce0195c19f649c0f))
* speed path changes one after the other ([da91b6d](https://github.com/Colug0/autopilot-keypad/commit/da91b6d150fdc4332bcd32ca7f8c21444040debd))
* STBY cancels pending keys even when it cannot be sent ([ef4841c](https://github.com/Colug0/autopilot-keypad/commit/ef4841cf04700096a75791a7be85b52c47a7264b))
* STBY goes out at once, an unreachable pilot shows off-line ([d9f25a8](https://github.com/Colug0/autopilot-keypad/commit/d9f25a828b043bc7de6413d4efa85c3bc4c730cc))
* the app icon where the server looks for it ([96a92fd](https://github.com/Colug0/autopilot-keypad/commit/96a92fd29bda47c81e95b7d6c1e2dc5b83cae9ff))
* the waypoint list for the route in use, the third key as it works ([38e7e22](https://github.com/Colug0/autopilot-keypad/commit/38e7e22a2be16478611f9ced6599a0f711b902df))

## 0.3.1 (2026-11-24)

### Bug Fixes

* the app icon where the server looks for it (it showed none)
* room for the values beside the navigation block in the plotter window

## 0.3.0 (2026-11-24)

### Features

* the key beside AUTO steers by a mode chosen in the settings (Wind to start with, or Nav, No Drift and so on)
* a long press on NEXT WPT opens the waypoint list: the points ahead with distance along the route, time to go and arrival, and PREV WPT and NEXT WPT

## 0.2.1 (2026-11-24)

### Features

* NEXT WPT whenever a route is active; in a mode that follows the route it asks the pilot, otherwise the server's course goes on

## 0.2.0 (2026-11-24)

### Features

* the keypad as a webapp of its own, at `/autopilot-keypad/`, with night mode and keep screen on
* a navigation block while the server knows a course: next point, cross track error as a highway, distance, time to go and arrival, to the next point or the end of the route
* a settings menu under MODE: show navigation, XTE limit, the speed for times to go (average SOG, fixed or a Signal K path)
* grey step keys with red and green arrows, a red STBY key, and an app icon

## 0.1.0 (2026-11-24)

### Features

* the autopilot keypad as a window in Freeboard-SK (plotter extension), for any pilot of the Signal K Autopilot API
