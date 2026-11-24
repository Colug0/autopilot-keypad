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

// The background runtime: owns the keypad window, so that the toolbar button
// and the pilot being engaged show the same window, and opens it when the
// pilot is engaged, if this device asks for that.

import { connectExtension } from 'signalk-plotterext-bus/extension';
import { Pilot } from './pilot.mjs';
import { settingsScope, TOGGLE_TOPIC } from './settings.mjs';

const PANEL = 'keypad';
const BUTTON = 'autopilot-keypad';

const client = await connectExtension();

const WINDOW = {
  panel: PANEL,
  title: 'Autopilot',
  geometry: {
    anchor: 'top-right',
    offset: { x: 16, y: 64 },
    width: 300,
    height: 500,
    minWidth: 240,
    minHeight: 340
  },
  userClose: 'hide',
  single: true,
  restoreKey: 'keypad-nav-500'
};

async function keypadWindow() {
  const { windows } = await client.call('ui.listWindows');
  return windows.find((w) => w.panel === PANEL);
}

async function decorate(visible) {
  if (client.hasCapability('buttons.decorations')) {
    await client.call('buttons.decorate', { ids: [BUTTON], style: visible ? 'active' : 'normal' }).catch(() => {});
  }
}

async function show() {
  const w = await keypadWindow();
  if (!w) {
    const opened = await client.call('ui.openWindow', WINDOW);
    await decorate(opened.visible);
    return;
  }
  await client.call('ui.updateWindow', { windowId: w.windowId, visible: true });
  await client.call('ui.focusWindow', { windowId: w.windowId }).catch(() => {});
  await decorate(true);
}

async function toggle() {
  const w = await keypadWindow();
  if (w && w.visible) {
    await client.call('ui.updateWindow', { windowId: w.windowId, visible: false });
    await decorate(false);
  } else {
    await show();
  }
}

async function wantsAutoOpen() {
  const saved = await client.state.get(['autoOpen'], settingsScope(client)).catch(() => ({}));
  return saved.autoOpen === true;
}

// Window changes run one after the other, so each sees what the one before
// left; a failed one does not hold up the next.
let queue = Promise.resolve();
function queued(task, what) {
  queue = queue.then(task).catch((err) => console.warn('autopilot keypad: ' + what + ' failed', err));
  return queue;
}

await client.subscribe([TOGGLE_TOPIC], () => queued(toggle, 'toggle'));
await client.subscribe(['window.state', 'window.closed'], (name, params) => {
  if (name === 'window.closed') {
    keypadWindow().then((w) => decorate(!!(w && w.visible))).catch(() => {});
  } else if (params.panel === PANEL) {
    decorate(params.visible);
  }
});

// Opens the window when the pilot goes from not engaged to engaged; a pilot
// already engaged when the plotter starts does not count.
let engaged = null;
let pilotId = null;
const pilot = new Pilot({ subscribe: (paths, handler) => client.signalk.subscribe(paths, handler) }, {
  onChange: (p) => {
    if (p.status !== 'ok' || !p.info) {
      return;
    }
    const now = p.info.engaged === true;
    const before = p.id === pilotId ? engaged : null;
    pilotId = p.id;
    engaged = now;
    if (before === false && now) {
      const id = p.id;
      const stillEngaged = () => pilot.id === id && pilot.status === 'ok' && !!pilot.info && pilot.info.engaged === true;
      queued(async () => {
        if (await wantsAutoOpen() && stillEngaged()) {
          await show();
        }
      }, 'opening');
    }
  }
});
await pilot.start();
