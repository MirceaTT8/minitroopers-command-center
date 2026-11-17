#!/bin/bash

prefix="$(cd "$(dirname "$0")" && pwd)"
mode_flag=""

# 1. Parse CLI flags
for arg in "$@"; do
    case "$arg" in
        --scrape-only|-s|--sync)
            mode_flag="--scrape-only"
            ;;
        --request-upgrade|-u)
            mode_flag="--request-upgrade"
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

if [[ ${#accounts[@]} -eq 0 ]]; then
    mapfile -t accounts < <(grep -Eo '"[^"]+:[^"]+"' "$secret_file" | tr -d '"')
fi

if [[ ${#accounts[@]} -eq 0 ]]; then
    echo "error: No \"user:pass\" accounts found in $secret_file"
    exit 1
fi

# 4. Execute troopers.sh for each account
for entry in "${accounts[@]}"; do
    user="${entry%%:*}"
    pass="${entry#*:}"

    if [[ -n "$mode_flag" ]]; then
        "$prefix/troopers.sh" "$mode_flag" "$user" "$pass"
    else
        "$prefix/troopers.sh" "$user" "$pass"
    fi
done