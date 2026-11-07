// TUI View — one hotkey switches the focused chat into the real `hermes --tui`
// inside the app's terminal pane, and back. The Ghostex "Chat & CLI views"
// gesture for Hermes Desktop.
//
// Everything here goes through the plugin SDK. The terminal verb is
// `host.terminal.openSession` (Hermes Desktop with the host.terminal door);
// on an older host the controls stay visible but explain what is missing
// instead of silently doing nothing.

import { atom, haptic, host, KEYBINDS_AREA, PALETTE_AREA, STATUSBAR_AREAS, useValue } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'

const ACTION_TOGGLE = 'tui-view.toggle'
const ACTION_CHAT = 'tui-view.chat'

/** Stored session id → terminal tab we opened for it this app run. A second
 *  toggle reuses the pane instead of stacking another `hermes --tui`. */
const openedTabs = new Map()

const terminalDoor = () => (host.terminal && typeof host.terminal.openSession === 'function' ? host.terminal : null)

function notifyWarn(message) {
  host.notify({ kind: 'warning', message })
}

/** Carry the unsent draft along: the TUI's input is not reachable from the
 *  renderer, so the next best thing is the clipboard, said out loud. */
async function carryDraft(ctx, sessionId) {
  const draft = typeof host.composer?.getDraft === 'function' ? await host.composer.getDraft(sessionId) : null
  const text = (draft ?? '').trim()

  if (!text) {
    return
  }

  const copied = await ctx.os.writeClipboard(text)

  if (copied) {
    host.notify({ kind: 'info', message: 'Your draft is on the clipboard — paste it into the TUI.' })
  }
}

function switchToTui(ctx) {
  const terminal = terminalDoor()

  if (!terminal) {
    notifyWarn('This Hermes Desktop has no host.terminal door yet — update the app to use TUI View.')

    return
  }

  const sessionId = host.state.focusedStoredSessionId.get()

  if (!sessionId) {
    notifyWarn('Focus a chat with a saved session first — a brand-new empty draft has nothing to resume.')

    return
  }

  if (openedTabs.has(sessionId)) {
    terminal.setTakeover(true)

    return
  }

  if (!terminal.canOpenSession()) {
    notifyWarn(
      'The active gateway has no shell here. Add it as an SSH gateway (Settings ▸ Connections) so the TUI can run where the session lives.'
    )

    return
  }

  const result = terminal.openSession(sessionId, {
    profile: host.state.focusedSessionProfile.get(),
    cwd: host.state.cwd.get(),
    title: 'TUI'
  })

  if (!result.ok) {
    notifyWarn(result.error)

    return
  }

  openedTabs.set(sessionId, result.terminalId)
  void carryDraft(ctx, sessionId)
}

function backToChat() {
  const terminal = terminalDoor()

  if (terminal) {
    terminal.setTakeover(false)
  }

  if (typeof host.composer?.focus === 'function') {
    host.composer.focus(null)
  }
}

function toggle(ctx) {
  haptic('tap')

  const terminal = terminalDoor()

  if (terminal && terminal.takeover.get()) {
    backToChat()
  } else {
    switchToTui(ctx)
  }
}

/** Statusbar chip mirroring the pane: `TUI` when the chat is showing, `Chat`
 *  while the terminal has taken over. Theme vars only — never a hardcoded color. */
// Older hosts have no takeover atom; a constant one keeps the hook order fixed.
const $noTakeover = atom(false)

function TuiChip({ ctx }) {
  const terminal = terminalDoor()
  const inTui = useValue(terminal ? terminal.takeover : $noTakeover)

  return jsxs('button', {
    type: 'button',
    title: inTui ? 'Back to chat (⇧⌘U)' : 'Switch this chat to the TUI (⇧⌘U)',
    onClick: () => toggle(ctx),
    className: 'flex items-center gap-1 px-1.5 text-[0.6875rem]',
    style: { color: inTui ? 'var(--ui-accent)' : 'var(--ui-text-tertiary)' },
    children: [
      jsx('span', { 'aria-hidden': true, children: inTui ? '▣' : '▢' }),
      jsx('span', { children: inTui ? 'Chat' : 'TUI' })
    ]
  })
}

const plugin = {
  id: 'tui-view',
  name: 'TUI View',
  description: 'Switch the focused chat between the chat view and the real hermes --tui in the terminal pane — one hotkey, and back.',
  register(ctx) {
    ctx.registerMany([
      {
        id: 'chip',
        area: STATUSBAR_AREAS.right,
        order: 85,
        render: () => jsx(TuiChip, { ctx })
      },
      {
        id: 'toggle-key',
        area: KEYBINDS_AREA,
        data: {
          id: ACTION_TOGGLE,
          label: 'Toggle TUI view',
          category: 'view',
          defaults: ['mod+shift+u'],
          run: () => toggle(ctx)
        }
      },
      {
        id: 'toggle',
        area: PALETTE_AREA,
        data: {
          id: ACTION_TOGGLE,
          action: ACTION_TOGGLE,
          label: 'TUI View: toggle chat ⇄ TUI',
          keywords: ['tui', 'terminal', 'cli', 'chat', 'view', 'toggle'],
          run: () => toggle(ctx)
        }
      },
      {
        id: 'chat',
        area: PALETTE_AREA,
        data: {
          id: ACTION_CHAT,
          label: 'TUI View: back to chat',
          keywords: ['tui', 'chat', 'back', 'view'],
          run: () => backToChat()
        }
      }
    ])
  }
}

export default plugin
