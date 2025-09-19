#!/bin/sh
#
# Copyright (C) 2023 Morse Micro Pty Ltd. All rights reserved.
#

USAGE="
Usage: $(basename $0) [-c] [-b build system] [-i interface] [-m morse directory path] [-o Output folder name] [-d Output file path]
Morse Micro file and information extraction tool
   -c                          Compress output folder to .tar.gz. (default: disabled)
   -b BUILD SYSTEM             Build system used to compile. (default: OpenWRT; no other options supported)
   -i INTERFACE                Network interface. (default: wlan0)
   -m MORSE DIRECTORY PATH     Filepath to morse folder. (default: '/')
   -o OUTPUT FOLDER NAME       Name of folder to output debug files. (default: 'YYYY-MM-DD_hh:mm:ss')
   -d OUTPUT FILE PATH         Path to save output folder. (default: '/tmp')
"

bad_usage()
{
    echo "$1"
    echo
    echo "$USAGE"
    exit 1
}

INTERFACE="wlan0"
MORSE_DIR="/"
OUTPUT_PATH="/tmp"
DEBUG_DIR=$(date +"%F_%X")
COMPRESS=false

optstring="cb:i:m:o:d:"

while getopts ${optstring} arg; do
    case ${arg} in
    c)
        COMPRESS=true
        ;;
    b)
        BUILD="$OPTARG"
        test "$BUILD" = OpenWRT || bad_usage "Only OpenWRT is supported as a build arg (-b)."
        ;;
    i)
        INTERFACE="$OPTARG"
        ;;
    m)
        MORSE_DIR="$OPTARG"
        ;;
    o)
        DEBUG_DIR="$OPTARG"
        ;;
    d)
        OUTPUT_PATH="$OPTARG"
        ;;
    *)
        bad_usage "Argument ($arg) not understood."
        ;;
    esac
done

cd "$OUTPUT_PATH" || bad_usage "Output path (-o) doesn't exist."
mkdir -p "$DEBUG_DIR" || bad_usage "Can't create output dir (-d)."
cd "$DEBUG_DIR" || bad_usage "Can't change into output dir (-d)."

find_morse_device() {
    local device=$1
    local type
    config_get type $device type

    if [ "$type" = morse ]; then
        config_get phypath $device path
        return 1
    fi
}

find_phy()
{
    . /lib/functions.sh
    config_load wireless
    config_foreach find_morse_device wifi-device

    PHY="$(iwinfo nl80211 phyname path="$phypath")"
}

morse_iface_available()
{
    ubus_output="$(ubus call iwinfo info "{\"device\": \"$INTERFACE\"}" 2> /dev/null)"
    if [ -z "$ubus_output" ]; then
        return 1
    fi

    . /usr/share/libubox/jshn.sh
    json_init
    json_load "$ubus_output"
    json_get_var hwmode hwmode

    test "$hwmode" == "ah"
}

is_easymesh_controller()
{
    prplmesh_enable=$(uci get prplmesh.config.enable 2> /dev/null)
    master=$(uci get prplmesh.config.master 2> /dev/null)
    if [ "$prplmesh_enable" == 1 ] && [ "$master" == 1 ]; then
        return 0
    else
        return 1
    fi
}


PHY=
find_phy

TEARDOWN_INTERFACE=false
if ! morse_iface_available; then
    INTERFACE="${PHY}_mm_dump"
    echo "Morse iface not available - attempting to add $INTERFACE."

    if iw phy "$PHY" interface add "$INTERFACE" type managed; then
        if ip link set "$INTERFACE" up; then
            echo "Added temporary interface $INTERFACE."
        fi
        TEARDOWN_INTERFACE=true
    fi
fi

# Run a command, and save the output along with explanatory text. e.g.
#
#   r dmesg.txt dmesg
#
# This is a helper so we can have a minimal list of commands below
# (proxy for a proper data structure).
r() {
    output="$1"
    shift
    echo "Running: $* > $output 2>&1"
    echo "# $*" > "$output"
    "$@" >> "$output" 2>&1
}

# Save data from a location (using rsync -a). e.g.
#
#   s /var/log
#
# This is a helper so we can have a minimal list of commands below
# (proxy for a proper data structure), and must be given
# an absolute path.
s() {
    x="$1"

    shift
    exs=""
    for ex in "$@"; do
        exs="$exs --exclude $ex"
    done

    if [ -e "$x" ]; then
        echo "Saving: $x with $exs"
        mkdir -p "files$(dirname $x)"
        rsync -a "$x" "files$(dirname $x)" $exs
    fi
}

echo "Saving info to $OUTPUT_PATH/$DEBUG_DIR"

r dmesg.txt                dmesg
r versions.txt             "$MORSE_DIR"morse/scripts/versions.sh
r morsectrl_stats.json     morse_cli -i "$INTERFACE" stats -j
r morsectrl_channel.txt    morse_cli -i "$INTERFACE" channel
r iw_link.txt              iw "$INTERFACE" link
r iw_station_dump.txt      iw "$INTERFACE" station dump
r iwinfo.txt               iwinfo
r iwinfo_assoclist.txt     iwinfo "$INTERFACE" assoclist
r ifconfig.txt             ifconfig
r ip_a.txt                 ip a
r ip_r.txt                 ip r
r ip_n.txt                 ip n
r brctl_show.txt           brctl show
r running_procs.txt        ps ww
r cpu_and_mem_usage.txt    top -b -n1
r disk_usage.txt           df -h
r syslog.txt               logread
if is_easymesh_controller; then
    r prplmesh_data_model.json ubus call Device.WiFi.DataElements _get '{"depth":"10"}'
    r prplmesh_conn_map.txt    /opt/prplmesh/bin/beerocks_cli -c bml_conn_map
fi
s /var/log
s /etc/config
s /var/run
s /lib/firmware/morse
s /proc/interrupts
s /proc/version
s /proc/meminfo
s /sys/module/morse/parameters
s /sys/kernel/debug/gpio
s /sys/fs/pstore
s /root/.ash_history

# Reading one of these parameters errors out.
s /sys/kernel/debug/ieee80211/$PHY/morse twt_sta_agreements twt_wi_tree 2> /dev/null


if $TEARDOWN_INTERFACE; then
    iw dev "$INTERFACE" del
fi


if $COMPRESS; then
    cd ../
    tar -czvf "$DEBUG_DIR".tar.gz "$DEBUG_DIR"
    rm -rf "$DEBUG_DIR"
fi
