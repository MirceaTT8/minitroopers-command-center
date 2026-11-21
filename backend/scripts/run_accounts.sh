#!/bin/bash

prefix="$(cd "$(dirname "$0")" && pwd)"
mode_flags=()

# 1. Parse CLI flags
for arg in "$@"; do
    case "$arg" in
        --scrape-only|-s|--sync)
            mode_flags+=("--scrape-only")
            ;;
        --request-upgrade|-u)
            mode_flags+=("--request-upgrade")
            ;;
        --auto-buy-missions)
            mode_flags+=("--auto-buy-missions")
            ;;
        --no-auto-buy-missions)
            mode_flags+=("--no-auto-buy-missions")
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

# 3. Source secret.cfg (populates accounts and accounts_recruiter arrays)
source "$secret_file"

# Fallback if secret.cfg has raw "user:pass" strings outside accounts=()
if [[ ${#accounts[@]} -eq 0 ]]; then
    stripped_content=$(awk '
        /accounts_recruiter[ \t]*=[ \t]*\(/ { in_rec=1; next }
        in_rec && /\)/ { in_rec=0; next }
        !in_rec { print }
    ' "$secret_file")
    while IFS= read -r item; do
        [[ -z "$item" ]] && continue
        accounts+=("${item//\"/}")
    done < <(echo "$stripped_content" | grep -Eo '"[^"]+:[^"]+"')
fi

if [[ ${#accounts[@]} -eq 0 ]]; then
    echo "error: No \"user:pass\" accounts found in $secret_file"
    exit 1
fi

# 4. Execute troopers.sh for each account
# 4. Execute troopers.sh for each account
for entry in "${accounts[@]}"; do
    clean_entry="${entry//\"/}"
    user="${clean_entry%%:*}"
    pass="${clean_entry#*:}"

    "$prefix/troopers.sh" "${mode_flags[@]}" "$user" "$pass"
done