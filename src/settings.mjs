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

// Where this device's settings live: in this browser when the host can keep
// them there, otherwise with the user.
export function settingsScope(client) {
  return client.hasCapability('state.storage')
    ? { scope: 'extension', storage: 'device' }
    : 'extension';
}

export const TOGGLE_TOPIC = 'autopilot-keypad.toggle';
