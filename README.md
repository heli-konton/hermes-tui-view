# TUI View for Hermes Desktop

Chat view when you want to read; the real `hermes --tui` when you want to code.
One hotkey flips the focused session between them without leaving the app —
the "Chat & CLI views" gesture from [Ghostex](https://github.com/maddada/Ghostex),
for Hermes.

- **⇧⌘U** (rebindable: *Toggle TUI view*) or the **TUI / Chat** chip in the
  status bar.
- The TUI runs `hermes --tui --resume <session>` in a fresh terminal tab titled
  `TUI`, on the gateway your Sessions list is pointed at — **This device**, or an
  **SSH gateway**, so a remote session resumes on the host that owns it.
- Toggling back collapses the terminal pane to its rail; the TUI keeps running.
  Toggle again and you are back in it (no second `hermes` is spawned for the
  same session).
- An unsent draft in the composer is copied to the clipboard when you switch,
  so it comes with you — paste it into the TUI.
- ⌘K: *TUI View: toggle chat ⇄ TUI*, *TUI View: back to chat*.

## Requirements

- Hermes Desktop with the `host.terminal` SDK door
  ([NousResearch/hermes-agent PR](https://github.com/NousResearch/hermes-agent/pulls?q=host.terminal)).
  On an older app the controls appear and explain what is missing.
- `hermes` on the interactive shell's PATH (the bundled Desktop payload links it
  into `~/.local/bin`; an SSH gateway already requires Hermes on the remote host).
- A URL/token or cloud gateway has no shell here, so its sessions cannot be
  resumed from this window's terminal: add that host as an **SSH gateway**
  (Settings ▸ Connections) and pick it in Sessions.

## Install

Standalone desktop plugin (hot-loads, no build step):

```sh
mkdir -p ~/.hermes/desktop-plugins/tui-view
curl -fsSL https://raw.githubusercontent.com/heli-konton/hermes-tui-view/main/desktop/plugin.js \
  -o ~/.hermes/desktop-plugins/tui-view/plugin.js
```

Or as a unified package once it is in the catalog: `hermes plugins install tui-view`,
then flip it on in Capabilities ▸ Plugins.

## Trust model

This plugin never types into your shell. The only terminal verb the SDK offers
(`host.terminal.openSession`) resumes a Hermes session in the TUI — the same
thing the session menu's **Open in terminal** does, in-app — and the command is
echoed in the terminal exactly as if you had typed it. Everything else is panes
and state: `@hermes/plugin-sdk` only, no DOM poking, no `eval`, no network.

## Development

`desktop/plugin.js` is plain ESM — edit, save, the app hot-reloads it.
`node --check desktop/plugin.js` catches syntax slips; `node test/contract.test.mjs`
runs the SDK-mocked contract tests.

MIT.
