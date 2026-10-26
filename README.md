# Surface lab

Paste a GitHub pull request. The page lists apps the way Confirm what we found does: the scanner in `detect/`, then an agent pass merged on top.

The agent uses the same credential as fw-server. A subscription token wins over an API key:

```bash
export ROLLOUT_CI_LLM_PROVIDER_OAUTH_TOKEN=...
# or, when no subscription token is set:
export ROLLOUT_CI_LLM_PROVIDER_API_KEY=...
```

The model is `claude-sonnet-5`. With neither variable set, the page shows the scanner list and says the agent was skipped.

```bash
bun install
bun test
bun run start
```

Open http://127.0.0.1:8787. The checkout uses your GitHub SSH key.
