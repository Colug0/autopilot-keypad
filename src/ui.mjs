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

// The keypad itself: a mode display above keys laid out like a pilot keypad.
// It is the same in the plotter window and in the webapp; what differs comes
// in as the `host`:
//   subscribe(paths, handler)  Signal K values, as { path, value, $source }
//   setTitle(title)            names the pilot (may return a promise)
//   options                    extra rows at the top of the mode menu, each
//                              { id, label, value(): string, on(): boolean, toggle() }
//   onRender(pilot)            optional, called after every render
// Adapted from the keypad design of signalk-autopilot's webapp.

import { ALARMS, OFFLINE, available, choices, modeKey, nameOf, requestsFor, rudderView, valuesFor } from './model.mjs';
import { Pilot } from './pilot.mjs';

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

const MARKUP = `
  <section class="display">
    <div class="modebar offline" id="modebar">
      <span class="letter" id="modeLetter"></span>
      <span class="name" id="modeName">No pilot</span>
    </div>
    <div class="alarm" id="alarm" role="alert"><span id="alarmText"></span></div>
    <div class="info" id="info" role="status" aria-live="polite"></div>
    <div class="values" id="values"></div>
    <div class="rudder" id="rudder" hidden>
      <div id="rudderText"></div>
      <div class="track"><div class="bar" id="rudderBar"></div><div class="mid"></div></div>
    </div>
    <div class="menu" id="menu">
      <button class="back" type="button" data-cmd="closeMenu">&lsaquo; Back</button>
      <div id="menuOptions" style="display: contents"></div>
      <div id="menuItems" style="display: contents"></div>
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
  </section>`;

const IDS = ['modebar', 'modeLetter', 'modeName', 'alarm', 'alarmText', 'info', 'values', 'rudder', 'rudderText',
  'rudderBar', 'menu', 'menuOptions', 'menuItems', 'keyStby', 'keyAuto', 'keyWind', 'keyDodge', 'keyTackPort',
  'keyTackStbd', 'keyGybePort', 'keyGybeStbd'];

const STATUS_TEXT = { searching: 'Looking for pilot', none: 'No pilot', login: 'Log in to Signal K', error: 'No pilot' };

export function startKeypad(root, host) {
  const values = {};
  const alarms = {};
  const el = {};
  const options = host.options || [];
  let infoTimeout = null;
  let busy = false;
  // Raised by STBY: what other keys still have to send is no longer wanted.
  let generation = 0;
  // STBY requests still on their way; other keys wait for them.
  let standbyPending = 0;
  let pilot = null;

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
        const tri = document.createElement('span');
        tri.className = 'tri ' + block.side;
        tri.setAttribute('role', 'img');
        tri.setAttribute('aria-label', block.side === 'port' ? 'port' : 'starboard');
        num.appendChild(tri);
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
  }

  function renderOptions() {
    if (el.menuOptions.children.length !== options.length) {
      el.menuOptions.replaceChildren(...options.map((o) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'option';
        b.dataset.cmd = 'option:' + o.id;
        const label = document.createElement('span');
        label.textContent = o.label;
        const state = document.createElement('span');
        state.className = 'switch';
        b.append(label, state);
        return b;
      }));
    }
    options.forEach((o, i) => {
      const b = el.menuOptions.children[i];
      b.classList.toggle('on', o.on());
      b.lastChild.textContent = o.value();
    });
  }

  // The menu is rebuilt only when the pilot's choices change, so that a
  // focused button survives the updates; the current mode is marked in place.
  let menuChoices = null;

  function renderMenu(info, key) {
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
    renderOptions();
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
    el.values.replaceChildren(...valuesFor(key, current, info ? info.target : undefined).map(valueBlock));
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

  async function command(cmd) {
    if (!pilot) {
      return;
    }
    if (cmd === 'menu') {
      el.menu.classList.add('open');
      render();
      return;
    }
    if (cmd.startsWith('option:')) {
      const option = options.find((o) => o.id === cmd.substring(7));
      if (option) {
        await Promise.resolve(option.toggle()).catch(() => showInfo('Could not change the setting'));
        render();
      }
      return;
    }
    el.menu.classList.remove('open');
    if (cmd === 'closeMenu') {
      return;
    }
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

  async function start() {
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
    await pilot.start();
    setInterval(render, 1000);
  }

  return {
    start,
    render,
    showInfo,
    closeMenu: () => el.menu.classList.remove('open')
  };
}
