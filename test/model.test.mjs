import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  available, choices, modeKey, pickPilot, requestsFor, rudderView, valuesFor, windSide, headingText, failureText
} from '../src/model.mjs';

const rad = (d) => (d * Math.PI) / 180;

// signalk-autopilot (B&G / Simrad): the modes are states.
const simrad = (state, engaged = state !== 'standby') => ({
  state,
  mode: null,
  target: null,
  engaged,
  options: {
    states: [
      { name: 'standby', engaged: false },
      { name: 'auto', engaged: true },
      { name: 'noDrift', engaged: true },
      { name: 'wind', engaged: true },
      { name: 'route', engaged: true }
    ],
    modes: [],
    actions: []
  }
});

// pypilot: one engaged state, the modes as modes.
const pypilot = (engaged, mode = 'compass') => ({
  state: engaged ? 'enabled' : 'disabled',
  mode,
  target: rad(120),
  engaged,
  options: {
    states: [{ name: 'enabled', engaged: true }, { name: 'disabled', engaged: false }],
    modes: ['compass', 'gps', 'wind', 'true wind'],
    actions: [{ id: 'tack', name: 'Tack', available: true }]
  }
});

test('modes named as states', () => {
  assert.equal(modeKey(simrad('standby')), 'standby');
  assert.equal(modeKey(simrad('auto')), 'auto');
  assert.equal(modeKey(simrad('noDrift')), 'noDrift');
  assert.deepEqual(choices(simrad('auto')), ['auto', 'noDrift', 'wind', 'route']);
  assert.deepEqual(requestsFor(simrad('standby'), 'auto'), [{ method: 'PUT', path: 'state', body: { value: 'auto' } }]);
  assert.deepEqual(requestsFor(simrad('auto'), 'wind'), [{ method: 'PUT', path: 'state', body: { value: 'wind' } }]);
  assert.deepEqual(requestsFor(simrad('wind'), 'standby'), [{ method: 'PUT', path: 'state', body: { value: 'standby' } }]);
  assert.deepEqual(requestsFor(simrad('auto'), 'mode:route'), [{ method: 'PUT', path: 'state', body: { value: 'route' } }]);
});

test('modes as modes of one engaged state', () => {
  assert.equal(modeKey(pypilot(false)), 'standby');
  assert.equal(modeKey(pypilot(true, 'wind')), 'wind');
  assert.deepEqual(choices(pypilot(true)), ['compass', 'gps', 'wind', 'true wind']);
  assert.deepEqual(requestsFor(pypilot(false), 'auto'), [
    { method: 'PUT', path: 'mode', body: { value: 'compass' } },
    { method: 'POST', path: 'engage' }
  ]);
  assert.deepEqual(requestsFor(pypilot(true), 'wind'), [{ method: 'PUT', path: 'mode', body: { value: 'wind' } }]);
  assert.deepEqual(requestsFor(pypilot(true), 'standby'), [{ method: 'POST', path: 'disengage' }]);
});

test('no pilot', () => {
  assert.equal(modeKey(null), undefined);
  assert.deepEqual(requestsFor(null, 'auto'), []);
  assert.equal(modeKey({ state: null, mode: null, engaged: false, options: {} }), undefined);
});

test('a pilot it cannot reach', () => {
  const gone = { ...simrad('standby'), state: 'off-line' };
  assert.equal(modeKey(gone), 'off-line');
  assert.deepEqual(requestsFor(gone, 'auto'), []);
  assert.deepEqual(requestsFor(gone, 'standby'), []);
  assert.deepEqual(available(gone), { auto: false, wind: false, dodge: false, tack: false, gybe: false });
});

test('a pilot without modes engages with AUTO', () => {
  const bare = { state: 'off', mode: null, engaged: false, options: { states: [{ name: 'on', engaged: true }, { name: 'off', engaged: false }], modes: [] } };
  assert.equal(available(bare).auto, true);
  assert.equal(available(bare).wind, false);
  assert.deepEqual(requestsFor(bare, 'auto'), [{ method: 'POST', path: 'engage' }]);
  assert.deepEqual(requestsFor(bare, 'wind'), []);
});

test('steps: + is starboard, in degrees, dodge while dodging', () => {
  assert.deepEqual(requestsFor(simrad('auto'), '+1'), [{ method: 'PUT', path: 'target/adjust', body: { value: 1, units: 'deg' } }]);
  assert.deepEqual(requestsFor(simrad('auto'), '-10'), [{ method: 'PUT', path: 'target/adjust', body: { value: -10, units: 'deg' } }]);
  const dodging = { ...pypilot(true), mode: 'dodge' };
  assert.equal(modeKey(dodging), 'dodge');
  assert.deepEqual(requestsFor(dodging, '+10'), [{ method: 'PUT', path: 'dodge', body: { value: 10, units: 'deg' } }]);
  assert.deepEqual(requestsFor(dodging, 'dodge'), [{ method: 'DELETE', path: 'dodge' }]);
  assert.deepEqual(requestsFor(pypilot(true), 'dodge'), [{ method: 'POST', path: 'dodge' }]);
});

test('actions only when offered', () => {
  assert.deepEqual(available(simrad('auto')), { auto: true, wind: true, dodge: false, tack: false, gybe: false });
  assert.equal(available(pypilot(true)).tack, true);
  // The deltas' list wins over the options.
  assert.equal(available({ ...pypilot(true), availableActions: ['dodge'] }).tack, false);
  assert.equal(available({ ...pypilot(true), availableActions: ['dodge'] }).dodge, true);
  assert.deepEqual(requestsFor(pypilot(true), 'tack:port'), [{ method: 'POST', path: 'tack/port' }]);
});

test('values per mode', () => {
  const v = { 'navigation.headingMagnetic': rad(87), 'steering.autopilot.target.headingTrue': rad(149) };
  const value = (p) => v[p];
  const heading = { label: 'Heading', kind: 'heading', text: '087', unit: '°M' };
  assert.deepEqual(valuesFor('standby', value), [heading]);
  // The API's target wins; the pilot's own path only names it true.
  assert.deepEqual(valuesFor('auto', value, rad(149.2)), [heading, { label: 'Target', kind: 'heading', text: '149', unit: '°T' }]);
  assert.deepEqual(valuesFor('auto', value, rad(10))[1], { label: 'Target', kind: 'heading', text: '010', unit: '°' });
  assert.deepEqual(valuesFor('auto', value, null)[1], { label: 'Target', kind: 'heading', text: '149', unit: '°T' });
  assert.equal(valuesFor('noDrift', value, rad(5))[1].label, 'Bearing');
  // Without the pilot's own target: the API's, with no true or magnetic.
  assert.deepEqual(valuesFor('compass', () => undefined, rad(120))[1], { label: 'Target', kind: 'heading', text: '120', unit: '°' });
  const wind = valuesFor('wind', (p) => (p === 'environment.wind.angleApparent' ? rad(-35) : undefined), rad(40));
  assert.deepEqual(wind, [
    { label: 'Wind', kind: 'wind', degrees: 35, side: 'port' },
    { label: 'Target', kind: 'wind', degrees: 40, side: 'stbd' }
  ]);
});

test('rudder', () => {
  assert.equal(rudderView(undefined), undefined);
  assert.deepEqual(rudderView(rad(4)), { text: 'Rudder 4° stb', side: 'stbd', share: 4 / 35 });
  assert.equal(rudderView(rad(-40)).text, 'Rudder 40° port');
  assert.equal(rudderView(rad(-40)).share, 1);
  assert.equal(rudderView(rad(0.2)).text, 'Rudder 0°');
});

test('helpers', () => {
  assert.equal(headingText(rad(-1)), '359');
  assert.deepEqual(windSide(rad(328)), { degrees: 32, side: 'port' });
  assert.equal(pickPilot({ a: { isDefault: false }, b: { isDefault: true } }), 'b');
  assert.equal(pickPilot({ a: {} }), 'a');
  assert.equal(pickPilot({}), null);
  assert.equal(failureText(403), 'Log in to Signal K to steer');
  assert.equal(failureText(500, 'Device busy'), 'Device busy [500]');
});
