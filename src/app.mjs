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

// The keypad as a webapp of its own: its own connection to Signal K, the
// pilot's name in its own header, night mode from the server's
// environment.mode or set by hand, and the screen kept on.

import { startKeypad } from './ui.mjs';
import { Stream } from './stream.mjs';
import { nextNightMode, isNight } from './model.mjs';

const STORE = 'autopilot-keypad.';

// Settings stay in this browser; a browser that keeps nothing still works.
function load(key, fallback) {
  try {
    const value = window.localStorage.getItem(STORE + key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    window.localStorage.setItem(STORE + key, JSON.stringify(value));
  } catch {
    // Kept for this visit only.
  }
}

// The header icons are SVG elements, which have no `hidden` property.
function show(element, visible) {
  element.toggleAttribute('hidden', !visible);
}

const el = {};
['title', 'login', 'nightIcon', 'wakeIcon'].forEach((id) => {
  el[id] = document.getElementById(id);
});

const stream = new Stream();
let nightMode = load('nightMode', 'auto');
let keepOn = load('keepOn', true);
let environmentMode = null;
let wakeLock = null;

function applyNight() {
  const night = isNight(nightMode, environmentMode);
  document.documentElement.classList.toggle('night', night);
  show(el.nightIcon, night);
}

// The screen stays on while the page is shown; the browser lets go of the
// lock whenever the page is hidden, so it is taken again on return. Calls run
// one after the other, so that two of them never ask for two locks.
let wakeQueue = Promise.resolve();

function applyWakeLock() {
  wakeQueue = wakeQueue.then(updateWakeLock, updateWakeLock);
  return wakeQueue;
}

async function updateWakeLock() {
  if (keepOn && document.visibilityState === 'visible' && 'wakeLock' in navigator) {
    if (wakeLock === null) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
          show(el.wakeIcon, false);
        });
      } catch {
        wakeLock = null;
      }
    }
  } else if (wakeLock !== null) {
    const lock = wakeLock;
    wakeLock = null;
    await lock.release().catch(() => {});
  }
  show(el.wakeIcon, wakeLock !== null);
}

const NIGHT_TEXT = { auto: 'Auto', day: 'Day', night: 'Night' };

const keypad = startKeypad(document.getElementById('keypad'), {
  subscribe: (paths, handler) => stream.subscribe(paths, handler),
  setTitle: (title) => {
    el.title.textContent = title;
    document.title = title;
  },
  onRender: (pilot) => {
    el.login.hidden = pilot.status !== 'login';
  },
  options: [
    {
      id: 'night',
      label: 'Night mode',
      value: () => NIGHT_TEXT[nightMode],
      on: () => nightMode !== 'day',
      toggle: () => {
        nightMode = nextNightMode(nightMode);
        save('nightMode', nightMode);
        applyNight();
      }
    },
    {
      id: 'keepOn',
      label: 'Keep screen on',
      value: () => ('wakeLock' in navigator ? (keepOn ? 'On' : 'Off') : 'Not available'),
      on: () => keepOn && 'wakeLock' in navigator,
      toggle: async () => {
        keepOn = !keepOn;
        save('keepOn', keepOn);
        await applyWakeLock();
      }
    }
  ]
});

stream.subscribe(['environment.mode'], (ev) => {
  environmentMode = ev.value;
  applyNight();
});
document.addEventListener('visibilitychange', applyWakeLock);
applyNight();
applyWakeLock();
keypad.start();
