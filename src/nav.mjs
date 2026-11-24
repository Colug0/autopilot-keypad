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

// The navigation block: what the course gives (cross track error, distances,
// bearing) and the times worked out from a speed. No DOM and no network here.

export const NM = 1852;
export const KNOT = NM / 3600;
const MAX_HOURS = 99;

const num = (v) => typeof v === 'number' && Number.isFinite(v);

// A cross track error in metres below 0.1 nm, in nm above.
export function xteText(metres) {
  if (!num(metres)) {
    return { text: '--', unit: '', side: '' };
  }
  const abs = Math.abs(metres);
  const side = metres < 0 ? 'port' : metres > 0 ? 'stbd' : '';
  if (abs < 0.1 * NM) {
    return { text: String(Math.round(abs)), unit: 'm', side };
  }
  return { text: (abs / NM).toFixed(2), unit: 'nm', side };
}

export function distanceText(metres) {
  if (!num(metres)) {
    return { text: '--', unit: '' };
  }
  const nm = metres / NM;
  return { text: nm.toFixed(nm < 10 ? 2 : nm < 100 ? 1 : 0), unit: 'nm' };
}

// Seconds to go for a distance at a speed in m/s, or undefined.
export function timeToGo(metres, speed) {
  if (!num(metres) || !num(speed) || speed <= 0.05) {
    return undefined;
  }
  const seconds = metres / speed;
  return seconds > MAX_HOURS * 3600 ? undefined : seconds;
}

// 10:02 below an hour (minutes and seconds), 1h05 above.
export function durationText(seconds) {
  if (!num(seconds)) {
    return '--';
  }
  const s = Math.round(seconds);
  if (s < 3600) {
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  const minutes = Math.round(s / 60);
  return Math.floor(minutes / 60) + 'h' + String(minutes % 60).padStart(2, '0');
}

// The local clock time of arrival, with +1d (and so on) for a later day.
export function etaText(seconds, now = new Date()) {
  if (!num(seconds)) {
    return '--';
  }
  const at = new Date(now.getTime() + seconds * 1000);
  const text = String(at.getHours()).padStart(2, '0') + ':' + String(at.getMinutes()).padStart(2, '0');
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(at) - midnight(now)) / 86400000);
  return days > 0 ? text + ' +' + days + 'd' : text;
}

// Where the boat is drawn on the highway: -1 (port limit) to 1 (starboard).
export function highwayPosition(metres, limitNm) {
  if (!num(metres) || !num(limitNm) || limitNm <= 0) {
    return 0;
  }
  return Math.max(-1, Math.min(1, metres / (limitNm * NM)));
}

// The block for the next waypoint or for the end of the route.
export function navView(course, speed, target = 'wpt', now = new Date()) {
  const toEnd = target === 'end' && num(course.routeDistance);
  const distance = toEnd ? course.routeDistance : course.distance;
  const seconds = timeToGo(distance, speed);
  return {
    target: toEnd ? 'end' : 'wpt',
    xte: xteText(course.crossTrackError),
    distanceLabel: toEnd ? 'DTE' : 'DTW',
    distance: distanceText(distance),
    ttg: durationText(seconds),
    eta: etaText(seconds, now)
  };
}

// The mean of a speed over the last `windowMs`, each sample counting for the
// time until the next one, so that a burst of samples does not outweigh a
// steady stretch.
export class SpeedAverage {
  constructor(windowMs) {
    this.windowMs = windowMs;
    this.samples = [];
  }

  setWindow(windowMs) {
    this.windowMs = windowMs;
  }

  add(value, time = Date.now()) {
    if (num(value)) {
      this.samples.push({ value, time });
      this.prune(time);
    }
  }

  prune(now) {
    const from = now - this.windowMs;
    // Keep the last sample before the window: it holds until the next one.
    while (this.samples.length > 1 && this.samples[1].time <= from) {
      this.samples.shift();
    }
  }

  // Undefined when no sample is newer than the window.
  value(now = Date.now()) {
    this.prune(now);
    const from = now - this.windowMs;
    if (this.samples.length === 0 || this.samples[this.samples.length - 1].time < from) {
      return undefined;
    }
    let sum = 0;
    let span = 0;
    this.samples.forEach((s, i) => {
      const start = Math.max(s.time, from);
      const end = i + 1 < this.samples.length ? this.samples[i + 1].time : now;
      if (end > start) {
        sum += s.value * (end - start);
        span += end - start;
      }
    });
    return span > 0 ? sum / span : this.samples[this.samples.length - 1].value;
  }
}

// The name of the point a course leads to: the name the course gives it, a
// route point's own name, or its number, or a waypoint's name.
export function pointName(course, route, waypoint) {
  if (course && course.nextPoint && course.nextPoint.name) {
    return course.nextPoint.name;
  }
  const active = course && course.activeRoute;
  if (active && num(active.pointIndex)) {
    const meta = route && route.feature && route.feature.properties && route.feature.properties.coordinatesMeta;
    const total = num(active.pointTotal) ? active.pointTotal : (Array.isArray(meta) ? meta.length : 0);
    const index = active.reverse && total ? total - 1 - active.pointIndex : active.pointIndex;
    const named = Array.isArray(meta) && meta[index] && meta[index].name;
    return named || 'WPT ' + (active.pointIndex + 1);
  }
  return (waypoint && waypoint.name) || 'Waypoint';
}

// The distance in metres between two [longitude, latitude] points along a
// great circle.
export function legDistance(a, b) {
  const rad = Math.PI / 180;
  const R = 6371000;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// The points still ahead on a route, from the next one: name, distance from
// the boat along the route, time to go and arrival. `toNext` is the distance
// to the next point as the server works it out.
export function waypointList(route, active, toNext, speed, now = new Date()) {
  const coords = route && route.feature && route.feature.geometry && route.feature.geometry.coordinates;
  if (!Array.isArray(coords) || !active || !num(active.pointIndex)) {
    return [];
  }
  const meta = (route.feature.properties && route.feature.properties.coordinatesMeta) || [];
  const order = coords.map((c, i) => i);
  if (active.reverse) {
    order.reverse();
  }
  const rows = [];
  let distance = toNext;
  for (let i = active.pointIndex; i < order.length; i++) {
    const at = order[i];
    if (i > active.pointIndex && num(distance)) {
      distance += legDistance(coords[order[i - 1]], coords[at]);
    }
    const seconds = timeToGo(distance, speed);
    rows.push({
      index: i,
      name: (meta[at] && meta[at].name) || 'WPT ' + (i + 1),
      distance: distanceText(distance),
      ttg: durationText(seconds),
      eta: etaText(seconds, now)
    });
  }
  return rows;
}
