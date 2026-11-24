/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// What the keypad shows and sends, worked out from the pilot as the Signal K
// Autopilot API describes it. No DOM and no network here, so it can be tested.

export const API = '/signalk/v2/api/vessels/self/autopilots';

// How a pilot mode is named on the display and in the mode menu. A pilot
// names its modes either as states (signalk-autopilot: auto, wind, route) or
// as modes of a single engaged state (pypilot: compass, gps, wind).
const NAMES = {
  standby: { letter: 'S', name: 'Standby' },
  auto: { letter: 'A', name: 'Heading hold' },
  compass: { letter: 'A', name: 'Heading hold' },
  heading: { letter: 'A', name: 'Heading hold' },
  noDrift: { letter: 'ND', name: 'No Drift' },
  wind: { letter: 'W', name: 'Wind' },
  'true wind': { letter: 'TW', name: 'True wind' },
  gps: { letter: 'G', name: 'GPS course' },
  route: { letter: 'N', name: 'Nav' },
  nav: { letter: 'N', name: 'Nav' },
  track: { letter: 'N', name: 'Nav' },
  dodge: { letter: 'D', name: 'Dodge' },
  'off-line': { letter: '', name: 'Off-line' }
};

// The state the API gives a pilot it cannot reach.
export const OFFLINE = 'off-line';

function reachable(info) {
  return !!info && info.state !== OFFLINE;
}

const HEADING_KEYS = ['auto', 'compass', 'heading'];
const WIND_KEYS = ['wind'];

export const ALARMS = ['waypointAdvance', 'waypointArrival', 'routeComplete', 'xte', 'heading', 'wind'];

export function nameOf(key) {
  if (NAMES[key]) {
    return NAMES[key];
  }
  const text = String(key);
  return { letter: text.charAt(0).toUpperCase(), name: text };
}

function engagedStates(info) {
  const states = (info && info.options && Array.isArray(info.options.states)) ? info.options.states : [];
  return states.filter((s) => s && s.engaged).map((s) => s.name);
}

function allStates(info) {
  const states = (info && info.options && Array.isArray(info.options.states)) ? info.options.states : [];
  return states.map((s) => s && s.name).filter((s) => typeof s === 'string');
}

function modesOf(info) {
  const modes = info && info.options && Array.isArray(info.options.modes) ? info.options.modes : [];
  return modes.filter((m) => typeof m === 'string' && m !== 'dodge');
}

// A pilot with several engaged states names its modes as states.
export function modesAreStates(info) {
  return engagedStates(info).length > 1;
}

// The choices for the mode menu: what the pilot can steer by, standby left out.
export function choices(info) {
  return modesAreStates(info) ? engagedStates(info) : modesOf(info);
}

// What the display shows as the mode: undefined when there is no pilot.
export function modeKey(info) {
  if (!info) {
    return undefined;
  }
  if (info.state === OFFLINE) {
    return OFFLINE;
  }
  if (info.mode === 'dodge') {
    return 'dodge';
  }
  if (!info.engaged) {
    return info.state === null && info.mode === null ? undefined : 'standby';
  }
  if (modesAreStates(info)) {
    return info.state || undefined;
  }
  return info.mode || info.state || undefined;
}

function first(list, keys) {
  return keys.find((k) => list.includes(k));
}

function put(path, value, units) {
  const body = units ? { value, units } : { value };
  return { method: 'PUT', path, body };
}

function post(path) {
  return { method: 'POST', path };
}

// Choosing a mode engages the pilot in it, as on a pilot keypad.
function steerBy(info, key) {
  if (modesAreStates(info)) {
    return [put('state', key)];
  }
  const requests = [put('mode', key)];
  if (!info.engaged) {
    requests.push(post('engage'));
  }
  return requests;
}

// The mode a key selects, or undefined when the pilot has none for it.
export function keyMode(info, key) {
  if (!reachable(info)) {
    return undefined;
  }
  const list = choices(info);
  if (key === 'auto') {
    return first(list, HEADING_KEYS) || (modesAreStates(info) ? undefined : list[0]);
  }
  if (key === 'wind') {
    return first(list, WIND_KEYS);
  }
  return undefined;
}

function actionAvailable(info, id) {
  if (!reachable(info)) {
    return false;
  }
  if (info && Array.isArray(info.availableActions)) {
    return info.availableActions.includes(id);
  }
  const actions = info && info.options && Array.isArray(info.options.actions) ? info.options.actions : [];
  return actions.some((a) => a && a.id === id && a.available);
}

export function available(info) {
  return {
    auto: keyMode(info, 'auto') !== undefined || (reachable(info) && choices(info).length === 0),
    wind: keyMode(info, 'wind') !== undefined,
    dodge: actionAvailable(info, 'dodge'),
    tack: actionAvailable(info, 'tack'),
    gybe: actionAvailable(info, 'gybe'),
    nextPoint: actionAvailable(info, 'courseNextPoint')
  };
}

// The requests a key sends, as paths below the pilot. An empty list means the
// pilot cannot do it.
export function requestsFor(info, cmd) {
  if (!reachable(info)) {
    return [];
  }
  if (cmd === 'standby') {
    if (info.mode === 'dodge') {
      return [{ method: 'DELETE', path: 'dodge' }, ...requestsFor({ ...info, mode: null }, 'standby')];
    }
    return allStates(info).includes('standby') ? [put('state', 'standby')] : [post('disengage')];
  }
  if (cmd === 'auto' || cmd === 'wind') {
    const key = keyMode(info, cmd);
    if (key !== undefined) {
      return steerBy(info, key);
    }
    return cmd === 'auto' && choices(info).length === 0 && !info.engaged ? [post('engage')] : [];
  }
  if (cmd.startsWith('mode:')) {
    return steerBy(info, cmd.substring(5));
  }
  if (cmd === 'dodge') {
    return info.mode === 'dodge' ? [{ method: 'DELETE', path: 'dodge' }] : [post('dodge')];
  }
  if (cmd === 'nextPoint') {
    return [post('courseNextPoint')];
  }
  const turn = /^(tack|gybe):(port|starboard)$/.exec(cmd);
  if (turn) {
    return [post(turn[1] + '/' + turn[2])];
  }
  const step = Number(cmd);
  if (Number.isFinite(step) && step !== 0) {
    // + turns the boat to starboard in every mode; the pilot provider knows
    // what that means for a wind angle.
    return info.mode === 'dodge'
      ? [put('dodge', step, 'deg')]
      : [put('target/adjust', step, 'deg')];
  }
  return [];
}

// The modes that follow a route or a destination.
const NAV_MODES = ['route', 'nav', 'track'];

export function isNavMode(key) {
  return NAV_MODES.includes(key);
}

export function degrees(radians) {
  return (radians * 180) / Math.PI;
}

export function headingText(radians) {
  const d = ((Math.round(degrees(radians)) % 360) + 360) % 360;
  return String(d).padStart(3, '0');
}

// A wind angle as degrees off the bow and the side it is on. Some sources
// write an angle from port as 180..360 degrees.
export function windSide(radians) {
  let d = Math.round(degrees(radians));
  d = ((d % 360) + 360) % 360;
  if (d > 180) {
    d -= 360;
  }
  return { degrees: Math.abs(d), side: d < 0 ? 'port' : d > 0 ? 'stbd' : '' };
}

// The value blocks for a mode. `value(path)` gives a current Signal K value or
// undefined; `target` is the Autopilot API's target, whose meaning depends on
// the mode and which says nothing about true or magnetic.
export function valuesFor(key, value, target) {
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const heading = (truePath, magneticPath) => {
    if (num(value(truePath))) {
      return { text: headingText(value(truePath)), unit: '°T' };
    }
    if (num(value(magneticPath))) {
      return { text: headingText(value(magneticPath)), unit: '°M' };
    }
    return undefined;
  };
  const wind = (label, radians) => (num(radians)
    ? { label, kind: 'wind', ...windSide(radians) }
    : { label, kind: 'wind', degrees: undefined, side: '' });

  if (key === 'wind' || key === 'true wind') {
    const apparent = key === 'wind';
    const own = value(apparent ? 'steering.autopilot.target.windAngleApparent' : 'steering.autopilot.target.windAngleTrue');
    return [
      wind(apparent ? 'Wind' : 'True wind',
        value(apparent ? 'environment.wind.angleApparent' : 'environment.wind.angleTrueWater')),
      wind('Target', num(target) ? target : own)
    ];
  }
  const h = heading('navigation.headingTrue', 'navigation.headingMagnetic');
  const current = { label: 'Heading', kind: 'heading', text: h ? h.text : '---', unit: h ? h.unit : '°' };
  if (key === 'standby' || key === undefined || key === 'dodge') {
    return [current];
  }
  const label = key === 'noDrift' ? 'Bearing' : 'Target';
  if (num(target)) {
    // The pilot's own target paths may come from another device; they only
    // tell whether the API's target is true or magnetic when they agree.
    const unit = same(value('steering.autopilot.target.headingTrue'), target) ? '°T'
      : same(value('steering.autopilot.target.headingMagnetic'), target) ? '°M' : '°';
    return [current, { label, kind: 'heading', text: headingText(target), unit }];
  }
  const own = heading('steering.autopilot.target.headingTrue', 'steering.autopilot.target.headingMagnetic');
  return [current, { label, kind: 'heading', text: own ? own.text : '---', unit: own ? own.unit : '°' }];
}

// The rudder as words and as a share of full helm (35°) to one side.
export function rudderView(radians) {
  if (typeof radians !== 'number' || !Number.isFinite(radians)) {
    return undefined;
  }
  const d = Math.round(degrees(radians));
  const side = d > 0 ? 'stbd' : d < 0 ? 'port' : '';
  return {
    text: 'Rudder ' + Math.abs(d) + '°' + (side ? (side === 'stbd' ? ' stb' : ' port') : ''),
    side,
    share: Math.min(Math.abs(degrees(radians)), 35) / 35
  };
}

// Two angles within half a degree of each other.
function same(a, b) {
  if (typeof a !== 'number' || typeof b !== 'number') {
    return false;
  }
  const d = Math.abs(((degrees(a - b) % 360) + 540) % 360 - 180);
  return d < 0.5;
}

// The pilot to follow: the API's default device, or the first one.
export function pickPilot(devices) {
  const ids = devices ? Object.keys(devices) : [];
  return ids.find((id) => devices[id] && devices[id].isDefault) || ids[0] || null;
}

// The wording for a failed request.
export function failureText(status, message) {
  if (status === 401 || status === 403) {
    return 'Log in to Signal K to steer';
  }
  return (message || 'Command failed') + (status ? ' [' + status + ']' : '');
}

// The webapp's night mode setting: auto follows the server's environment.mode.
export function isNight(mode, environmentMode) {
  return mode === 'night' || (mode === 'auto' && environmentMode === 'night');
}
