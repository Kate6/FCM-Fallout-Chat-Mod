#!/usr/bin/env bash
set -euo pipefail
token=${1:?GitHub runner registration token required}
repo=${2:-https://github.com/UNN-Devotek/FCM-Fallout-Chat-Mod}
root=/opt/actions-runner
user=fcmrunner
id "$user" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$user"
mkdir -p "$root" && chown -R "$user:$user" "$root" && cd "$root"
curl -fsSL -o runner.tar.gz https://github.com/actions/runner/releases/download/v2.337.0/actions-runner-linux-x64-2.337.0.tar.gz
tar xzf runner.tar.gz && rm runner.tar.gz
runuser -u "$user" -- ./config.sh --unattended --url "$repo" --token "$token" --name hostinger-fcm-prod --labels fcm-hostinger-prod --work _work
usermod -aG docker "$user"
./svc.sh install root
./svc.sh start
