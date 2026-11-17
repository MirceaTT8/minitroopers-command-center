#!/bin/bash

# =========================================================================
# SCRAPE, UPGRADE REQUEST & SAVE RAW HTML FUNCTIONS
# =========================================================================
function saveAccountHtml {
    local account_dir="$data_dir/$login_lower"
    mkdir -p "$account_dir"

    echo "  [Sync] Saving /hq and /t/0 HTML to $account_dir..."
    $curl --output "$account_dir/hq.html" "$site/hq"
    $curl --output "$account_dir/t0.html" "$site/t/0"

    if grep -q 'class="levelup"' "$account_dir/t0.html"; then
        echo "  [Sync] Account $login_original has a pending level-up choice on /t/0!"
        cp "$account_dir/t0.html" "$account_dir/levelup0.html"
    else
        cp "$account_dir/t0.html" "$account_dir/t0_stats.html"
        rm -f "$account_dir/levelup0.html"
    fi
}

function requestSoldierUpgrade {
    local account_dir="$data_dir/$login_lower"
    mkdir -p "$account_dir"

    echo "  [Upgrade] Fetching /t/0 for $login_original..."
    $curl --output "$account_dir/t0.html" "$site/t/0"

    # Case 1: /t/0 is ALREADY on the <table class="levelup"> screen
    if grep -q 'class="levelup"' "$account_dir/t0.html"; then
        echo "  [Upgrade] $login_original is already on the level-up selection screen. Saving options..."
        cp "$account_dir/t0.html" "$account_dir/levelup0.html"
        $curl --output "$account_dir/hq.html" "$site/hq"
        return 0
    fi

    # Case 2: /t/0 is on the normal stats sheet (<table class="tablesheet">).
    # Backup the full stats sheet BEFORE triggering ?levelup=...
    cp "$account_dir/t0.html" "$account_dir/t0_stats.html"

    local levelup_href=""
    levelup_href=$(grep -Eo 'href="(/t/0\?levelup=[^"]+|/levelup/0[^"]*)"' "$account_dir/t0.html" | head -n 1 | tr -d '"')
    levelup_href="${levelup_href#href=}"

    if [[ -n "$levelup_href" ]]; then
        echo "  [Upgrade] Sending upgrade request to $site$levelup_href..."
        $curl -e "$site/t/0" --output "$account_dir/levelup0.html" "$site$levelup_href"

        if grep -q 'class="levelup"' "$account_dir/levelup0.html"; then
            cp "$account_dir/levelup0.html" "$account_dir/t0.html"
        fi
    else
        echo "  [Upgrade] No ?levelup= link found on /t/0. Checking /levelup/0..."
        $curl -e "$site/t/0" --output "$account_dir/levelup0.html" "$site/levelup/0"
    fi

    $curl --output "$account_dir/hq.html" "$site/hq"
    echo "  [Upgrade] Upgrade options saved to $account_dir/levelup0.html."
}

function selectSoldierUpgrade {
    local target_href="$1"
    local account_dir="$data_dir/$login_lower"
    mkdir -p "$account_dir"

    if [[ -z "$target_href" ]]; then
        echo "error: Missing upgrade selection URL"
        exit 1
    fi

    if [[ "$target_href" != /* ]]; then
        target_href="/$target_href"
    fi

    echo "  [Upgrade] Selecting skill via $site$target_href..."
    $curl -e "$site/t/0" --output "$account_dir/t0.html" "$site$target_href"

    rm -f "$account_dir/levelup0.html"
    saveAccountHtml
}

function getMoneyRatio {
    local account_dir="$data_dir/$login_lower"
    local source_file="$account_dir/t0.html"

    if [[ -f "$account_dir/t0_stats.html" ]]; then
        source_file="$account_dir/t0_stats.html"
    fi

    if [[ ! -f "$source_file" ]]; then
        $curl --output "$source_file" "$site/t/0"
    fi

    local money=""
    money=$(awk '/class="money"/{flag=1; next} flag && /[0-9]+/{gsub(/[^0-9]/,""); print; exit}' "$source_file")

    local upgrade_cost=""
    upgrade_cost=$(grep -Eo 'Upgrade for [0-9]+' "$source_file" | grep -Eo '[0-9]+' | head -n 1)

    [[ -z "$money" ]] && money=0
    [[ -z "$upgrade_cost" ]] && upgrade_cost=0

    local should_print="false"
    if [[ "$report" == "always" ]]; then
        should_print="true"
    elif [[ "$report" == "upgradable" && "$money" -ge "$upgrade_cost" ]]; then
        should_print="true"
    fi

    if [[ "$should_print" == "true" ]]; then
        echo "$login_original's money for next upgrade : $money/$upgrade_cost"
    fi
}

# =========================================================================
# MISSION FUNCTIONS
# =========================================================================
function mission {
    echo "========================================="
    echo "Starting Missions phase..."

    local tmp_hq="$cookie_file.hq.html"

    for type in exterminate infiltrate epic; do
        local tip_id=""
        case "$type" in
            exterminate) tip_id="miss_tip" ;;
            infiltrate)  tip_id="infil_tip" ;;
            epic)        tip_id="epic_tip" ;;
        esac

        for i in {1..3}; do
            $curl --output "$tmp_hq" "$site/hq"

            if ! grep -q "mission?t=$type" "$tmp_hq"; then
                echo "  Mission ($type) - no more attempts available today."
                break
            fi

            echo -n "  Running mission ($type) - attempt $i/3... "
            $curl "$site/b/mission?t=$type" > /dev/null

            $curl --output "$tmp_hq" "$site/hq"
            local last_badge=""
            last_badge=$(grep "$tip_id" "$tmp_hq" | grep -Eo 'b(win|defeat)_bg' | tail -n 1)

            if [[ "$last_badge" == "bwin_bg" ]]; then
                echo "WON!"
            else
                echo "LOST!"
            fi
        done
    done

    rm -f "$tmp_hq"
}

# =========================================================================
# BATTLE FUNCTIONS
# =========================================================================
function getFightKey {
    local tmp_opp="$cookie_file.opp.html"
    $curl --output "$tmp_opp" "$site/b/opp"

    local best_opp=""
    best_opp=$(awk '
        BEGIN {
            best_opp = ""
            min_avg = 999999
            troops = 0
            current_opp = ""
            in_po = 0
        }
        /class="backchoose"/ {
            troops = 0
            current_opp = ""
            in_po = 0
        }
        /class="tcard"/ {
            line = $0
            while (match(line, /class="tcard"/)) {
                troops++
                line = substr(line, RSTART + RLENGTH)
            }
        }
        /opp=[0-9]+/ {
            if (match($0, /opp=[0-9]+/)) {
                current_opp = substr($0, RSTART, RLENGTH)
            }
        }
        /<li class="po">/ {
            in_po = 1
        }
        in_po && /^[ \t]*[0-9]+[ \t]*$/ {
            line = $0
            gsub(/[^0-9]/, "", line)
            power = line + 0
            if (current_opp != "" && troops > 0 && power > 0) {
                avg = power / troops
                printf "  [Eval] %-12s | Power: %2d | Troops: %d | Avg: %.2f\n", current_opp, power, troops, avg > "/dev/stderr"
                if (avg < min_avg) {
                    min_avg = avg
                    best_opp = current_opp
                }
            }
            in_po = 0
        }
        END {
            if (best_opp != "") {
                printf "  [Selected] %s (Lowest Avg: %.2f)\n", best_opp, min_avg > "/dev/stderr"
                print best_opp
            }
        }
    ' "$tmp_opp")

    if [[ -n "$best_opp" ]]; then
        rm -f "$tmp_opp"
        echo "$best_opp"
    else
        grep -Eo 'opp=[0-9]+' "$tmp_opp" | head -n 1
        rm -f "$tmp_opp"
    fi
}

function fightRandom {
    echo "========================================="
    echo "Starting Battles phase (Random)..."

    local tmp_hq="$cookie_file.hq.html"

    for i in {1..6}; do
        local key=""
        key="$(getFightKey)"
        if [[ -n "$key" ]]; then
            echo -n "  Battle $i/6: Attacking opponent ($key)... "
            $curl "$site/b/battle?$key" > /dev/null

            $curl --output "$tmp_hq" "$site/hq"
            local last_bat=""
            last_bat=$(grep "bat_tip" "$tmp_hq" | grep -Eo 'b(win|defeat)_bg' | tail -n 1)
            if [[ "$last_bat" == "bwin_bg" ]]; then
                echo "WON!"
            else
                echo "LOST!"
            fi
        else
            echo "  Battle $i/6: No opponent found on /b/opp (0 battles left or page error)."
            break
        fi
    done

    rm -f "$tmp_hq"
}

function fightFriend {
    echo "========================================="
    echo "Starting Battles phase (Friend: $1)..."

    local tmp_hq="$cookie_file.hq.html"

    for i in {1..6}; do
        $curl --output "$tmp_hq" "$site/hq"
        if grep -q "initMissionTimer(1)" "$tmp_hq"; then
            echo "  Battle $i/6: No battles left today."
            break
        fi

        echo -n "  Battle $i/6: Attacking friend ($1)... "
        $curl --data-urlencode "friend=$1" "$site/b/battle" > /dev/null

        $curl --output "$tmp_hq" "$site/hq"
        local last_bat=""
        last_bat=$(grep "bat_tip" "$tmp_hq" | grep -Eo 'b(win|defeat)_bg' | tail -n 1)
        if [[ "$last_bat" == "bwin_bg" ]]; then
            echo "WON!"
        else
            echo "LOST!"
        fi
    done

    rm -f "$tmp_hq"
}

# =========================================================================
# RAID FUNCTIONS
# =========================================================================
function raid {
    echo "========================================="
    echo "Starting Raids phase..."

    local tmp_hq="$cookie_file.hq.html"

    for i in {1..9}; do
        $curl --output "$tmp_hq" "$site/hq"
        if grep -q 'href="/b/raid"' "$tmp_hq"; then
            echo -n "  Raid $i: Recruits available! Executing raid... "
            $curl "$site/b/raid" > /dev/null

            $curl --output "$tmp_hq" "$site/hq"
            local last_raid=""
            last_raid=$(grep "raid_tip" "$tmp_hq" | grep -Eo 'b(win|defeat)_bg' | tail -n 1)
            if [[ "$last_raid" == "bwin_bg" ]]; then
                echo "STAGE CLEARED!"
            else
                echo "DEFEATED!"
            fi
        else
            echo "  Raids complete (0 recruits available)."
            break
        fi
    done

    rm -f "$tmp_hq"
}

# =========================================================================
# DAILY SUMMARY REPORT (PARSED DIRECTLY FROM SAVED /hq)
# =========================================================================
function printSummary {
    local account_dir="$data_dir/$login_lower"
    local hq_file="$account_dir/hq.html"

    if [[ ! -f "$hq_file" ]]; then
        mkdir -p "$account_dir"
        $curl --output "$hq_file" "$site/hq"
    fi

    local bat_wins=$(grep "bat_tip" "$hq_file" | grep -c "bwin_bg")
    local bat_losses=$(grep "bat_tip" "$hq_file" | grep -c "bdefeat_bg")
    local bat_total=$((bat_wins + bat_losses))
    local bat_pct="0.00"
    if [[ "$bat_total" -gt 0 ]]; then
        bat_pct=$(awk "BEGIN { printf \"%.2f\", ($bat_wins / $bat_total) * 100 }")
    fi

    local ext_wins=$(grep "miss_tip" "$hq_file" | grep -c "bwin_bg")
    local ext_loss=$(grep "miss_tip" "$hq_file" | grep -c "bdefeat_bg")
    local ext_tot=$((ext_wins + ext_loss))

    local inf_wins=$(grep "infil_tip" "$hq_file" | grep -c "bwin_bg")
    local inf_loss=$(grep "infil_tip" "$hq_file" | grep -c "bdefeat_bg")
    local inf_tot=$((inf_wins + inf_loss))

    local epic_wins=$(grep "epic_tip" "$hq_file" | grep -c "bwin_bg")
    local epic_loss=$(grep "epic_tip" "$hq_file" | grep -c "bdefeat_bg")
    local epic_tot=$((epic_wins + epic_loss))

    local total_m_wins=$((ext_wins + inf_wins + epic_wins))

    local raid_phase=$(grep -Eo '<h1 class="hbox">Raid Phase [0-9]+</h1>' "$hq_file" | grep -Eo '[0-9]+')
    [[ -z "$raid_phase" ]] && raid_phase="Unknown"

    echo "========================================="
    echo "       SUMMARY FOR: $login_original"
    echo "========================================="
    echo "Battles Won     : $bat_wins/$bat_total ($bat_pct%)"
    echo "Missions Won    : $total_m_wins/3 missions completed"
    echo "  - Exterminate : $ext_wins won ($ext_loss failed, $ext_tot attempts)"
    echo "  - Infiltrate  : $inf_wins won ($inf_loss failed, $inf_tot attempts)"
    echo "  - Epic        : $epic_wins won ($epic_loss failed, $epic_tot attempts)"
    echo "Last Raid Level : Raid Phase $raid_phase"
    echo "========================================="
}

function lookupPasswordFromSecretCfg {
    local target_user_lower=$(echo "$1" | tr '[:upper:]' '[:lower:]')
    local secret_file=""

    if [[ -f "$prefix/secret.cfg" ]]; then
        secret_file="$prefix/secret.cfg"
    elif [[ -f "$prefix/../config/secret.cfg" ]]; then
        secret_file="$prefix/../config/secret.cfg"
    fi

    if [[ -n "$secret_file" && -f "$secret_file" ]]; then
        while IFS= read -r raw_entry; do
            local entry="${raw_entry//\"/}"
            local entry_user=$(echo "${entry%%:*}" | tr '[:upper:]' '[:lower:]')
            local entry_pass="${entry#*:}"
            if [[ "$entry_user" == "$target_user_lower" ]]; then
                echo "$entry_pass"
                return 0
            fi
        done < <(grep -Eo '"[^"]+:[^"]+"' "$secret_file")
    fi
    return 1
}

function authenticate {
    if [[ -z "$password" ]]; then
        password="$(lookupPasswordFromSecretCfg "$login_original")"
    fi

    if [[ -n "$password" ]]; then
        curl -L --silent --cookie-jar "$cookie_file" \
            --data-urlencode "login=$login_lower" \
            --data-urlencode "pass=$password" \
            "$site/login" > /dev/null
    else
        curl -L --silent --cookie-jar "$cookie_file" \
            --data-urlencode "login=$login_lower" \
            "$site/login" > /dev/null
    fi
}

# =========================================================================
# SINGLE ACCOUNT RUNNER
# =========================================================================
function runSingleAccount {
    login_original="$1"
    password="$2"
    local custom_friend="$3"
    [[ -n "$custom_friend" ]] && friend="$custom_friend"

    login_lower=$(echo "$login_original" | tr '[:upper:]' '[:lower:]')
    site="https://$login_lower.trooperstest.gued.es"
    cookie_file="$(mktemp -t "$login_lower.XXXXXX" --suffix='.cookie')"
    curl="curl -L --silent --cookie $cookie_file --cookie-jar $cookie_file"

    echo ">>> Processing account: $login_original"
    authenticate

    if [[ "$request_upgrade" == "true" ]]; then
        requestSoldierUpgrade
    elif [[ -n "$select_upgrade_url" ]]; then
        selectSoldierUpgrade "$select_upgrade_url"
    elif [[ "$scrape_only" == "true" ]]; then
        saveAccountHtml
        if [[ "$report" != "never" ]]; then
            getMoneyRatio
        fi
    else
        if [[ -z "$friend" ]]; then
            fightRandom
        else
            fightFriend "$friend"
        fi
        mission
        raid
        saveAccountHtml
        printSummary
        if [[ "$report" != "never" ]]; then
            getMoneyRatio
        fi
    fi

    rm --force "$cookie_file"
}

# =========================================================================
# INITIALIZATION & CLI / SECRET.CFG DISPATCHER
# =========================================================================
prefix="$(cd "$(dirname "$0")" && pwd)"
data_dir="$prefix/../data/raw_html"
ext="com"
Another="Another"
report="upgradable"
scrape_only="false"
request_upgrade="false"
select_upgrade_url=""

for command in 'grep' 'curl' 'awk' 'tr'; do
    if ! command -v "$command" > /dev/null; then
        echo "error: $0 needs $command to execute"
        exit 2
    fi
done

[[ -f "$prefix/troopers.cfg" ]] && source "$prefix/troopers.cfg"
[[ -f "$prefix/$ext.culture" ]] && source "$prefix/$ext.culture"

args=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --scrape-only|-s|--sync)
            scrape_only="true"
            shift
            ;;
        --request-upgrade|-u)
            request_upgrade="true"
            shift
            ;;
        --select-upgrade)
            select_upgrade_url="$2"
            shift 2
            ;;
        *)
            args+=("$1")
            shift
            ;;
    esac
done

if [[ ${#args[@]} -gt 0 ]]; then
    first_arg="${args[0]}"
    if [[ "$first_arg" == *:* && -z "${args[1]}" ]]; then
        cli_user="${first_arg%%:*}"
        cli_pass="${first_arg#*:}"
        runSingleAccount "$cli_user" "$cli_pass"
    else
        runSingleAccount "${args[0]}" "${args[1]}" "${args[2]}"
    fi
    exit 0
fi

if [[ -f "$prefix/secret.cfg" ]]; then
    secret_file="$prefix/secret.cfg"
elif [[ -f "$prefix/../config/secret.cfg" ]]; then
    secret_file="$prefix/../config/secret.cfg"
else
    echo "Usage: $0 [--scrape-only] [--request-upgrade] [<login> [password] [friend]]"
    exit 1
fi

mapfile -t raw_entries < <(grep -Eo '"[^"]+:[^"]+"' "$secret_file")

if [[ ${#raw_entries[@]} -eq 0 ]]; then
    echo "error: No \"user:pass\" entries found in $secret_file"
    exit 1
fi

for raw_item in "${raw_entries[@]}"; do
    entry="${raw_item//\"/}"
    acc_user="${entry%%:*}"
    acc_pass="${entry#*:}"
    runSingleAccount "$acc_user" "$acc_pass"
done

echo "Finished processing all ${#raw_entries[@]} accounts!"
exit 0