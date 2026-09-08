#!/usr/bin/env bash
set -euo pipefail

# Explicit, immutable release only. This never deletes or changes another app.
commit="${1:?Usage: install-release.sh <40-character commit> <git-archive.tar.gz>}"
archive="${2:?Archive is required}"
[[ "$commit" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid commit' >&2; exit 1; }
[[ "$EUID" == 0 ]] || { echo 'Run this scoped installer as root' >&2; exit 1; }
[[ -f "$archive" && ! -L "$archive" ]] || { echo 'Archive not found' >&2; exit 1; }
root_dir=/opt/money-markets
release_dir="$root_dir/releases/$commit"
[[ ! -e "$release_dir" ]] || { echo 'Release already exists; do not overwrite it' >&2; exit 1; }
[[ ! -e "$root_dir/current" || -L "$root_dir/current" ]] || { echo 'Current must be a managed symlink' >&2; exit 1; }
if ! id money-markets >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/money-markets --shell /usr/sbin/nologin money-markets
fi
install -d -o root -g money-markets -m 0750 "$root_dir" "$root_dir/releases"
[[ "$(realpath "$root_dir/releases")" == /opt/money-markets/releases ]] || { echo 'Unexpected release root' >&2; exit 1; }
node_dir="$root_dir/node-v22.23.0"
if [[ ! -e "$node_dir" ]]; then
  node_archive=/tmp/money-markets-node-v22.23.0.tar.xz
  curl -fsSL --max-time 120 --output "$node_archive" https://nodejs.org/dist/v22.23.0/node-v22.23.0-linux-x64.tar.xz
  printf '%s  %s\n' '14d7de44f235534799f8b171a4050d9a6a4bc99c87e053a25d3d54afa580aa20' "$node_archive" | sha256sum --check --status
  install -d -o root -g money-markets -m 0755 "$node_dir"
  tar -xJf "$node_archive" -C "$node_dir" --strip-components=1 --no-same-owner
fi
[[ "$("$node_dir/bin/node" --version)" == v22.23.0 ]] || { echo 'Unexpected collector Node runtime' >&2; exit 1; }
install -d -o money-markets -g money-markets -m 0750 "$release_dir"
install -d -o money-markets -g money-markets -m 0700 /var/lib/money-markets
install -d -o root -g money-markets -m 0750 /etc/money-markets
if [[ ! -e /etc/money-markets/token ]]; then
  umask 0077
  openssl rand -hex -out /etc/money-markets/token 32
  chown root:money-markets /etc/money-markets/token
  chmod 0640 /etc/money-markets/token
fi

# Only deploy a git archive produced from the reviewed repository. No env/data files.
tar -xzf "$archive" -C "$release_dir" --no-same-owner
chown -R money-markets:money-markets "$release_dir"
cd "$release_dir"
runuser -u money-markets -- env PATH="$node_dir/bin:/usr/bin:/bin" npm_config_cache=/var/lib/money-markets/npm-cache npm ci --include=dev --no-audit --no-fund
runuser -u money-markets -- env PATH="$node_dir/bin:/usr/bin:/bin" "$node_dir/bin/node" --import tsx --test --test-reporter=dot tests/*.test.ts
runuser -u money-markets -- env PATH="$node_dir/bin:/usr/bin:/bin" npm_config_cache=/var/lib/money-markets/npm-cache npm run typecheck
# The runtime can write only its state, not the deployed application.
chown -R root:money-markets "$release_dir"
install -m 0644 deploy/hostinger/money-markets-collector.service /etc/systemd/system/money-markets-collector.service
ln -sfn "$release_dir" "$root_dir/current"
systemctl daemon-reload
systemctl enable money-markets-collector.service
systemctl restart money-markets-collector.service
systemctl is-active --quiet money-markets-collector.service
echo "Collector release active: $commit"
