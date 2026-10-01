# Use your Mac’s Ollama coach from your phone

PowerBuild calls a private gateway on your Mac through an HTTPS Cloudflare Quick Tunnel. The gateway listens only on `127.0.0.1:11435`, requires a private token, and forwards requests only to the original experimental `workout-coach` model. Ollama stays on `127.0.0.1:11434`. Your phone uses the normal signed-in PowerBuild Coach page; it never receives the gateway token.

Initial setup must create the protected configuration at `$HOME/workout-ai/powerbuild-connector/config.json`, install the official `cloudflared` binary, and configure the matching Vercel project’s server-only coach variables. Those files and secrets stay outside this repository. Do not paste the token into chat, a public URL, or the phone app.

## Start AI when you need it

1. Open Ollama on this Mac and make sure `workout-coach` is installed.
2. Open Terminal in this project’s folder.
3. Run `npm run coach:connect -- --background` (or `node connector/run.mjs --background`). You can also double-click **Start PowerBuild AI.command** in this connector folder in Finder.
4. The launcher continues in the background after this terminal closes. Check its progress with `tail -f "$HOME/workout-ai/powerbuild-connector/launcher.log"` and wait for **“PowerBuild’s deployed AI connection is updated.”** Press Control-C to stop following this log; the background launcher keeps running.
5. Open [PowerBuild](https://personal-workout-tracker-chi.vercel.app) on your phone, sign in, and open **Coach → Ask**.

Keep the Mac online with its lid open. The launcher prevents idle sleep while active; closing the lid, losing internet, or restarting the Mac can interrupt the AI connection. It does not start automatically after a restart. The rest of PowerBuild remains hosted normally.

To run in the foreground for troubleshooting, use `npm run coach:connect` without `--background` and keep that terminal open. Its progress appears directly in the terminal. Background progress is saved in a private log outside the repository; the launcher does not log your questions, model answers, or gateway token.

Each start creates a new temporary HTTPS tunnel address. The launcher updates only `COACH_GATEWAY_URL` in the configured Vercel production project and rebuilds the source already deployed at the app URL. It does not upload your local working tree, training files, vault notes, or models. Allow a few minutes for that redeployment before asking questions from the phone. Your Vercel account must still be signed in through its normal CLI flow. If access expires, run `npx --yes vercel@62.0.0 login` and restart the launcher.

If this Mac’s normal DNS cannot resolve a new tunnel address, the launcher verifies that address through Cloudflare’s HTTPS DNS service for its own status checks. HTTPS certificate and hostname verification stay enabled. It does not change the Mac’s DNS settings.

## Check or stop

```sh
node connector/run.mjs --status
node connector/run.mjs --stop
```

For a foreground launcher, you can also press **Control-C** in its terminal. Stopping shuts down only this launcher's gateway, tunnel, and keep-awake children. It leaves Ollama running and does not stop unrelated processes. One launcher may run at a time; it refuses to take over an occupied port or another live launcher's lock.

If the launcher was forcibly terminated, its gateway or tunnel may remain active. `--status` reports a stopped launcher and occupied port separately. `--stop` leaves those unowned processes untouched. Resolve their ownership before stopping them and restarting; the launcher never takes over an occupied port.

## Initial setup verification

```sh
node connector/run.mjs --no-publish
```

This starts and verifies the authenticated gateway and HTTPS tunnel but does not change Vercel. The private `runtime.json` next to `config.json` records the current tunnel URL and launcher PID without the token. It is intended for the initial setup process, which configures Vercel and deploys the new app integration separately. This mode alone does not enable phone AI.

The coach remains experimental. Fine-tuned candidates have not passed their quality checks, so the gateway uses the original `workout-coach` preset. Starting the connector does not retrain the model. Stopping the Mac connector makes AI unavailable until you start it again.
