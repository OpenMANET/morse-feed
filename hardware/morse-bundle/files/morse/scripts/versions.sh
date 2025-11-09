#!/bin/sh

get_morse_iface()
{
    local net_path=$(find /sys/class/morse/morse_io/device/ -regex '.*net/[^/]*' 2>/dev/null | head -n 1)
    if [ -n "$net_path" ]; then
        local morse_iface=$(basename "$net_path")
        printf $morse_iface
    fi
}

get_fw_ver()
{
    local m_iface=$(get_morse_iface)
    if [ -z "$m_iface" ];then
        printf "N/A"
        return
    fi

    local output=`morse_cli -i $m_iface version 2>/dev/null | grep FW`
    if [ "$output" ];then
        printf "$output" | sed 's/.*: //g'
    else
        printf "N/A"
    fi
}

get_hw_ver()
{
    local m_iface=$(get_morse_iface)
    if [ -z "$m_iface" ];then
        printf "N/A"
        return
    fi

    local hw_version=`morse_cli -i $m_iface hw_version 2>/dev/null | grep HW`
    if [ "$hw_version" ];then
        printf "$hw_version" | sed 's/.*: //g'
    else
        printf "N/A"
    fi
}

get_drv_ver()
{
    local output=`strings /lib/modules/$(uname -r)/morse.ko | grep "^0-" | head -n 1`
    if [ "$output" ];then
        printf "$output"
    else
        printf "N/A"
    fi
}

get_d11_ver()
{
    local output=`strings /lib/modules/$(uname -r)/dot11ah.ko | grep "^0-" | head -n 1`
    if [ "$output" ];then
        printf "$output"
    else
        printf "N/A"
    fi
}

get_mcli_ver()
{
    local output=`morse_cli version 2>/dev/null | grep Morse_cli`
    if [ "$output" ];then
        printf "$output" | sed 's/.*: //g'
    else
        printf "N/A"
    fi
}

get_mctrl_ver()
{
    if [ ! -x "/sbin/morsectrl" ]; then
        printf "N/A (Not installed)"
        return
    fi

    local output=`morsectrl version 2>/dev/null | grep Morsectrl`
    if [ "$output" ];then
        printf "$output" | sed 's/.*: //g'
    else
        printf "N/A"
    fi
}

get_hapd_ver()
{
    local output=`hostapd_s1g -v 2>&1 | grep hostapd`
    if [ "$output" ];then
        printf "$output" | sed 's/hostapd v//g'
    else
        printf "N/A"
    fi
}

get_supl_ver()
{
    local output=`wpa_supplicant_s1g -v | grep wpa_supplicant`
    if [ "$output" ];then
        printf "$output" | sed 's/wpa_supplicant v//g'
    else
        printf "N/A"
    fi
}

get_wvmn_ver()
{
    local output=`wavemon -v | grep wavemon`
    if [ "$output" ];then
        printf "$output" | sed 's/wavemon //g'
    else
        printf "N/A"
    fi
}

get_iprf_ver()
{
    local output=`iperf3  --version | grep iperf`
    if [ "$output" ];then
        printf "$output" | sed 's/iperf //g'
    else
        printf "N/A"
    fi
}

get_iw_ver()
{
    local output=`iw --version | grep "iw version"`
    if [ "$output" ];then
        printf "$output" | sed 's/iw version //g'
    else
        printf "N/A"
    fi
}

get_snp_ver()
{
    local output=`test -e /usr/sbin/morse-snapshot.sh && cat /usr/sbin/morse-snapshot.sh | grep SCRIPT_VER=`
    if [ "$output" ];then
        printf "$output" | sed "s/SCRIPT_VER='v\(.*\)'/\1/"
    else
        printf "N/A"
    fi
}

get_owrt_ver()
{
    # This is actually VERSION_CODE, which is the Morse OpenWrt version
    # rather than the upstream OpenWrt version.
    local output=`cat /etc/openwrt_version`
    if [ "$output" ];then
        printf "$output"
    else
        printf "N/A"
    fi
}

echo -ne "Morse Versions:
- Firmware       = `get_fw_ver`
- Morse Driver   = `get_drv_ver`
- Dot11ah Driver = `get_d11_ver`
- morse_cli      = `get_mcli_ver`
- Morsectrl      = `get_mctrl_ver`
- Hostapd        = `get_hapd_ver`
- WPA_Supplicant = `get_supl_ver`
- Wavemon        = `get_wvmn_ver`
- Iperf3         = `get_iprf_ver`
- IW             = `get_iw_ver`
- Snapshot       = `get_snp_ver`
- OpenWRT        = `get_owrt_ver`
- Chip           = `get_hw_ver`
"
