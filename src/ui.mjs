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

// The keypad itself: a mode display above keys laid out like a pilot keypad,
// with the course the server knows below the values. It is the same in the
// plotter window and in the webapp; what differs comes in as the `host`:
//   subscribe(paths, handler)  Signal K values, as { path, value, $source };
//                              resolves to a function that ends it
//   setTitle(title)            names the pilot (may return a promise)
//   store                      { load(key, fallback), save(key, value) } for
//                              this device's settings (may return promises)
//   settings                   the host's own settings, as below
//   onRender(pilot)            optional, called after every render
// A setting is { id, label, type: 'choice' | 'number' | 'text', get(), set(value) }
// with `choices: [{ value, text }]` for a choice (a tap steps to the next),
// `unit`, `min` and `step` for a number, and an optional `visible()`.
// Adapted from the keypad design of signalk-autopilot's webapp.

import {
  ALARMS, OFFLINE, available, choices, headingText, isNavMode, modeKey, nameOf, requestsFor, rudderView, valuesFor
} from './model.mjs';
import { highwayPosition, navView } from './nav.mjs';
import { Pilot } from './pilot.mjs';
import { Course } from './course.mjs';

const VALUE_TIMEOUT = 5000;
const POLL = 2000;

const PATHS = [
  'navigation.headingTrue',
  'navigation.headingMagnetic',
  'environment.wind.angleApparent',
  'environment.wind.angleTrueWater',
  'steering.rudderAngle',
  'steering.autopilot.target.headingTrue',
  'steering.autopilot.target.headingMagnetic',
  'steering.autopilot.target.windAngleApparent',
  'steering.autopilot.target.windAngleTrue'
];

// The settings every keypad has, with what they start as.
const DEFAULTS = {
  showNav: true,
  xteLimit: 0.1,
  speedSource: 'average',
  speedMinutes: 15,
  speedKnots: 5,
  speedPath: 'navigation.speedOverGround',
  navTarget: 'wpt'
};

const MARKUP = `
  <section class="display">
    <div class="modebar offline" id="modebar">
      <span class="letter" id="modeLetter"></span>
      <span class="name" id="modeName">No pilot</span>
    </div>
    <div class="alarm" id="alarm" role="alert"><span id="alarmText"></span></div>
    <div class="info" id="info" role="status" aria-live="polite"></div>
    <div class="values" id="values"></div>
    <div class="nav" id="nav" hidden>
      <div class="wp"><span id="navPoint"></span><span id="navCount"></span></div>
      <svg class="highway" viewBox="0 0 240 24" preserveAspectRatio="none" role="img" id="navHighway">
        <line x1="120" y1="0" x2="120" y2="24" class="track"/>
        <line x1="12" y1="0" x2="12" y2="24" class="limit"/>
        <line x1="228" y1="0" x2="228" y2="24" class="limit"/>
        <polygon points="-5,19 0,6 5,19" class="boat" id="navBoat" transform="translate(120 0)"/>
      </svg>
      <button class="row" type="button" data-cmd="navTarget" id="navRow" aria-label="Waypoint or end of route">
        <span><span class="label">XTE</span><span class="v" id="navXte"></span></span>
        <span><span class="label" id="navDistanceLabel">DTW</span><span class="v" id="navDistance"></span></span>
        <span><span class="label">TTG</span><span class="v" id="navTtg"></span></span>
        <span><span class="label">ETA</span><span class="v" id="navEta"></span></span>
      </button>
    </div>
    <div class="rudder" id="rudder" hidden>
      <div id="rudderText"></div>
      <div class="track"><div class="bar" id="rudderBar"></div><div class="mid"></div></div>
    </div>
    <div class="menu" id="menu">
      <button class="back" type="button" data-cmd="back">&lsaquo; Back</button>
      <div id="menuModes" style="display: contents">
        <button class="option" type="button" data-cmd="settings">Settings<span class="switch">&rsaquo;</span></button>
        <div id="menuItems" style="display: contents"></div>
      </div>
      <div id="menuSettings" style="display: none"></div>
    </div>
  </section>
  <section class="keys">
    <button class="key step" type="button" data-cmd="-10" aria-label="10 degrees to port"><span class="p">&lt;</span>10</button>
    <button class="key step" type="button" data-cmd="-1" aria-label="1 degree to port"><span class="p">&lt;</span>1</button>
    <button class="key step" type="button" data-cmd="+1" aria-label="1 degree to starboard">1<span class="s">&gt;</span></button>
    <button class="key step" type="button" data-cmd="+10" aria-label="10 degrees to starboard">10<span class="s">&gt;</span></button>
    <button class="key stby" type="button" data-cmd="standby" id="keyStby">STBY</button>
    <button class="key" type="button" data-cmd="auto" id="keyAuto">AUTO</button>
    <button class="key" type="button" data-cmd="wind" id="keyWind">WIND</button>
    <button class="key" type="button" data-cmd="menu">MODE</button>
    <button class="key half" type="button" data-cmd="tack:port" id="keyTackPort" hidden><span class="p">&lt;</span>&nbsp;TACK</button>
    <button class="key half" type="button" data-cmd="tack:starboard" id="keyTackStbd" hidden>TACK&nbsp;<span class="s">&gt;</span></button>
    <button class="key half" type="button" data-cmd="gybe:port" id="keyGybePort" hidden><span class="p">&lt;</span>&nbsp;GYBE</button>
    <button class="key half" type="button" data-cmd="gybe:starboard" id="keyGybeStbd" hidden>GYBE&nbsp;<span class="s">&gt;</span></button>
    <button class="key wide" type="button" data-cmd="dodge" id="keyDodge" hidden>DODGE</button>
    <button class="key wide" type="button" data-cmd="nextPoint" id="keyNext" hidden>NEXT WPT &rsaquo;</button>
  </section>`;

const IDS = ['modebar', 'modeLetter', 'modeName', 'alarm', 'alarmText', 'info', 'values', 'nav', 'navPoint',
  'navCount', 'navBoat', 'navXte', 'navDistanceLabel', 'navDistance', 'navTtg', 'navEta', 'rudder', 'rudderText',
  'rudderBar', 'menu', 'menuModes', 'menuItems', 'menuSettings', 'keyStby', 'keyAuto', 'keyWind', 'keyDodge',
  'keyNext', 'keyTackPort', 'keyTackStbd', 'keyGybePort', 'keyGybeStbd'];

const STATUS_TEXT = { searching: 'Looking for pilot', none: 'No pilot', login: 'Log in to Signal K', error: 'No pilot' };

const ON_OFF = [{ value: true, text: 'On' }, { value: false, text: 'Off' }];

export function startKeypad(root, host) {
  const values = {};
  const alarms = {};
  const el = {};
  const prefs = { ...DEFAULTS };
  let infoTimeout = null;
  let busy = false;
  // Raised by STBY: what other keys still have to send is no longer wanted.
  let generation = 0;
  // STBY requests still on their way; other keys wait for them.
  let standbyPending = 0;
  let pilot = null;
  let course = null;

  root.innerHTML = MARKUP;
  IDS.forEach((id) => {
    el[id] = root.querySelector('#' + id);
  });

  function current(path) {
    const v = values[path];
    if (!v || Date.now() - v.time > VALUE_TIMEOUT) {
      return undefined;
    }
    return v.value;
  }

  // ---- settings ----

  function setPref(key, value) {
    prefs[key] = value;
    if (key.startsWith('speed') && course) {
      course.setSpeed(speedSetting()).catch(() => {});
    }
    return Promise.resolve(host.store.save(key, value));
  }

  function speedSetting() {
    return { source: prefs.speedSource, minutes: prefs.speedMinutes, knots: prefs.speedKnots, path: prefs.speedPath };
  }

  const pref = (key) => ({ get: () => prefs[key], set: (v) => setPref(key, v) });

  const SETTINGS = [
    ...(host.settings || []),
    { id: 'showNav', label: 'Show navigation', type: 'choice', choices: ON_OFF, ...pref('showNav') },
    { id: 'xteLimit', label: 'XTE limit', type: 'number', unit: 'nm', min: 0.01, step: 0.01, ...pref('xteLimit') },
    {
      id: 'speedSource',
      label: 'Speed for TTG and ETA',
      type: 'choice',
      choices: [{ value: 'average', text: 'Average SOG' }, { value: 'fixed', text: 'Fixed' }, { value: 'path', text: 'Signal K path' }],
      ...pref('speedSource')
    },
    {
      id: 'speedMinutes', label: 'Average over', type: 'number', unit: 'min', min: 1, step: 1,
      visible: () => prefs.speedSource === 'average', ...pref('speedMinutes')
    },
    {
      id: 'speedKnots', label: 'Speed', type: 'number', unit: 'kn', min: 0.1, step: 0.1,
      visible: () => prefs.speedSource === 'fixed', ...pref('speedKnots')
    },
    {
      id: 'speedPath', label: 'Path (m/s)', type: 'text',
      visible: () => prefs.speedSource === 'path', ...pref('speedPath')
    }
  ];

  function settingRow(s) {
    const row = document.createElement(s.type === 'choice' ? 'button' : 'label');
    row.className = 'option';
    row.dataset.setting = s.id;
    if (s.type === 'choice') {
      row.type = 'button';
      row.dataset.cmd = 'setting:' + s.id;
    }
    const label = document.createElement('span');
    label.textContent = s.label;
    row.appendChild(label);
    if (s.type === 'choice') {
      const state = document.createElement('span');
      state.className = 'switch';
      row.appendChild(state);
    } else {
      const input = document.createElement('input');
      input.className = 'field' + (s.type === 'text' ? ' text' : '');
      input.type = s.type === 'number' ? 'number' : 'text';
      if (s.type === 'number') {
        input.min = String(s.min);
        input.step = String(s.step);
        input.inputMode = 'decimal';
      } else {
        input.spellcheck = false;
        input.autocapitalize = 'off';
      }
      input.addEventListener('change', () => changeSetting(s, input));
      row.appendChild(input);
      if (s.unit) {
        const unit = document.createElement('span');
        unit.className = 'unitText';
        unit.textContent = s.unit;
        row.appendChild(unit);
      }
    }
    return row;
  }

  async function changeSetting(s, input) {
    let value = input.value.trim();
    if (s.type === 'number') {
      value = Number(value);
      if (!Number.isFinite(value) || value < s.min) {
        showInfo(s.label + ': at least ' + s.min);
        input.value = String(s.get());
        return;
      }
    } else if (!/^[A-Za-z0-9_.]+$/.test(value)) {
      showInfo('Enter a Signal K path, such as navigation.speedOverGround');
      input.value = s.get();
      return;
    }
    await Promise.resolve(s.set(value)).catch(() => showInfo('Could not save the setting'));
    render();
  }

  function renderSettings() {
    if (el.menuSettings.children.length !== SETTINGS.length) {
      el.menuSettings.replaceChildren(...SETTINGS.map(settingRow));
    }
    SETTINGS.forEach((s, i) => {
      const row = el.menuSettings.children[i];
      row.hidden = s.visible ? !s.visible() : false;
      if (s.type === 'choice') {
        const choice = s.choices.find((c) => c.value === s.get()) || s.choices[0];
        row.classList.toggle('on', choice.value !== false && choice.value !== 'off');
        row.lastChild.textContent = choice.text;
      } else {
        const input = row.querySelector('input');
        if (document.activeElement !== input) {
          input.value = String(s.get());
        }
      }
    });
  }

  async function stepChoice(id) {
    const s = SETTINGS.find((x) => x.id === id);
    if (!s) {
      return;
    }
    const i = s.choices.findIndex((c) => c.value === s.get());
    await Promise.resolve(s.set(s.choices[(i + 1) % s.choices.length].value))
      .catch(() => showInfo('Could not change the setting'));
    render();
  }

  // ---- display ----

  function valueBlock(block) {
    const div = document.createElement('div');
    div.className = 'val';
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = block.label;
    const num = document.createElement('div');
    num.className = 'num';
    const n = document.createElement('span');
    if (block.kind === 'wind') {
      if (block.side) {
        num.appendChild(triangle(block.side));
      }
      n.textContent = (block.degrees === undefined ? '--' : String(block.degrees)) + '°';
      num.appendChild(n);
    } else {
      // 149° with a small T or M for true or magnetic.
      n.textContent = block.text + '°';
      num.appendChild(n);
      const ref = block.unit.replace('°', '');
      if (ref) {
        const u = document.createElement('span');
        u.className = 'unit';
        u.textContent = ref;
        num.appendChild(u);
      }
    }
    div.append(label, num);
    return div;
  }

  function triangle(side) {
    const tri = document.createElement('span');
    tri.className = 'tri ' + side;
    tri.setAttribute('role', 'img');
    tri.setAttribute('aria-label', side === 'port' ? 'port' : 'starboard');
    return tri;
  }

  // In a mode that follows a course, the bearing to the next point is what
  // the pilot steers for.
  function blocksFor(key, info) {
    const blocks = valuesFor(key, current, info ? info.target : undefined);
    if (isNavMode(key) && course && course.active) {
      const t = course.current('bearingTrue');
      const m = course.current('bearingMagnetic');
      const cts = typeof t === 'number' ? { text: headingText(t), unit: '°T' }
        : typeof m === 'number' ? { text: headingText(m), unit: '°M' } : null;
      if (cts) {
        blocks[blocks.length - 1] = { label: 'CTS', kind: 'heading', ...cts };
      }
    }
    return blocks;
  }

  function renderNav() {
    const show = prefs.showNav && course && course.active;
    el.nav.hidden = !show;
    if (!show) {
      return;
    }
    const c = {
      crossTrackError: course.current('crossTrackError'),
      distance: course.current('distance'),
      routeDistance: course.current('routeDistance')
    };
    const view = navView(c, course.speed(), prefs.navTarget);
    el.navPoint.textContent = '→ ' + (view.target === 'end'
      ? 'End of ' + ((course.activeRoute && course.activeRoute.name) || 'route')
      : course.name);
    el.navCount.textContent = course.pointCount;
    el.navXte.replaceChildren(...(view.xte.side ? [triangle(view.xte.side)] : []),
      document.createTextNode(view.xte.text), unitSpan(view.xte.unit));
    el.navDistanceLabel.textContent = view.distanceLabel;
    el.navDistance.replaceChildren(document.createTextNode(view.distance.text), unitSpan(view.distance.unit));
    el.navTtg.textContent = view.ttg;
    el.navEta.textContent = view.eta;
    const x = 120 + highwayPosition(c.crossTrackError, prefs.xteLimit) * 108;
    el.navBoat.setAttribute('transform', 'translate(' + x.toFixed(1) + ' 0)');
  }

  function unitSpan(text) {
    const u = document.createElement('span');
    u.className = 'u';
    u.textContent = text;
    return u;
  }

  // The rudder as a bar from midships: right and green for starboard, left
  // and red for port.
  function renderRudder() {
    const view = rudderView(current('steering.rudderAngle'));
    el.rudder.hidden = !view;
    if (view) {
      el.rudderText.textContent = view.text;
      el.rudderBar.className = 'bar ' + view.side;
      el.rudderBar.style.width = (view.share * 50).toFixed(1) + '%';
    }
  }

  function renderModebar(info, key) {
    el.modebar.className = 'modebar' + (key === undefined || key === OFFLINE ? ' offline' : key === 'standby' ? ' standby' : '');
    if (key === undefined) {
      el.modeLetter.textContent = '';
      el.modeName.textContent = pilot.status === 'ok' ? 'No pilot' : STATUS_TEXT[pilot.status];
    } else {
      const mode = nameOf(key);
      el.modeLetter.textContent = mode.letter;
      el.modeName.textContent = mode.name;
    }
    const can = available(info);
    el.keyAuto.disabled = !can.auto;
    el.keyWind.disabled = !can.wind;
    el.keyAuto.classList.toggle('on', key !== undefined && nameOf(key).letter === 'A');
    el.keyWind.classList.toggle('on', key === 'wind');
    el.keyStby.classList.toggle('on', key === 'standby');
    el.keyDodge.hidden = !can.dodge;
    el.keyDodge.classList.toggle('on', key === 'dodge');
    el.keyTackPort.hidden = el.keyTackStbd.hidden = !can.tack;
    el.keyGybePort.hidden = el.keyGybeStbd.hidden = !can.gybe;
    el.keyNext.hidden = !(can.nextPoint && isNavMode(key) && course && course.active && course.activeRoute);
  }

  // The menu is rebuilt only when the pilot's choices change, so that a
  // focused button survives the updates; the current mode is marked in place.
  let menuChoices = null;
  let menuView = 'modes';

  function renderMenu(info, key) {
    // Both lists are display: contents, which the hidden attribute cannot override.
    el.menuModes.style.display = menuView === 'modes' ? 'contents' : 'none';
    el.menuSettings.style.display = menuView === 'settings' ? 'contents' : 'none';
    if (menuView === 'settings') {
      renderSettings();
      return;
    }
    const list = info ? choices(info) : [];
    const id = list.join(',');
    if (id !== menuChoices) {
      menuChoices = id;
      const items = list.map((c) => {
        const mode = nameOf(c);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'item';
        b.dataset.cmd = 'mode:' + c;
        const letter = document.createElement('span');
        letter.className = 'letter';
        letter.textContent = mode.letter;
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = mode.name;
        b.append(letter, name);
        return b;
      });
      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = info ? 'The pilot offers no modes' : 'No pilot';
        items.push(empty);
      }
      el.menuItems.replaceChildren(...items);
    }
    Array.from(el.menuItems.children).forEach((b) => {
      b.classList.toggle('on', b.dataset.cmd === 'mode:' + key);
    });
  }

  function renderAlarm() {
    const names = Object.keys(alarms);
    el.alarm.classList.toggle('on', names.length > 0);
    if (names.length > 0) {
      const last = names[names.length - 1];
      el.alarmText.textContent = alarms[last] + (names.length > 1 ? ' (+' + (names.length - 1) + ')' : '');
    }
  }

  // The title the host shows, and one on its way to it. A title the host
  // refused is tried again on the next render.
  let shownTitle = null;
  let pendingTitle = null;

  function renderTitle() {
    const title = pilot.id ? 'Autopilot · ' + pilot.id : 'Autopilot';
    if (title === shownTitle || title === pendingTitle) {
      return;
    }
    pendingTitle = title;
    Promise.resolve()
      .then(() => host.setTitle(title))
      .then(() => {
        shownTitle = title;
      })
      .catch(() => {})
      .finally(() => {
        if (pendingTitle === title) {
          pendingTitle = null;
        }
      });
  }

  function render() {
    if (!pilot) {
      return;
    }
    renderTitle();
    const info = pilot.status === 'ok' ? pilot.info : null;
    const key = modeKey(info);
    renderModebar(info, key);
    el.values.replaceChildren(...blocksFor(key, info).map(valueBlock));
    renderNav();
    renderRudder();
    if (el.menu.classList.contains('open')) {
      renderMenu(info, key);
    }
    renderAlarm();
    if (host.onRender) {
      host.onRender(pilot);
    }
  }

  function showInfo(text) {
    el.info.textContent = text;
    el.info.classList.add('on');
    clearTimeout(infoTimeout);
    infoTimeout = setTimeout(() => el.info.classList.remove('on'), 4000);
  }

  function closeMenu() {
    el.menu.classList.remove('open');
    menuView = 'modes';
  }

  // ---- keys ----

  async function command(cmd) {
    if (!pilot) {
      return;
    }
    if (cmd === 'menu') {
      menuView = 'modes';
      el.menu.classList.add('open');
      render();
      return;
    }
    if (cmd === 'settings') {
      menuView = 'settings';
      render();
      return;
    }
    if (cmd === 'back') {
      if (menuView === 'settings') {
        menuView = 'modes';
        render();
      } else {
        closeMenu();
      }
      return;
    }
    if (cmd.startsWith('setting:')) {
      await stepChoice(cmd.substring(8));
      return;
    }
    if (cmd === 'navTarget') {
      if (course && typeof course.current('routeDistance') === 'number') {
        await setPref('navTarget', prefs.navTarget === 'end' ? 'wpt' : 'end').catch(() => {});
      }
      render();
      return;
    }
    closeMenu();
    if (cmd === 'standby') {
      // Whatever another key still had to send is unwanted from now on, even
      // when STBY itself cannot be sent.
      generation += 1;
    }
    const info = pilot.status === 'ok' ? pilot.info : null;
    if (!info) {
      showInfo(pilot.status === 'login' ? 'Log in to Signal K to steer' : 'No pilot');
      return;
    }
    const requests = requestsFor(info, cmd);
    if (requests.length === 0) {
      showInfo('The pilot cannot do that');
      return;
    }
    // STBY always goes out at once, and stops what another key still had to
    // send (an engage after a mode, say). Other keys go one at a time: a
    // second press while one is on its way would otherwise race it.
    if (cmd === 'standby') {
      standbyPending += 1;
      try {
        const failure = await pilot.send(requests);
        if (failure) {
          showInfo(failure);
        }
      } finally {
        standbyPending -= 1;
      }
      return;
    }
    if (busy || standbyPending > 0) {
      return;
    }
    busy = true;
    const mine = generation;
    try {
      const failure = await pilot.send(requests, () => generation === mine);
      if (failure) {
        showInfo(failure);
      }
    } finally {
      busy = false;
    }
  }

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cmd]');
    if (button && !button.disabled) {
      command(button.dataset.cmd);
    }
  });

  async function loadPrefs() {
    await Promise.all(Object.keys(DEFAULTS).map(async (key) => {
      const value = await Promise.resolve(host.store.load(key, DEFAULTS[key])).catch(() => DEFAULTS[key]);
      prefs[key] = typeof value === typeof DEFAULTS[key] ? value : DEFAULTS[key];
    }));
  }

  async function start() {
    await loadPrefs();
    // The pilot's own target paths may still hold what the previous pilot
    // reported; they say nothing about a new one.
    let pilotId = null;
    const onChange = (p) => {
      if (p.id !== pilotId) {
        pilotId = p.id;
        PATHS.filter((path) => path.startsWith('steering.autopilot.target.')).forEach((path) => delete values[path]);
      }
      render();
    };
    pilot = new Pilot(host, { poll: POLL, onChange });
    course = new Course(host, render);
    render();

    await host.subscribe(PATHS, (ev) => {
      values[ev.path] = { value: ev.value, time: Date.now() };
    });
    await host.subscribe(ALARMS.map((a) => 'notifications.steering.autopilot.' + a), (ev) => {
      const name = ev.path.substring('notifications.steering.autopilot.'.length);
      if (ev.value && ev.value.state && ev.value.state !== 'normal') {
        alarms[name] = String(ev.value.message || name);
      } else {
        delete alarms[name];
      }
      render();
    });
    await course.setSpeed(speedSetting());
    await course.start();
    await pilot.start();
    setInterval(render, 1000);
  }

  return {
    start,
    render,
    showInfo,
    closeMenu,
    // The host's settings changed from elsewhere: read the shared ones again.
    reload: async () => {
      await loadPrefs();
      if (course) {
        await course.setSpeed(speedSetting());
      }
      render();
    }
  };
}
