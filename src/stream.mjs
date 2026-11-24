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

// The webapp's own connection to the Signal K delta stream: what a plotter
// relays for the window, without its throttling.

const RECONNECT_DELAY = 2000;

export class Stream {
  constructor(location = window.location) {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    this.url = protocol + '://' + location.host + '/signalk/v1/stream?subscribe=none';
    this.handlers = new Map();
    this.ws = null;
    this.timer = null;
  }

  // Calls `handler({ path, value, $source, timestamp })` for every value of
  // the given literal paths; resolves to a function that ends it.
  subscribe(paths, handler) {
    const added = [];
    paths.forEach((path) => {
      if (!this.handlers.has(path)) {
        this.handlers.set(path, new Set());
        added.push(path);
      }
      this.handlers.get(path).add(handler);
    });
    if (this.ws === null) {
      this.connect();
    } else if (added.length > 0) {
      this.send(added);
    }
    return Promise.resolve(async () => {
      paths.forEach((path) => {
        const set = this.handlers.get(path);
        if (set) {
          set.delete(handler);
        }
      });
    });
  }

  send(paths) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        context: 'vessels.self',
        subscribe: paths.map((path) => ({ path, policy: 'instant' }))
      }));
    }
  }

  connect() {
    clearTimeout(this.timer);
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => this.send([...this.handlers.keys()]);
    ws.onmessage = (event) => this.deliver(event.data);
    ws.onclose = () => {
      if (this.ws === ws) {
        this.timer = setTimeout(() => this.connect(), RECONNECT_DELAY);
      }
    };
    ws.onerror = () => ws.close();
  }

  deliver(data) {
    let delta;
    try {
      delta = JSON.parse(data);
    } catch {
      return;
    }
    if (!Array.isArray(delta.updates)) {
      return;
    }
    delta.updates.forEach((update) => {
      (update.values || []).forEach((pv) => {
        const set = pv && this.handlers.get(pv.path);
        if (!set) {
          return;
        }
        const event = {
          path: pv.path,
          value: pv.value,
          timestamp: update.timestamp,
          $source: update.$source || (update.source && update.source.label)
        };
        set.forEach((handler) => handler(event));
      });
    });
  }
}
