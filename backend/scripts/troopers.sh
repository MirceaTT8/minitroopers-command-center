#!/bin/bash

# =========================================================================
# SCRAPE, UPGRADE REQUEST & SAVE RAW HTML FUNCTIONS
# =========================================================================
function saveAccountHtml {
    local account_dir="$data_dir/$login_lower"
    mkdir -p "$account_dir"

    echo "  [Sync] Saving /hq and /t/0 HTML to $account_dir..."
    $curl "$site/hq" | sed "s|<head>|<head><base href=\"$site/\">|i" > "$account_dir/hq.html"
    $curl "$site/t/0" | sed "s|<head>|<head><base href=\"$site/\">|i" > "$account_dir/t0.html"
}

function requestSoldierUpgrade {
    local account_dir="$data_dir/$login_lower"
    mkdir -p "$account_dir"

    echo "  [Upgrade] Fetching /t/0 for $login_original to locate upgrade link..."
    local t0_html=$($curl "$site/t/0")

    # Find href="/t/0?levelup=..." or href="/levelup/0..."
    local levelup_href=$(echo "$t0_html" | grep -Eo 'href="(/t/0\?levelup=[^"]+|/levelup/0[^"]*)"' | head -n 1 | sed -E 's/^href="|"$//g')

    if [[ -n "$levelup_href" ]]; then
        echo "  [Upgrade] Sending upgrade request to $site$levelup_href..."
        $curl "$site$levelup_href" | sed "s|<head>|<head><base href=\"$site/\">|i" > "$account_dir/levelup0.html"
    else
        echo "  [Upgrade] No ?levelup= token on /t/0 (upgrade may already be pending). Checking /levelup/0..."
        local lvl_page=$($curl "$site/levelup/0")
        if [[ -n "$lvl_page" ]]; then
            echo "$lvl_page" | sed "s|<head>|<head><base href=\"$site/\">|i" > "$account_dir/levelup0.html"
        else
            echo "$t0_html" | sed "s|<head>|<head><base href=\"$site/\">|i" > "$account_dir/levelup0.html"
        fi
    fi

    # Refresh /t/0 and /hq after the upgrade request so credits and choices stay in sync
    $curl "$site/t/0" | sed "s|<head>|<head><base href=\"$site/\">|i" > "$account_dir/t0.html"
    $curl "$site/hq" | sed "s|<head>|<head><base href=\"$site/\">|i" > "$account_dir/hq.html"
    echo "  [Upgrade] Saved upgrade options to $account_dir/levelup0.html and refreshed t0.html."
}

function selectSoldierUpgrade {
    local target_href="$1"
    local account_dir="$data_dir/$login_lower"
    mkdir -p "$account_dir"

    if [[ -z "$target_href" ]]; then
        echo "error: Missing upgrade selection URL"
        exit 1
    fi

    # Ensure leading slash
    [[ "$target_href" != /* ]] && target_href="/$target_href"

    echo "  [Upgrade] Selecting upgrade option via $site$target_href..."
    $curl "$site$target_href" > /dev/null

    # Remove old levelup0.html and save updated /t/0 and /hq
    rm -f "$account_dir/levelup0.html"
    saveAccountHtml
}

function getMoneyRatio {
    local account_dir="$data_dir/$login_lower"
    local t0_html=""

    if [[ -f "$account_dir/t0.html" ]]; then
        t0_html=$(cat "$account_dir/t0.html")
    else
        t0_html=$($curl "$site/t/0")
    fi

    local money=$(echo "$t0_html" | awk '/class="money"/{flag=1; next} flag && /[0-9]+/{gsub(/[^0-9]/,""); print; exit}')
    local upgrade_cost=$(echo "$t0_html" | grep -Eo 'Upgrade for [0-9]+' | grep -Eo '[0-9]+' | head -n 1)

    [[ -z "$money" ]] && money=0
    [[ -z "$upgrade_cost" ]] && upgrade_cost=0

    if [[ "$report" == "always" || ( "$report" == "upgradable" && "$money" -ge "$upgrade_cost" ) ]]; then
        echo "$login_original's money for next upgrade : $money/$upgrade_cost"
    fi
}

# =========================================================================
# MISSION FUNCTIONS
# =========================================================================
function mission {
    echo "========================================="
    echo "Starting Missions phase..."

    for type in exterminate infiltrate epic; do
        local tip_id=""
        case "$type" in
            exterminate) tip_id="miss_tip" ;;
            infiltrate)  tip_id="infil_tip" ;;
            epic)        tip_id="epic_tip" ;;
        esac

        for i in {1..3}; do
            local hq_html=$($curl "$site/hq")

            if ! echo "$hq_html" | grep -q "mission?t=$type"; then
                echo "  Mission ($type) - no more attempts available today."
                break
            fi

            echo -n "  Running mission ($type) - attempt $i/3... "
            $curl "$site/b/mission?t=$type" > /dev/null

            local updated_hq=$($curl "$site/hq")
            local last_badge=$(echo "$updated_hq" | grep "$tip_id" | grep -Eo 'b(win|defeat)_bg' | tail -n 1)

            if [[ "$last_badge" == "bwin_bg" ]]; then
                echo "WON!"
            else
                echo "LOST!"
            fi
        done
    done
}

# =========================================================================
# BATTLE FUNCTIONS
# =========================================================================
function getFightKey {
    local opp_html=$($curl --cookie-jar "$cookie_file" "$site/b/opp")

    local best_opp=$(echo "$opp_html" | awk '
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
    ')

    if [[ -n "$best_opp" ]]; then
        echo "$best_opp"
    else
        echo "$opp_html" | $egrep --regexp='opp=[0-9]+' | head --lines=1
    fi
}

function fightRandom {
    echo "========================================="
    echo "Starting Battles phase (Random)..."

    for i in {1..6}; do
        local key="$(getFightKey)"
        if [[ -n "$key" ]]; then
            echo -n "  Battle $i/6: Attacking opponent ($key)... "
            $curl "$site/b/battle?$key" > /dev/null

            local last_bat=$($curl "$site/hq" | grep "bat_tip" | grep -Eo 'b(win|defeat)_bg' | tail -n 1)
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
}

function fightFriend {
    echo "========================================="
    echo "Starting Battles phase (Friend: $1)..."

    for i in {1..6}; do
        if $curl "$site/hq" | grep -q "initMissionTimer(1)"; then
            echo "  Battle $i/6: No battles left today."
            break
        fi

        echo -n "  Battle $i/6: Attacking friend ($1)... "
        $curl --data-urlencode "friend=$1" "$site/b/battle" > /dev/null

        local last_bat=$($curl "$site/hq" | grep "bat_tip" | grep -Eo 'b(win|defeat)_bg' | tail -n 1)
        if [[ "$last_bat" == "bwin_bg" ]]; then
            echo "WON!"
        else
            echo "LOST!"
        fi
    done
}

# =========================================================================
# RAID FUNCTIONS
# =========================================================================
function hasRecruits {
    $curl "$site/hq" | grep "$Another" > /dev/null
    return $?
}

function raid {
    echo "========================================="
    echo "Starting Raids phase..."

    for i in {1..9}; do
        if $curl "$site/hq" | grep 'href="/b/raid"' > /dev/null; then
            echo -n "  Raid $i: Recruits available! Executing raid... "
            $curl "$site/b/raid" > /dev/null

            local last_raid=$($curl "$site/hq" | grep "raid_tip" | grep -Eo 'b(win|defeat)_bg' | tail -n 1)
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
}

# =========================================================================
# DAILY SUMMARY REPORT (PARSED DIRECTLY FROM SAVED /hq)
# =========================================================================
function printSummary {
    local account_dir="$data_dir/$login_lower"
    local hq_html=""

    if [[ -f "$account_dir/hq.html" ]]; then
        hq_html=$(cat "$account_dir/hq.html")
    else
        hq_html=$($curl "$site/hq")
    fi

    local bat_wins=$(echo "$hq_html" | grep "bat_tip" | grep -c "bwin_bg")
    local bat_losses=$(echo "$hq_html" | grep "bat_tip" | grep -c "bdefeat_bg")
    local bat_total=$((bat_wins + bat_losses))
    local bat_pct="0.00"
    if [[ "$bat_total" -gt 0 ]]; then
        bat_pct=$(awk "BEGIN { printf \"%.2f\", ($bat_wins / $bat_total) * 100 }")
    fi

    local ext_wins=$(echo "$hq_html" | grep "miss_tip" | grep -c "bwin_bg")
    local ext_loss=$(echo "$hq_html" | grep "miss_tip" | grep -c "bdefeat_bg")
    local ext_tot=$((ext_wins + ext_loss))

    local inf_wins=$(echo "$hq_html" | grep "infil_tip" | grep -c "bwin_bg")
    local inf_loss=$(echo "$hq_html" | grep "infil_tip" | grep -c "bdefeat_bg")
    local inf_tot=$((inf_wins + inf_loss))

    local epic_wins=$(echo "$hq_html" | grep "epic_tip" | grep -c "bwin_bg")
    local epic_loss=$(echo "$hq_html" | grep "epic_tip" | grep -c "bdefeat_bg")
    local epic_tot=$((epic_wins + epic_loss))

    local total_m_wins=$((ext_wins + inf_wins + epic_wins))

    local raid_phase=$(echo "$hq_html" | grep -Eo '<h1 class="hbox">Raid Phase [0-9]+</h1>' | grep -Eo '[0-9]+')
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
        while IFS= read -r entry; do
            local entry_user=$(echo "${entry%%:*}" | tr '[:upper:]' '[:lower:]')
            local entry_pass="${entry#*:}"
            if [[ "$entry_user" == "$target_user_lower" ]]; then
                echo "$entry_pass"
                return 0
            fi
        done < <(grep -Eo '"[^"]+:[^"]+"' "$secret_file" | tr -d '"')
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
    curl="curl -L --silent --cookie $cookie_file"

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
egrep="grep --extended-regexp --only-matching"

for command in 'grep' 'curl' 'awk' 'tr' 'sed'; do
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
    echo "Usage: $0 [--scrape-only | --request-upgrade] [<login> [password] [friend]]"
    exit 1
fi

mapfile -t account_entries < <(grep -Eo '"[^"]+:[^"]+"' "$secret_file" | tr -d '"')

if [[ ${#account_entries[@]} -eq 0 ]]; then
    echo "error: No \"user:pass\" entries found in $secret_file"
    exit 1
fi

for entry in "${account_entries[@]}"; do
    acc_user="${entry%%:*}"
    acc_pass="${entry#*:}"
    runSingleAccount "$acc_user" "$acc_pass"
done

echo "Finished processing all ${#account_entries[@]} accounts!"
exit 0