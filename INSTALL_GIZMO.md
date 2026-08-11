# Install Gizmo OS v2 on the VPS

This repository uses a phased, fail-closed installer. Read [`docs/GIZMO_VPS_INSTALLER.md`](docs/GIZMO_VPS_INSTALLER.md) and [`docs/GIZMO_PHASE_GATES.md`](docs/GIZMO_PHASE_GATES.md) before changing production.

## 1. Host prerequisites

```bash
sudo bash scripts/gizmo-install-host.sh
sudo install -m 0600 config/gizmo.env.example /etc/gizmo/gizmo.env
sudo chown "$USER":"$USER" /etc/gizmo/gizmo.env
```

Edit `/etc/gizmo/gizmo.env`. Replace every placeholder, pin every container image, and leave destructive/cutover approval flags false until the relevant checkpoint is reviewed.

## 2. Codex operator tool

```bash
bash scripts/gizmo-install-codex.sh
```

Never run Codex as root.

## 3. Execute one phase at a time

```bash
export GIZMO_ENV_FILE=/etc/gizmo/gizmo.env
bash scripts/gizmo-install.sh 00
bash scripts/gizmo-install.sh 01
bash scripts/gizmo-install.sh 02
```

Continue only when the prior checkpoint passes. Database and final-production phases require explicit owner approval in `/etc/gizmo/gizmo.env`.

## 4. Full install

Only after every application runtime is implemented and certified:

```bash
export GIZMO_ENV_FILE=/etc/gizmo/gizmo.env
bash scripts/gizmo-install.sh all
```

## 5. Final truth test

```bash
node scripts/gizmo-verify-complete.js
```

If this command fails, the VPS does **not** yet completely match the GitHub Gizmo build. Do not bypass the failure with readiness-marker files.
