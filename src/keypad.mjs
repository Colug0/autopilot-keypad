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

// The keypad in a plotter window: data through the plotter's bus, the title
// in the window's title bar, night mode from the plotter, settings kept by
// the plotter for this device, and the setting to open the window when the
// pilot is engaged.

import { connectExtension } from 'signalk-plotterext-bus/extension';
import { startKeypad } from './ui.mjs';
import { settingsScope } from './settings.mjs';

async function start() {
  const client = await connectExtension();

  let autoOpen = false;
  let autoOpenWrites = 0;
  let keypad = null;

  // Shows the stored setting; `write`, when given, is the change that failed,
  // and the stored value only counts if no later change was made meanwhile.
  async function loadAutoOpen(write) {
    const saved = await client.state.get(['autoOpen'], settingsScope(client)).catch(() => ({}));
    if (write !== undefined && write !== autoOpenWrites) {
      return;
    }
    autoOpen = saved.autoOpen === true;
    keypad.render();
  }

  // Shows the new value at once; if it cannot be saved, shows what is stored,
  // unless a later change has been made meanwhile.
  async function setAutoOpen(value) {
    const write = ++autoOpenWrites;
    autoOpen = value;
    keypad.render();
    try {
      await client.state.set({ autoOpen: value }, settingsScope(client));
    } catch {
      keypad.showInfo('Could not save the setting');
      if (write === autoOpenWrites) {
        await loadAutoOpen(write);
      }
    }
  }

  keypad = startKeypad(document.getElementById('keypad'), {
    subscribe: (paths, handler) => client.signalk.subscribe(paths, handler),
    setTitle: (title) => (client.context.kind === 'window' ? client.call('ui.updateWindow', { title }) : undefined),
    // This device's settings, kept by the plotter.
    store: {
      load: async (key, fallback) => {
        const saved = await client.state.get([key], settingsScope(client));
        return saved[key] === undefined ? fallback : saved[key];
      },
      save: (key, value) => client.state.set({ [key]: value }, settingsScope(client))
    },
    settings: [{
      id: 'autoOpen',
      label: 'Open when engaged',
      type: 'choice',
      choices: [{ value: true, text: 'On' }, { value: false, text: 'Off' }],
      get: () => autoOpen,
      set: (value) => setAutoOpen(value)
    }]
  });

  await loadAutoOpen();
  await client.subscribe(['state.changed'], async () => {
    await loadAutoOpen();
    await keypad.reload();
  });

  // A hidden window comes back as it was left; it should not come back with
  // the mode menu over the display.
  await client.subscribe(['window.state'], (_name, state) => {
    if (state && state.windowId === client.context.windowId && !state.visible) {
      keypad.closeMenu();
    }
  });

  if (client.hasCapability('nightMode')) {
    const apply = (state) => document.documentElement.classList.toggle('night', !!(state && state.enabled));
    await client.subscribe(['nightMode.changed'], (_name, state) => apply(state));
    apply(await client.nightMode.get().catch(() => null));
  }

  await keypad.start();
}

start().catch((err) => {
  document.body.textContent = 'The autopilot keypad needs a chart plotter with plotter extensions: ' + err.message;
});
