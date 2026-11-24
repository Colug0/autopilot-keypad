import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NM, KNOT, SpeedAverage, distanceText, durationText, etaText, highwayPosition, navView, pointName, timeToGo, xteText
} from '../src/nav.mjs';

test('cross track error: metres below 0.1 nm, side from the sign', () => {
  assert.deepEqual(xteText(-44.2), { text: '44', unit: 'm', side: 'port' });
  assert.deepEqual(xteText(30), { text: '30', unit: 'm', side: 'stbd' });
  assert.deepEqual(xteText(0.3 * NM), { text: '0.30', unit: 'nm', side: 'stbd' });
  assert.deepEqual(xteText(null), { text: '--', unit: '', side: '' });
});

test('distances in nm', () => {
  assert.deepEqual(distanceText(0.692 * NM), { text: '0.69', unit: 'nm' });
  assert.deepEqual(distanceText(12.34 * NM), { text: '12.3', unit: 'nm' });
  assert.deepEqual(distanceText(250 * NM), { text: '250', unit: 'nm' });
});

test('time to go and its text', () => {
  assert.equal(timeToGo(NM, 0), undefined);
  assert.equal(timeToGo(NM, 0.01), undefined);
  assert.equal(Math.round(timeToGo(NM, 6 * KNOT)), 600);
  assert.equal(timeToGo(1000 * NM, 1 * KNOT), undefined);
  assert.equal(durationText(602), '10:02');
  assert.equal(durationText(3900), '1h05');
  assert.equal(durationText(undefined), '--');
});

test('arrival as clock time, a later day marked', () => {
  const now = new Date(2026, 10, 24, 15, 52, 0);
  assert.equal(etaText(600, now), '16:02');
  assert.equal(etaText(9 * 3600, now), '00:52 +1d');
  assert.equal(etaText(undefined, now), '--');
});

test('highway position, clamped at the limit', () => {
  assert.equal(highwayPosition(-0.05 * NM, 0.1), -0.5);
  assert.equal(highwayPosition(1000, 0.1), 1);
  assert.equal(highwayPosition(undefined, 0.1), 0);
});

test('to the waypoint or to the end of the route', () => {
  const course = { crossTrackError: -44, distance: 0.692 * NM, routeDistance: 5.2 * NM };
  const now = new Date(2026, 10, 24, 15, 52, 0);
  const wpt = navView(course, 4.15 * KNOT, 'wpt', now);
  assert.equal(wpt.distanceLabel, 'DTW');
  assert.equal(wpt.distance.text, '0.69');
  assert.equal(wpt.ttg, '10:00');
  const end = navView(course, 4.15 * KNOT, 'end', now);
  assert.equal(end.target, 'end');
  assert.equal(end.distanceLabel, 'DTE');
  assert.equal(end.distance.text, '5.20');
  // Without a route there is only the waypoint.
  assert.equal(navView({ distance: NM }, KNOT, 'end', now).target, 'wpt');
});

test('speed average over a window, weighted by time', () => {
  const avg = new SpeedAverage(10 * 60000);
  const t0 = 1000000;
  assert.equal(avg.value(t0), undefined);
  avg.add(4, t0);
  avg.add(6, t0 + 5 * 60000);
  // 5 minutes at 4, 5 minutes at 6.
  assert.equal(avg.value(t0 + 10 * 60000), 5);
  // Many samples in a short burst do not outweigh the rest.
  for (let i = 1; i <= 10; i++) {
    avg.add(10, t0 + 10 * 60000 + i * 100);
  }
  assert.ok(avg.value(t0 + 10 * 60000 + 1000) < 6.1);
  // Old samples drop out of the window.
  assert.equal(avg.value(t0 + 30 * 60000), 10);
});

test('the name of the next point', () => {
  const route = { feature: { properties: { coordinatesMeta: [{ name: 'Start' }, {}, { name: 'Aventura' }] } } };
  assert.equal(pointName({ activeRoute: { pointIndex: 2, pointTotal: 3 } }, route), 'Aventura');
  assert.equal(pointName({ activeRoute: { pointIndex: 1, pointTotal: 3 } }, route), 'WPT 2');
  assert.equal(pointName({ activeRoute: { pointIndex: 0, pointTotal: 3, reverse: true } }, route), 'Aventura');
  assert.equal(pointName({ activeRoute: null }, null, { name: 'Mooring' }), 'Mooring');
  assert.equal(pointName({}, null, null), 'Waypoint');
  assert.equal(pointName({ nextPoint: { name: 'Funafuti' }, activeRoute: { pointIndex: 1 } }, route), 'Funafuti');
});
