// Contract tests for desktop/plugin.js against a mocked @hermes/plugin-sdk.
// Run: node test/contract.test.mjs   (Node >= 22, no dependencies)
//
// The plugin is plain ESM importing bare specifiers the Desktop resolves at
// runtime; here a loader hook maps them to in-memory mocks so the registration
// shape and the toggle logic can be exercised without the app.

import assert from 'node:assert/strict'
import { register } from 'node:module'
import { test } from 'node:test'

const state = {
  focusedStoredSessionId: 'sess-1',
  focusedSessionProfile: 'default',
  cwd: '/repo',
  takeover: false,
  openCalls: [],
  notices: [],
  canOpen: true,
  draft: '',
  clipboard: null
}

globalThis.__tuiViewMockState = state

register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (specifier === '@hermes/plugin-sdk') return { url: 'mock:sdk', shortCircuit: true }
    if (specifier === 'react/jsx-runtime') return { url: 'mock:jsx', shortCircuit: true }
    return next(specifier, context)
  }
  export async function load(url, context, next) {
    if (url === 'mock:sdk') return { format: 'module', shortCircuit: true, source: SDK }
    if (url === 'mock:jsx') return { format: 'module', shortCircuit: true, source: JSX }
    return next(url, context)
  }
  const JSX = 'export const jsx = (type, props) => ({ type, props }); export const jsxs = jsx'
  const SDK = ${JSON.stringify(`
    const s = globalThis.__tuiViewMockState
    const ro = get => ({ get, subscribe: () => () => {}, listen: () => () => {} })
    export const atom = v => { let cur = v; const subs = new Set(); return { get: () => cur, set: n => { cur = n; subs.forEach(f => f(n)) }, subscribe: f => (subs.add(f), f(cur), () => subs.delete(f)), listen: f => (subs.add(f), () => subs.delete(f)) } }
    export const $takeover = atom(false)
    export const PALETTE_AREA = 'palette.commands'
    export const KEYBINDS_AREA = 'keybinds'
    export const STATUSBAR_AREAS = { left: 'statusBar.left', right: 'statusBar.right' }
    export const useValue = a => a.get()
    export const haptic = () => {}
    export const host = {
      state: {
        focusedStoredSessionId: ro(() => s.focusedStoredSessionId),
        focusedSessionProfile: ro(() => s.focusedSessionProfile),
        cwd: ro(() => s.cwd)
      },
      notify: n => s.notices.push(n),
      composer: { getDraft: async () => s.draft, focus: () => { s.focused = true } },
      terminal: {
        openSession: (id, opts) => { s.openCalls.push({ id, opts }); if (!s.canOpen) return { ok: false, reason: 'no-shell', error: 'no shell' }; $takeover.set(true); return { ok: true, terminalId: 'term-' + s.openCalls.length, command: 'hermes --tui --resume ' + id } },
        canOpenSession: () => s.canOpen,
        setTakeover: v => $takeover.set(v),
        takeover: $takeover
      }
    }
  `)}
`))

const { default: plugin } = await import('../desktop/plugin.js')
const sdk = await import('@hermes/plugin-sdk')

function loadPlugin() {
  const contributions = []
  const ctx = {
    register: c => contributions.push(c),
    registerMany: cs => contributions.push(...cs),
    os: { writeClipboard: async text => ((state.clipboard = text), true) }
  }

  plugin.register(ctx)

  return { contributions, ctx }
}

const byId = (list, id) => list.find(c => c.id === id)

test('registers a statusbar chip, one rebindable keybind and two palette commands, SDK areas only', () => {
  const { contributions } = loadPlugin()

  assert.equal(plugin.id, 'tui-view')
  assert.deepEqual(
    contributions.map(c => [c.id, c.area]).sort(),
    [
      ['chat', 'palette.commands'],
      ['chip', 'statusBar.right'],
      ['toggle', 'palette.commands'],
      ['toggle-key', 'keybinds']
    ]
  )
  assert.deepEqual(byId(contributions, 'toggle-key').data.defaults, ['mod+shift+u'])
  assert.equal(byId(contributions, 'toggle').data.action, byId(contributions, 'toggle-key').data.id)
})

test('toggle opens the focused session in the TUI once, then only flips takeover', async () => {
  const { contributions } = loadPlugin()
  const run = byId(contributions, 'toggle-key').data.run

  state.draft = 'half-typed prompt'
  run()
  await new Promise(r => setTimeout(r, 0))

  assert.equal(state.openCalls.length, 1)
  assert.deepEqual(state.openCalls[0], { id: 'sess-1', opts: { profile: 'default', cwd: '/repo', title: 'TUI' } })
  assert.equal(sdk.host.terminal.takeover.get(), true)
  assert.equal(state.clipboard, 'half-typed prompt', 'the draft rides along on the clipboard')

  run() // back to chat
  assert.equal(sdk.host.terminal.takeover.get(), false)
  assert.equal(state.focused, true, 'the composer gets the caret back')

  run() // into the TUI again: reuse, no second hermes
  assert.equal(sdk.host.terminal.takeover.get(), true)
  assert.equal(state.openCalls.length, 1)
})

test('refuses politely without a focused session or a shell on the gateway', () => {
  const { contributions } = loadPlugin()
  const run = byId(contributions, 'toggle').data.run

  sdk.host.terminal.setTakeover(false)
  state.notices.length = 0
  state.openCalls.length = 0

  state.focusedStoredSessionId = null
  run()
  assert.equal(state.openCalls.length, 0)
  assert.match(state.notices.at(-1).message, /Focus a chat/)

  state.focusedStoredSessionId = 'sess-2'
  state.canOpen = false
  run()
  assert.equal(state.openCalls.length, 0)
  assert.match(state.notices.at(-1).message, /SSH gateway/)
  assert.equal(sdk.host.terminal.takeover.get(), false)
})

test('the chip renders with theme variables only and mirrors takeover', () => {
  const { contributions } = loadPlugin()
  const chip = byId(contributions, 'chip').render()
  const rendered = chip.type({ ctx: {} })

  assert.equal(rendered.type, 'button')
  assert.match(rendered.props.style.color, /^var\(--ui-/)
  assert.equal(rendered.props.children[1].props.children, 'TUI')

  sdk.host.terminal.setTakeover(true)
  assert.equal(chip.type({ ctx: {} }).props.children[1].props.children, 'Chat')
})
