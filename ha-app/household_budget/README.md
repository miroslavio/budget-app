# Household Budget Home Assistant App

Household Budget is a planning-first UK household budgeting app for expected income, planned spending, savings pots/goals, actual movements, imports/exports, and cashflow forecasting.

This package runs the Node.js, Express, and SQLite app as a Home Assistant app on Home Assistant OS, including Raspberry Pi 4 systems running `aarch64`.

Access is controlled by Home Assistant Ingress. Household Budget does not show a separate email/password login inside Home Assistant. The first two Home Assistant users who open the app are linked as household members for ownership and split calculations.

## Web UI

- Web UI: Home Assistant Ingress
- Internal app port: `3000`
- Health check: `/health`

The app does not expose port `3000` on the local network by default. Home Assistant proxies the web UI through Ingress, so access goes through Home Assistant authentication and remote access.

For development-only direct LAN access, add a port mapping in `config.yaml` locally:

```yaml
ports:
  3000/tcp: 3000
ports_description:
  3000/tcp: "Household Budget development web interface"
webui: "http://[HOST]:[PORT:3000]"
```

Do not enable this by default for production installs.

## Data Storage

The app stores its SQLite database at:

```text
/data/budget.sqlite
```

The `/data` directory is Home Assistant's persistent app storage. The database is not written inside the container image, so restarting or rebuilding the app should preserve data.

The default path comes from `config.yaml` and can be changed through the app option `database_path`. The startup script reads this option from `/data/options.json`.

Back up the database through normal Home Assistant backups, or copy `/data/budget.sqlite` manually from the app container if needed.

## Build Source

The app source used by the Dockerfile lives in:

```text
ha-app/household_budget/app/
```

Refresh it from the repository root before installing or publishing the Home Assistant package:

```bash
sh scripts/sync-ha-app.sh
```

This copies the production app source without `node_modules`, local SQLite data, Git metadata, or the Home Assistant package itself.

## Local Installation

1. Install and start the Samba or SSH app in Home Assistant.
2. Open the Home Assistant `addons` share or folder.
3. Create a folder for the app, for example:

   ```text
   /addons/household_budget
   ```

4. Run `sh scripts/sync-ha-app.sh` from this repository.
5. Copy these files into `/addons/household_budget`:

   ```text
   config.yaml
   Dockerfile
   run.sh
   README.md
   app/
   ```

6. In Home Assistant, go to `Settings -> Apps -> App store`.
7. Use the top-right menu and choose `Check for updates`.
8. The app should appear under local apps.
9. Install it.
10. Start it.
11. Open the web UI through Home Assistant Ingress.

Older Home Assistant versions may still label this area as Add-ons rather than Apps.

## GitHub Repository Installation

1. Push a Home Assistant app repository to GitHub with this structure:

   ```text
   repository.yaml
   household_budget/
   ```

2. In Home Assistant, go to `Settings -> Apps -> App store`.
3. Open repository settings.
4. Add the GitHub repository URL.
5. Check for updates.
6. Install and start `Household Budget`.

The placeholder repository URL in `repository.yaml` should be replaced before publishing.

## Updating

1. Pull or apply the latest app changes.
2. Run `sh scripts/sync-ha-app.sh`.
3. Rebuild or update the Home Assistant app.
4. Restart the app.

The database remains under `/data/budget.sqlite`.

## Logs

View logs from the Home Assistant app details page. Startup should show a line similar to:

```text
UK Household Budget app listening on http://0.0.0.0:3000
```

If startup fails, check for SQLite file permission errors, invalid `config.yaml`, or missing files in `app/`.

## Troubleshooting Invalid config.yaml

- Confirm `slug` contains only lowercase letters, numbers, and underscores.
- Confirm `arch` includes your device architecture. Raspberry Pi 4 usually uses `aarch64`.
- Confirm `ingress: true`.
- Confirm `ingress_port: 3000`.
- Confirm direct `ports` are not enabled unless you are intentionally using a development-only local port.
- Confirm YAML indentation uses spaces, not tabs.
- Confirm the app folder contains `config.yaml`, `Dockerfile`, `run.sh`, `README.md`, and `app/`.

## Notes

The Dockerfile uses `node:22-alpine` directly. Current Home Assistant app packaging no longer relies on Supervisor injecting a `BUILD_FROM` build argument, so the base image is explicit.
