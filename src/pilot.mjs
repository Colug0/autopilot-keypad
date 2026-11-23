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

import { API, pickPilot, failureText } from './model.mjs';

const RETRY_DELAY = 2000;
const ATTRIBS = ['state', 'mode', 'target', 'engaged', 'availableActions'];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let answer;
  try {
    answer = await res.json();
  } catch {
    answer = undefined;
  }
  if (!res.ok) {
    throw new HttpError(res.status, answer && answer.message);
  }
  return answer;
}

// Follows the Autopilot API's default pilot. The host relays its deltas, but
// throttles each path whatever its source, so a pilot's own raw state on the
// same path can crowd out the API's; the pilot is therefore also read back
// now and then, and after every command.
export class Pilot {
  constructor(client, { poll = 0, onChange = () => {} } = {}) {
    this.client = client;
    this.poll = poll;
    this.onChange = onChange;
    this.id = null;
    this.info = null;
    // 'searching', 'none' (no pilot), 'login' (not allowed to read), 'error', 'ok'
    this.status = 'searching';
    this.lookup = 0;
    this.discovering = false;
    this.timer = null;
    // Which delta last set each attribute, so a read that started before it
    // does not undo it.
    this.deltas = 0;
    this.setBy = {};
  }

  async start() {
    const paths = ATTRIBS.map((a) => 'steering.autopilot.' + a).concat('steering.autopilot.defaultPilot');
    await this.client.signalk.subscribe(paths, (ev) => this.delta(ev));
    await this.discover();
  }

  delta(ev) {
    if (ev.path === 'steering.autopilot.defaultPilot') {
      if (ev.value !== this.id) {
        this.discover();
      }
      return;
    }
    if (this.id === null || ev.$source !== this.id || this.info === null) {
      return;
    }
    const attrib = ev.path.substring('steering.autopilot.'.length);
    this.setBy[attrib] = ++this.deltas;
    this.info = { ...this.info, [attrib]: ev.value };
    this.onChange(this);
  }

  schedule(delay) {
    clearTimeout(this.timer);
    if (delay > 0) {
      this.timer = setTimeout(() => (this.id === null ? this.discover() : this.refresh()), delay);
    }
  }

  setStatus(status) {
    this.status = status;
    this.onChange(this);
  }

  // Looks up the default pilot. While it runs, no read of the old pilot may
  // overtake it.
  async discover() {
    const lookup = ++this.lookup;
    this.discovering = true;
    try {
      const id = pickPilot(await request('GET', API));
      if (lookup !== this.lookup) {
        return;
      }
      if (id !== this.id) {
        this.id = id;
        this.info = null;
        this.setBy = {};
      }
      if (id === null) {
        this.discovering = false;
        this.setStatus('none');
        this.schedule(this.poll || RETRY_DELAY * 5);
        return;
      }
      await this.read(lookup);
    } catch (err) {
      if (lookup === this.lookup) {
        this.fail(err);
      }
    } finally {
      if (lookup === this.lookup) {
        this.discovering = false;
      }
    }
  }

  // Reads the pilot again, unless it is being looked up.
  refresh() {
    if (this.discovering) {
      return undefined;
    }
    return this.id === null ? this.discover() : this.read(++this.lookup);
  }

  async read(lookup) {
    const since = this.deltas;
    try {
      const info = await request('GET', API + '/' + encodeURIComponent(this.id));
      if (lookup !== this.lookup) {
        return;
      }
      // What a delta set while the read was on its way is newer than the read.
      // The list of available actions only comes as a delta; without a newer
      // one, the read's options say what is available.
      const next = { ...info, availableActions: undefined };
      if (this.info) {
        Object.keys(this.setBy).forEach((attrib) => {
          if (this.setBy[attrib] > since) {
            next[attrib] = this.info[attrib];
          }
        });
      }
      this.info = next;
      this.status = 'ok';
      this.onChange(this);
      this.schedule(this.poll);
    } catch (err) {
      if (lookup === this.lookup) {
        // The device may have gone: look for the pilot again next time.
        if (err.status === 404) {
          this.id = null;
          this.info = null;
        }
        this.fail(err);
      }
    }
  }

  fail(err) {
    this.setStatus(err.status === 401 || err.status === 403 ? 'login' : 'error');
    this.schedule(RETRY_DELAY);
  }

  // Sends the requests one after the other, as long as `current()` says they
  // are still wanted; resolves to an error text or null.
  async send(requests, current = () => true) {
    if (this.id === null || requests.length === 0) {
      return requests.length === 0 ? null : 'No pilot';
    }
    const base = API + '/' + encodeURIComponent(this.id) + '/';
    try {
      for (const r of requests) {
        if (!current()) {
          return null;
        }
        await request(r.method, base + r.path, r.body);
      }
      return null;
    } catch (err) {
      return current() ? failureText(err.status, err.message) : null;
    } finally {
      this.refresh();
    }
  }
}
