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

// The keypad window: a mode display above keys laid out like a pilot keypad.
// Adapted from the keypad design of signalk-autopilot's webapp.

import { connectExtension } from 'signalk-plotterext-bus/extension';
import { ALARMS, available, choices, modeKey, nameOf, requestsFor, rudderView, valuesFor } from './model.mjs';
import { Pilot } from './pilot.mjs';
import { settingsScope } from './settings.mjs';

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

const values = {};
const alarms = {};
const el = {};
let pilot = null;
let client = null;
let autoOpen = false;
let infoTimeout = null;
let busy = false;

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

// The rudder as a bar from midships: right and green for starboard, left and
// red for port.
function renderRudder() {
  const view = rudderView(current('steering.rudderAngle'));
  el.rudder.hidden = !view;
  if (view) {
    el.rudderText.textContent = view.text;
    el.rudderBar.className = 'bar ' + view.side;
    el.rudderBar.style.width = (view.share * 50).toFixed(1) + '%';
  }
}

const STATUS_TEXT = { searching: 'Looking for pilot', none: 'No pilot', login: 'Log in to Signal K', error: 'No pilot' };

function renderModebar(info, key) {
  el.modebar.className = 'modebar' + (key === undefined ? ' offline' : key === 'standby' ? ' standby' : '');
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

// The menu is rebuilt only when the pilot's choices change, so that a focused
// button survives the updates; the current mode is marked in place.
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
  el.autoOpen.classList.toggle('on', autoOpen);
  el.autoOpenState.textContent = autoOpen ? 'On' : 'Off';
}

function renderAlarm() {
  const names = Object.keys(alarms);
  el.alarm.classList.toggle('on', names.length > 0);
  if (names.length > 0) {
    const last = names[names.length - 1];
    el.alarmText.textContent = alarms[last] + (names.length > 1 ? ' (+' + (names.length - 1) + ')' : '');
  }
}

let shownTitle = null;

// The window title names the pilot, as there may be more than one.
function renderTitle() {
  const title = pilot.id ? 'Autopilot · ' + pilot.id : 'Autopilot';
  if (title !== shownTitle && client.context.kind === 'window') {
    shownTitle = title;
    client.call('ui.updateWindow', { title }).catch(() => {});
  }
}

function render() {
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
}

function showInfo(text) {
  el.info.textContent = text;
  el.info.classList.add('on');
  clearTimeout(infoTimeout);
  infoTimeout = setTimeout(() => el.info.classList.remove('on'), 4000);
}

async function setAutoOpen(value) {
  autoOpen = value;
  render();
  try {
    await client.state.set({ autoOpen: value }, settingsScope(client));
  } catch {
    showInfo('Could not save the setting');
  }
}

async function command(cmd) {
  if (cmd === 'menu') {
    el.menu.classList.add('open');
    render();
    return;
  }
  if (cmd === 'autoOpen') {
    setAutoOpen(!autoOpen);
    return;
  }
  el.menu.classList.remove('open');
  if (cmd === 'closeMenu') {
    return;
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
  // One command at a time: a second key press while one is on its way would
  // otherwise race it.
  if (busy) {
    return;
  }
  busy = true;
  try {
    const failure = await pilot.send(requests);
    if (failure) {
      showInfo(failure);
    }
  } finally {
    busy = false;
  }
}

function alarmText(name, value) {
  return String((value && value.message) || name);
}

async function followNightMode() {
  if (!client.hasCapability('nightMode')) {
    return;
  }
  const apply = (state) => document.documentElement.classList.toggle('night', !!(state && state.enabled));
  await client.subscribe(['nightMode.changed'], (_name, state) => apply(state));
  apply(await client.nightMode.get().catch(() => null));
}

async function start() {
  ['modebar', 'modeLetter', 'modeName', 'alarm', 'alarmText', 'info', 'values', 'rudder', 'menu',
    'menuItems', 'rudderText', 'rudderBar', 'autoOpen', 'autoOpenState', 'keyStby', 'keyAuto', 'keyWind', 'keyDodge', 'keyTackPort',
    'keyTackStbd', 'keyGybePort', 'keyGybeStbd'].forEach((id) => {
    el[id] = document.getElementById(id);
  });
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cmd]');
    if (button && !button.disabled) {
      command(button.dataset.cmd);
    }
  });

  client = await connectExtension();
  pilot = new Pilot(client, { poll: POLL, onChange: render });
  render();

  const saved = await client.state.get(['autoOpen'], settingsScope(client)).catch(() => ({}));
  autoOpen = saved.autoOpen === true;
  await client.subscribe(['state.changed'], async () => {
    const now = await client.state.get(['autoOpen'], settingsScope(client)).catch(() => ({}));
    autoOpen = now.autoOpen === true;
    render();
  });

  await client.signalk.subscribe(PATHS, (ev) => {
    values[ev.path] = { value: ev.value, time: Date.now() };
  });
  await client.signalk.subscribe(ALARMS.map((a) => 'notifications.steering.autopilot.' + a), (ev) => {
    const name = ev.path.substring('notifications.steering.autopilot.'.length);
    if (ev.value && ev.value.state && ev.value.state !== 'normal') {
      alarms[name] = alarmText(name, ev.value);
    } else {
      delete alarms[name];
    }
    render();
  });
  // A hidden window comes back as it was left; it should not come back with
  // the mode menu over the display.
  await client.subscribe(['window.state'], (_name, state) => {
    if (state && state.windowId === client.context.windowId && !state.visible) {
      el.menu.classList.remove('open');
    }
  });
  await followNightMode();
  await pilot.start();
  setInterval(render, 1000);
}

start().catch((err) => {
  document.body.textContent = 'The autopilot keypad needs a chart plotter with plotter extensions: ' + err.message;
});
