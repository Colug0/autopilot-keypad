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

// Follows the course the server knows (Signal K Course API) and the speed the
// times are worked out from.

import { KNOT, SpeedAverage, pointName } from './nav.mjs';

const VALUE_TIMEOUT = 10000;
const CALC = 'navigation.course.calcValues.';
const PATHS = {
  crossTrackError: CALC + 'crossTrackError',
  distance: CALC + 'distance',
  bearingTrue: CALC + 'bearingTrue',
  bearingMagnetic: CALC + 'bearingMagnetic',
  routeDistance: CALC + 'route.distance'
};
const SOG = 'navigation.speedOverGround';

async function getJson(path) {
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) {
    throw new Error(path + ' ' + res.status);
  }
  return res.json();
}

export class Course {
  constructor(host, onChange = () => {}) {
    this.host = host;
    this.onChange = onChange;
    this.values = {};
    this.activeRoute = null;
    this.nextPoint = null;
    this.name = '';
    this.lookup = 0;
    // How often each of activeRoute and nextPoint came as a delta, so that a
    // read that started earlier does not undo them.
    this.deltas = { activeRoute: 0, nextPoint: 0 };
    this.subscribedPath = null;
    this.average = new SpeedAverage(15 * 60000);
    this.speedSetting = { source: 'average', minutes: 15, knots: 5, path: SOG };
    this.pathSpeed = undefined;
    this.unsubscribePath = null;
  }

  async start() {
    await this.host.subscribe(Object.values(PATHS), (ev) => {
      this.values[ev.path] = { value: ev.value, time: Date.now() };
    });
    await this.host.subscribe(['navigation.course.activeRoute', 'navigation.course.nextPoint'], (ev) => {
      const key = ev.path === 'navigation.course.activeRoute' ? 'activeRoute' : 'nextPoint';
      this.deltas[key] += 1;
      this.setCourse(key, ev.value || null);
    });
    await this.host.subscribe([SOG], (ev) => this.average.add(ev.value));
    // The course as it stands now, before the first deltas arrive.
    const before = { ...this.deltas };
    try {
      const course = await getJson('/signalk/v2/api/vessels/self/navigation/course');
      ['activeRoute', 'nextPoint'].forEach((key) => {
        if (this.deltas[key] === before[key]) {
          this.setCourse(key, course[key] || null);
        }
      });
    } catch {
      // Deltas will tell.
    }
    this.onChange();
  }

  // A new destination makes the calculations for the old one meaningless
  // until the server has worked them out again.
  setCourse(key, value) {
    const before = JSON.stringify(this[key]);
    this[key] = value;
    if (JSON.stringify(value) === before) {
      return;
    }
    if (key === 'nextPoint') {
      Object.values(PATHS).forEach((path) => delete this.values[path]);
    }
    this.lookUpName();
    this.onChange();
  }

  current(key) {
    const v = this.values[PATHS[key]];
    return v && Date.now() - v.time <= VALUE_TIMEOUT ? v.value : undefined;
  }

  // A course is on while there is a point to go to.
  get active() {
    return !!(this.nextPoint && this.nextPoint.position);
  }

  get pointCount() {
    const r = this.activeRoute;
    return r && typeof r.pointIndex === 'number' && typeof r.pointTotal === 'number'
      ? (r.pointIndex + 1) + '/' + r.pointTotal
      : '';
  }

  // The name of the next point, from the route or the waypoint resource.
  async lookUpName() {
    const lookup = ++this.lookup;
    const course = { activeRoute: this.activeRoute, nextPoint: this.nextPoint };
    let route = null;
    let waypoint = null;
    try {
      if (this.activeRoute && this.activeRoute.href) {
        route = await getJson('/signalk/v2/api' + this.activeRoute.href);
      } else if (this.nextPoint && this.nextPoint.href) {
        waypoint = await getJson('/signalk/v2/api' + this.nextPoint.href);
      }
    } catch {
      // Named by number instead.
    }
    if (lookup === this.lookup) {
      this.name = pointName(course, route, waypoint);
      this.onChange();
    }
  }

  // { source: 'average' | 'fixed' | 'path', minutes, knots, path }
  async setSpeed(setting) {
    this.speedSetting = setting;
    this.average.setWindow(Math.max(1, setting.minutes) * 60000);
    const pathNow = setting.source === 'path' ? setting.path : null;
    // Compared with the path actually subscribed, so that a failed subscription
    // is tried again on the next call.
    if (pathNow !== this.subscribedPath) {
      if (this.unsubscribePath) {
        await Promise.resolve().then(() => this.unsubscribePath()).catch(() => {});
        this.unsubscribePath = null;
      }
      this.subscribedPath = null;
      this.pathSpeed = undefined;
      if (pathNow) {
        this.unsubscribePath = await this.host.subscribe([pathNow], (ev) => {
          if (ev.path === this.subscribedPath) {
            this.pathSpeed = { value: ev.value, time: Date.now() };
          }
        });
        this.subscribedPath = pathNow;
      }
    }
  }

  // The speed in m/s the times are worked out from.
  speed() {
    const s = this.speedSetting;
    if (s.source === 'fixed') {
      return s.knots * KNOT;
    }
    if (s.source === 'path') {
      return this.pathSpeed && Date.now() - this.pathSpeed.time <= VALUE_TIMEOUT ? this.pathSpeed.value : undefined;
    }
    return this.average.value();
  }
}
