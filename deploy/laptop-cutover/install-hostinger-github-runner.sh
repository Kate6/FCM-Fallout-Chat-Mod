#!/usr/bin/env bash
set -euo pipefail
token=${1:?GitHub runner registration token required}
repo=${2:-https://github.com/UNN-Devotek/FCM-Fallout-Chat-Mod}
root=/opt/actions-runner
mkdir -p "$root" && cd "$root"
curl -fsSL -o runner.tar.gz https://github.com/actions/runner/releases/latest/download/actions-runner-linux-x64-2.330.0.tar.gz
tar xzf runner.tar.gz && rm runner.tar.gz
./config.sh --unattended --url "$repo" --token "$token" --name hostinger-fcm-prod --labels fcm-hostinger-prod --work _work
./svc.sh install root
./svc.sh start
