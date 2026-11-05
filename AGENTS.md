# Localens project rules

## Git workflow

- After completing each requested task or update, run the relevant checks and create one focused Git commit on the current branch.
- Stage only files changed for that task. Never use broad staging commands such as `git add -A` or `git add .` when unrelated changes may exist.
- Do not push commits unless the user explicitly asks.
- Never commit secrets, credentials, model caches, runtime logs, downloaded user media, `.gpu/`, `node_modules/`, `dist/`, or browser-test artifacts.
- If required checks fail, report the failure instead of silently committing broken work.

## Cost and privacy

- Use only local, open-source, or otherwise free-to-use inference. Do not add paid APIs, subscriptions, credits, or services requiring billing.
- Keep media off public services. GPU inference must use the private SSH/Tailscale loopback tunnel documented in `README.md`, with browser-local inference as fallback.
