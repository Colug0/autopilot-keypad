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

// A plotter extension: offers the autopilot keypad as a window in chart
// plotters such as Freeboard-SK. The server side only publishes the manifest
// and serves the pages; everything else runs in the plotter.

const fs = require('fs')
const path = require('path')
const pkg = require('./package.json')

const PLUGIN_ID = 'autopilot-keypad'
const ASSET_BASE = `/plotterext/${PLUGIN_ID}`
const PUBLIC_DIR = path.join(__dirname, 'public')
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
}

function manifest() {
  return {
    name: 'Autopilot keypad',
    description: 'Autopilot control laid out like a pilot keypad, for any Autopilot API pilot.',
    version: pkg.version,
    apiVersion: '1',
    requires: ['panels.iframe', 'windows', 'background.iframe', 'buttons', 'events.publish', 'signalk.stream'],
    optional: ['state.storage', 'nightMode', 'buttons.decorations'],
    buttons: [
      {
        id: 'autopilot-keypad',
        title: 'Autopilot keypad',
        slot: 'mapToolbar',
        icon: 'assistant_navigation',
        action: { type: 'publish', topic: `${PLUGIN_ID}.toggle`, scope: 'extension' }
      }
    ],
    panels: [
      {
        id: 'keypad',
        title: 'Autopilot',
        type: 'iframe',
        url: `${ASSET_BASE}/keypad.html`
      }
    ],
    background: [
      {
        id: 'runtime',
        title: 'Autopilot keypad',
        type: 'iframe',
        url: `${ASSET_BASE}/runtime.html`
      }
    ]
  }
}

// Serves the files in public/ without a dependency on the server's Express.
function serveAssets(req, res, next) {
  const name = path.posix.normalize(decodeURIComponent(req.path || '/')).replace(/^\/+/, '')
  const file = path.join(PUBLIC_DIR, name)
  const type = TYPES[path.extname(file)]
  if (!name || !type || !file.startsWith(PUBLIC_DIR + path.sep) || (req.method !== 'GET' && req.method !== 'HEAD')) {
    return next()
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      return next()
    }
    res.setHeader('Content-Type', type)
    res.setHeader('Cache-Control', 'no-cache')
    res.end(req.method === 'HEAD' ? undefined : data)
  })
}

module.exports = (app) => {
  let running = false
  let mounted = false

  return {
    id: PLUGIN_ID,
    name: 'Autopilot keypad (plotter extension)',
    description: 'Autopilot keypad window for chart plotters with plotter extensions',
    schema: () => ({ type: 'object', properties: {} }),

    start() {
      running = true
      if (!mounted) {
        // A route cannot be removed again, so it is added once. The pages are
        // inert without the manifest, which a stopped plugin no longer lists.
        app.use(ASSET_BASE, serveAssets)
        mounted = true
      }
      app.registerResourceProvider({
        type: 'plotterExtensions',
        methods: {
          listResources: async () => (running ? { [PLUGIN_ID]: manifest() } : {}),
          getResource: async (id) => {
            if (!running || id !== PLUGIN_ID) {
              throw new Error(`No such plotterExtensions resource: ${id}`)
            }
            return manifest()
          },
          setResource: async () => {
            throw new Error(`${PLUGIN_ID} is a read-only provider`)
          },
          deleteResource: async () => {
            throw new Error(`${PLUGIN_ID} is a read-only provider`)
          }
        }
      })
    },

    stop() {
      running = false
    }
  }
}

module.exports.manifest = manifest
