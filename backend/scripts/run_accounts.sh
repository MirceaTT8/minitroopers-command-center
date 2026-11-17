#!/bin/bash

prefix="$(cd "$(dirname "$0")" && pwd)"
scrape_flag=""

# 1. Parse CLI flags
for arg in "$@"; do
    case "$arg" in
        --scrape-only|-s|--sync)
            scrape_flag="--scrape-only"
            ;;
    esac
done

# 2. Locate secret.cfg (checks scripts/ first, then config/)
if [[ -f "$prefix/secret.cfg" ]]; then
    secret_file="$prefix/secret.cfg"
elif [[ -f "$prefix/../config/secret.cfg" ]]; then
    secret_file="$prefix/../config/secret.cfg"
else
    echo "error: secret.cfg not found in $prefix or $prefix/../config"
    exit 1
fi

# 3. Source secret.cfg and extract all "user:pass" pairs
source "$secret_file"

# If secret.cfg defines accounts=("user1:pass1" "user2:pass2"), use it;
# otherwise extract all quoted "user:pass" strings directly from the file.
if [[ ${#accounts[@]} -eq 0 ]]; then
    mapfile -t accounts < <(grep -Eo '"[^"]+:[^"]+"' "$secret_file" | tr -d '"')
fi

if [[ ${#accounts[@]} -eq 0 ]]; then
    echo "error: No \"user:pass\" accounts found in $secret_file"
    exit 1
fi

# 4. Run troopers.sh for each account, forwarding --scrape-only if enabled
for entry in "${accounts[@]}"; do
    user="${entry%%:*}"
    pass="${entry#*:}"

    if [[ -n "$scrape_flag" ]]; then
        "$prefix/troopers.sh" "$scrape_flag" "$user" "$pass"
    else
        "$prefix/troopers.sh" "$user" "$pass"
    fi
done