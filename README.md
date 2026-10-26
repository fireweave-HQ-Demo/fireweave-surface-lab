# Surface lab

Paste a GitHub pull request. The page lists apps the way Confirm what we found does: the scanner in `detect/`, then an agent pass merged on top.

The agent runs through the Cursor SDK. Set a user or team API key:

```bash
export CURSOR_API_KEY=...
```

The model is `composer-2.5`. With the variable unset, the page shows the scanner list and says the agent was skipped.

```bash
bun install
bun test
bun run cli
```

`bun run cli` asks for a GitHub repository or pull request URL and prints the same list in the terminal. The checkout uses your `gh` login.

`bun run start` serves the page at http://127.0.0.1:8787. That page still expects a pull request URL and checks it out with your GitHub SSH key.
