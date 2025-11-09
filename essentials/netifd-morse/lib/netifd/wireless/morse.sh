#!/bin/sh

. /lib/netifd/netifd-wireless.sh
. /lib/netifd/hostapd.sh
. /lib/netifd/morse/morse_overrides.sh
. /lib/netifd/morse/morse_utils.sh

echo "Configuring morse device"
device_section="$3"
init_wireless_driver "$@"

MM_MOD_INT="watchdog_interval_secs max_rates max_rate_tries spi_clock_speed max_txq_len virtual_sta_max max_aggregation_count
			default_cmd_timeout_ms sdio_reset_time tx_max_power_mbm max_mc_frames duty_cycle_mode ocs_type fixed_mcs fixed_bw
			fixed_ss fixed_guard tx_status_lifetime_ms max_total_vendor_ie_bytes
			hw_reload_after_stop slow_clock_mode"
MM_MOD_BOOL="enable_mac80211_connection_monitor mcs10_mode enable_rts_8mhz
			enable_otp_check enable_survey enable_subbands enable_ps enable_trav_pilot enable_watchdog_reset
			enable_watchdog no_hwcrypt enable_raw enable_arp_offload enable_dynamic_ps_offload
			enable_coredump enable_mbssid_ie enable_trav_pilot enable_cts_to_self enable_airtime_fairness
			enable_twt enable_bcn_change_seq_monitor enable_dhcpc_offload enable_ibss_probe_filtering enable_auto_duty_cycle
			enable_auto_mpsw enable_mcast_whitelist log_modparams_on_boot enable_fixed_rate spi_use_edge_irq
			enable_sched_scan enable_1mhz_probes enable_ext_xtal_init
			enable_hw_scan enable_mcast_rate_control enable_mm_vendor_ie
			enable_page_slicing enable_pv1 enable_sched_scan enable_secureboot
			enable_short_bcn_as_dtim_override"
MM_MOD_STRING="serial country test_mode debug_mask macaddr_octet mcs_mask dhcpc_lease_update_script
			fw_bin_file sdio_clk_debugfs"
MM_MOD_UNKNOWN=
MOD_PARAMS=

TX_Q_CONFIGS=" tx_queue_data3_aifs tx_queue_data3_cwmin tx_queue_data3_cwmax tx_queue_data3_burst
			   tx_queue_data2_aifs tx_queue_data2_cwmin tx_queue_data2_cwmax tx_queue_data2_burst
			   tx_queue_data1_aifs tx_queue_data1_cwmin tx_queue_data1_cwmax tx_queue_data1_burst
			   tx_queue_data0_aifs tx_queue_data0_cwmin tx_queue_data0_cwmax tx_queue_data0_burst"
WMM_AC_CONFIGS="wmm_ac_bk_aifs wmm_ac_bk_cwmin wmm_ac_bk_cwmax wmm_ac_bk_txop_limit wmm_ac_bk_acm
			    wmm_ac_be_aifs wmm_ac_be_cwmin wmm_ac_be_cwmax wmm_ac_be_txop_limit wmm_ac_be_acm
			    wmm_ac_vi_aifs wmm_ac_vi_cwmin wmm_ac_vi_cwmax wmm_ac_vi_txop_limit wmm_ac_vi_acm
			    wmm_ac_vo_aifs wmm_ac_vo_cwmin wmm_ac_vo_cwmax wmm_ac_vo_txop_limit wmm_ac_vo_acm "

check_cac(){
	json_select config
	json_get_vars cac
	if [ "${cac:-0}" -gt 0 ]; then
		enable_cac=1
	fi
	json_select ..
}

check_sgi(){
	enable_sgi=1
	if json_is_a s1g_capab array
	then
		json_select s1g_capab
		idx=1
		while json_is_a ${idx} string
		do
			json_get_var capab $idx
			[ "${capab}" = "[SHORT-GI-NONE]" ] && enable_sgi=0
			idx=$(( idx + 1 ))
		done
		json_select ..
	fi
}

check_usb_powersave(){
	powersave_val=0
	json_select interfaces
	json_get_keys interface_ids

	for id in $interface_ids; do
		json_select "$id"
		if json_is_a config object;then
			json_select config
			json_get_var powersave powersave
			if [ -n "$powersave" ] && [ "$powersave" = "1" ]; then
				powersave_val=1
				json_select ..; json_select ..
				break
			fi
			json_select ..
		fi
		json_select ..
	done
	json_select ..
}

# Determines if we should change the specified bcf because
# of the vfem_4v3 parameters (and reports errors if nonsense).
get_vfem_4v3_bcf() {
	local bcf="$1"

	boost_bcf="${bcf/.bin/_4v3.bin}"

	if ! gpiofind MM_BOOST > /dev/null; then
		echo "WARNING: Unable to set 4.3v vfem as no MM_BOOST gpio configured" >&2
	elif [ -z "$bcf" ]; then
		echo "WARNING: Unable to set 4.3v vfem if no explicit BCF" >&2
	elif ! [ -f "/lib/firmware/morse/$boost_bcf" ]; then
		echo "WARNING: Unable to set 4.3v vfem as $boost_bcf doesn't exist" >&2
	else
		echo "$boost_bcf"
		return 0
	fi
}

build_morse_mod_params(){
	json_select config
	json_get_vars bcf vfem_4v3 firmware_type

	# Remove 4v3 from BCF in case someone's tried to force it
	# (backwards compat?).
	bcf="${bcf/_4v3.bin/.bin}"
	if [ "$vfem_4v3" = 1 ]; then
		vfem_4v3_bcf=$(get_vfem_4v3_bcf "$bcf")
		if [ -n "$vfem_4v3_bcf" ]; then
			bcf="$vfem_4v3_bcf"
		else
			vfem_4v3=0
		fi
	fi

	# Without this, we try to re-attach to running firmware
	# which breaks some of our assumptions around bcf loading etc.
	MOD_PARAMS="reattach_hw=0"
	if [ -n "$bcf" ]; then
		MOD_PARAMS="$MOD_PARAMS bcf=$bcf"
	fi

	if [ "$vfem_4v3" = 1 ]; then
		MOD_PARAMS="$MOD_PARAMS enable_4v3_fem=1"
	fi

	for var in $MM_MOD_BOOL $MM_MOD_INT $MM_MOD_STRING; do
		json_get_var mm_mod_val "$var"
		[ -n "$mm_mod_val" ] && MOD_PARAMS="$MOD_PARAMS $var=$mm_mod_val"
	done

	case "$firmware_type" in
		''|softmac)
			;;
		fullmac)
			MOD_PARAMS="$MOD_PARAMS enable_wiphy=1"
			;;
		thin_lmac)
			MOD_PARAMS="$MOD_PARAMS thin_lmac=1"
			;;
		*)
			echo "WARNING: ignoring unknown firmware_type '$firmware_type'"
			;;
	esac

	check_sgi
	if [ $enable_sgi -ne 1 ]; then
		MOD_PARAMS="$MOD_PARAMS enable_sgi_rc=0"
	else
		MOD_PARAMS="$MOD_PARAMS enable_sgi_rc=1"
	fi
	json_select ..
	enable_cac=
	for_each_interface "ap" check_cac
	[ -n "$enable_cac" ] && MOD_PARAMS="$MOD_PARAMS enable_cac=$enable_cac"

	# Get the last three octets of the eth0 MAC address
	# to use as the default HaLow MAC address
	local ETH0_MAC_SUFFIX=`cat /sys/class/net/eth0/address | cut -d: -f4-`

	MOD_PARAMS="$MOD_PARAMS macaddr_suffix=$ETH0_MAC_SUFFIX"

	#APP-4887: Keep powersave disabled by default on USB-based Morse devices to ensure the LED remains functional.
	if [[ $path  = *usb* ]]; then
		check_usb_powersave
		if [ "$powersave_val" -eq 0 ]; then
			MOD_PARAMS="$MOD_PARAMS enable_ps=0"
		fi
	fi

	MOD_PARAMS=`echo $MOD_PARAMS | xargs`
}


# If thinlmac optimisation is unset, the original settings are not restored unless the device is rebooted.
# This is because the user could have forced different settings (e.g. via rc.local, or by setting ipv6_disabled=0
# in UCI on the network device itself), and we do not want to unexpectedly interfere with these when this option
# is unset. Note also that it's difficult to disable IPv6 via UCI in the normal way because it needs to be done
# on the L3 device, and this device is not fixed for a particular wifi-iface (i.e. it might be a bridge) so there's
# no clean way to push the wifi-device option into the right network device.
apply_thin_lmac_optimization() {
	# Disable noise from IPv6 incidental traffic
	sysctl net.ipv6.conf.all.disable_ipv6=1
	# Reduce ARP garbage collection frequency
	sysctl -w net.ipv4.neigh.default.gc_thresh1=2048
	sysctl -w net.ipv4.neigh.default.gc_thresh2=2048
	sysctl -w net.ipv4.neigh.default.gc_thresh3=2048
	# Increase ARP table entry timeout
	sysctl -w net.ipv4.neigh.default.base_reachable_time_ms=3600000
	# Disable Unnecessary ARP responses
	sysctl -w net.ipv4.conf.all.arp_ignore=1
	sysctl -w net.ipv4.conf.all.arp_announce=2
	# Increase the number of connections supported per second from 470 - see:
	# https://stackoverflow.com/questions/410616/increasing-the-maximum-number-of-tcp-ip-connections-in-linux
	sysctl -w net.ipv4.ip_local_port_range="32768 65535"
}

drv_morse_cleanup() {
	hostapd_common_cleanup
}

drv_morse_init_device_config() {
	hostapd_common_add_device_config

	config_add_string path phy 'macaddr:macaddr'
	config_add_string tx_burst
	config_add_int frag rts
	config_add_int op_class
	config_add_int txpower
	config_add_int s1g_chanbw
	config_add_int s1g_prim_chwidth
	config_add_string s1g_prim_1mhz_chan_index
	config_add_int bss_color
	config_add_boolean ampdu
	config_add_int forced_listen_interval
	config_add_boolean noscan
	config_add_array s1g_capab
	config_add_array channels
	config_add_boolean vendor_keep_alive_offload
	config_add_boolean vfem_4v3
	config_add_boolean thin_lmac_optimization
	config_add_string firmware_type

	#module parameters
	config_add_string bcf  # handled separately due to boost bcf
	config_add_int $MM_MOD_INT
	config_add_boolean $MM_MOD_BOOL
	config_add_string $MM_MOD_STRING $MM_MOD_UNKNOWN
}


drv_morse_init_iface_config() {
	hostapd_common_add_bss_config
	config_add_string 'macaddr:macaddr' ifname
	config_add_boolean wds powersave enable
	config_add_string wds_bridge
	config_add_boolean wps_virtual_push_button
	config_add_boolean dpp_configurator_connectivity
	config_add_array sae_group
	config_add_array owe_group
	config_add_int maxassoc
	config_add_int max_listen_int
	config_add_int dtim_period
	config_add_int start_disabled
	config_add_int sae_pwe
	config_add_string $TX_Q_CONFIGS
	config_add_string $WMM_AC_CONFIGS
	config_add_string ca_cert2
	config_add_string client_cert2
	config_add_string priv_key2
	config_add_string priv_key2_pwd
	config_add_string password

	#twt
	config_add_boolean twt
	config_add_string wake_interval
	config_add_int min_wake_duration setup_command

	#cac
	config_add_boolean cac

	#raw
	config_add_int raw_sta_priority
	config_add_int raw
	config_add_array raws

	# mesh
	config_add_string mesh_id

	#dpp
	config_add_boolean dpp

	#beacon interval
	config_add_int beacon_int
}

get_mesh11sd_config() {
	config_load mesh11sd
	var=

	json_select config

	config_get var mesh_params mesh_fwding
	json_add_boolean mesh_fwding $var

	config_get var mesh_params mesh_rssi_threshold
	json_add_int mesh_rssi_threshold $var

	config_get var mesh_params mesh_max_peer_links
	json_add_int mesh_max_peer_links $var

	config_get var mesh_params mesh_plink_timeout
	json_add_int mesh_plink_timeout $var

	config_get var mesh_params mesh_hwmp_rootmode
	json_add_int mesh_hwmp_rootmode $var

	config_get var mesh_params mesh_gate_announcements
	json_add_int mesh_gate_announcements $var

	config_get var mbca mbca_config
	json_add_int mbca_config $var

	config_get var mbca mbca_min_beacon_gap_ms
	json_add_int mbca_min_beacon_gap_ms $var

	config_get var mbca mbca_tbtt_adj_interval_sec
	json_add_int mbca_tbtt_adj_interval_sec $var

	config_get var mbca mesh_beacon_timing_report_int
	json_add_int mesh_beacon_timing_report_int $var

	config_get var mbca mbss_start_scan_duration_ms
	json_add_int mbss_start_scan_duration_ms $var

	config_get var mesh_beaconless mesh_beacon_less_mode
	json_add_int mesh_beacon_less_mode $var

	config_get var mesh_dynamic_peering enabled 0
	json_add_int mesh_dynamic_peering $var

	config_get var mesh_dynamic_peering mesh_rssi_margin
	json_add_int mesh_rssi_margin $var

	config_get var mesh_dynamic_peering mesh_blacklist_timeout
	json_add_int mesh_blacklist_timeout $var

	json_select ..
}

get_matter_config() {
	config_load matter
	var=

	json_select config

	config_get var config enable
	json_add_int matter_enable $var

	config_get var config ble_proto
	json_add_string ble_proto "$var"

	config_get var config ble_uart_port
	json_add_string ble_uart_port "$var"

	json_select ..
}

is_module_loaded() {
	lsmod | grep -q '^morse '
}

change_module_parameters() {
	# These are parameters that we use morse_cli to configure,
	# but because we have no way to revert back to the original
	# state any change requires us to reload the module.
	#
	# Therefore we store these as a comment in /etc/modules.d/morse
	# (and changing this comment will mean that we will decide
	# to reload the module; see use of cmp below).
	local morse_cli_params="bss_color=$bss_color forced_listen_interval=$forced_listen_interval"
	local proposed_module="$(mktemp)"
	cat > "$proposed_module" <<-MORSE
	# Morse module, with subsequent morse_cli commands: $morse_cli_params
	morse $MOD_PARAMS
	MORSE

	if cmp -s "$proposed_module" /etc/modules.d/morse; then
		# Parameters didn't change; do nothing.
		rm "$proposed_module"
		return 1
	else
		mv "$proposed_module" /etc/modules.d/morse
		return 0
	fi
}

drv_morse_setup() {
	morse_band_override
	json_select config
	json_get_vars \
		phy macaddr path \
		country \
		s1g_chanbw \
		txpower \
		frag rts htmode \
		ampdu \
		op_class \
		bss_color forced_listen_interval \
		thin_lmac_optimization
	json_get_values basic_rate_list basic_rate
	json_select ..

	build_morse_mod_params

	local inserted_module=0
	if change_module_parameters || ! is_module_loaded; then
		is_module_loaded && rmmod morse
		/sbin/kmodloader /etc/modules.d/morse
		inserted_module=1
	fi
	# don't do iw reg set as in mac80211; set via modparam

	local retries=3
	while ! find_phy; do
		sleep 1
		retries="$((retries - 1))"
		if [ "$retries" -le 0 ]; then
			echo "Could not find PHY for device '$1'" >&2
			wireless_set_retry 0
			return 1
		fi
	done

	# wlan? is automatically created on module insertion, but will
	# usually have been cleaned up by the hotplug. However, if we've
	# just inserted the module, wait a little for the hotplug to run
	# so we (a) can claim wlan? and (b) don't have our interfaces
	# deleted by the hotplug (unlikely, but theoretically possible).
	if [ "$inserted_module" = 1 ]; then
		retries=3
		while [ -d "/sys/class/ieee80211/$phy/device/net" ] && [ "$retries" -gt 0 ]; do
			sleep 1
			retries="$((retries - 1))"
		done
	fi

	json_add_object data
	json_add_string phy "$phy"
	json_close_object

	rm -f /var/run/hostapd-$phy*.conf

	wireless_set_data phy="$phy"

	[ -z "$(uci -q -P /var/state show wireless._${phy})" ] && uci -q -P /var/state set wireless._${phy}=phy

	morse_interface_cleanup ${phy}

	uci -q -P /var/state set wireless._${phy}.umlist=""
	uci -q -P /var/state set wireless._${phy}.aplist=""
	uci -q -P /var/state set wireless._${phy}.splist=""

	set_default rts 1000
	iw phy "$phy" set rts "${rts%%.*}"

	[ -n "$frag" ] && iw phy "$phy" set frag "${frag%%.*}"

	# Figure out chan info (e.g. freq/bandwidth) from regulatory info,
	# and determine appropriate primary channel index/width if not set.
	has_chan_info=0
	if morse_set_chan_info; then
		has_chan_info=1
	fi

	interface_count=0
	interface_first=
	# This also creates ifnames_$mode for all mentioned modes
	# (space separated 'list' of interface names).
	for_each_interface "ap sta adhoc mesh none monitor" morse_iface_bringup

	# These vars are used to track the interfaces we've brought up.
	# Even though we haven't yet started a service, we set them here
	# in case our script breaks (this means we'll have some chance
	# of correctly cleaning them up).
	uci -q -P /var/state set wireless._${phy}.aplist="${ifnames_ap}"
	uci -q -P /var/state set wireless._${phy}.splist="${ifnames_sta} ${ifnames_mesh} ${ifnames_adhoc}"
	uci -q -P /var/state set wireless._${phy}.umlist="${ifnames_none} ${ifname_monitor}"

	if [ -n "$ifnames_ap" ]; then
		local hostapd_conf_file="/var/run/hostapd-$phy.conf"
		morse_hostapd_conf_setup "$phy" "$hostapd_conf_file"

		# Because MBSSID IEs are not supported, we provide hostapd
		# with multiple config files so it brings up entirely separate
		# APs (with separate beacons). However, each config file has the
		# "same" set of basic info (see morse_hostapd_conf_setup) to avoid
		# confusion.
		hostapd_conf_files=
		for_each_interface "ap" morse_setup_ap "$hostapd_conf_file"
		# We use "$hostapd_conf_files"; this is just the common info that
		# we can now remove.
		rm "$hostapd_conf_file"
		morse_run_hostapd
	fi

	if [ -n "$ifnames_sta" ]; then
		get_matter_config
		json_select config
		json_get_vars vendor_keep_alive_offload matter_enable
		json_select ..

		for_each_interface "sta" morse_setup_sta
	fi

	if [ -n "$ifnames_mesh" ]; then
		get_mesh11sd_config
		json_select config
		json_get_vars op_class channel country s1g_prim_chwidth s1g_prim_1mhz_chan_index
		json_get_vars mesh_max_peer_links mesh_plink_timeout mesh_hwmp_rootmode mesh_gate_announcements mesh_fwding mesh_rssi_threshold mbca_config mbca_min_beacon_gap_ms mbca_tbtt_adj_interval_sec mesh_beacon_timing_report_int mbss_start_scan_duration_ms mesh_beacon_less_mode mesh_dynamic_peering mesh_rssi_margin mesh_blacklist_timeout
		json_select ..

		for_each_interface "mesh" morse_setup_mesh
	fi

	if [ -n "$ifnames_adhoc" ]; then
		json_select config
		json_get_vars op_class channel country s1g_prim_chwidth s1g_prim_1mhz_chan_index
		json_select ..

		for_each_interface "adhoc" morse_setup_adhoc
	fi

	if [ -n "$ifnames_monitor" ]; then
		json_select config
		json_get_vars op_class channel country s1g_chanbw s1g_prim_chwidth s1g_prim_1mhz_chan_index
		json_select ..

		for_each_interface "monitor" morse_setup_monitor
	fi

	if [ -n "$ifnames_none" ]; then
		for_each_interface "none" morse_setup_none
	fi

	# Ideally, this would also be in the hostapd/wpa_supplicant config,
	# but for now they don't have support so we use morse_cli.
	set_default ampdu 1

	# There will only be an ifname if at least one interface is brought up.
	# If no interfaces, it doesn't matter if we don't set these
	# (since they won't be used).
	if [ -n "$ifnames" ]; then
		ifname="${ifnames%% *}"

		if [ "$ampdu" = 1 ]; then
			morse_cli -i $ifname ampdu enable
		else
			morse_cli -i $ifname ampdu disable
		fi

		[ -n "$bss_color" ] && morse_cli -i $ifname bsscolor $bss_color

		if [ -n "$forced_listen_interval" ]
		then
			# 802.11ah supports listen intervals beyond 65535 by
			# using the first two bits as a scale factor.
			# We calculate this transformation here to keep the UI/config simple.
			local max_val=16383
			local scale_factor
			local unscaled_interval
			if [ "$forced_listen_interval" -gt $((1000 * $max_val)) ]; then
				scale_factor=3
				unscaled_interval=$(("$forced_listen_interval" / 10000))
			elif [ "$forced_listen_interval" -gt $((10 * $max_val)) ]; then
				scale_factor=2
				unscaled_interval=$(("$forced_listen_interval" / 1000))
			elif [ "$forced_listen_interval" -gt $max_val ]; then
				scale_factor=1
				unscaled_interval=$(("$forced_listen_interval" / 1000))
			else
				scale_factor=0
				unscaled_interval="$forced_listen_interval"
			fi

			morse_cli -i $ifname li $unscaled_interval $scale_factor
		fi
	fi

	if [ "$thin_lmac_optimization" = "1" ]; then
		apply_thin_lmac_optimization
	fi

	wireless_set_up
	morse_service_restart
}

drv_morse_teardown() {
	if json_is_a data object
	then
		json_select data
		json_get_vars phy
		json_select ..
	fi

	if [ -z "$phy" ]; then
		json_select config
		json_get_vars path
		json_select ..
		if [ -z "$path" ]; then
			echo "Could not find phy from data, nor could find device path from device configuration." >&2
			return 1;
		fi
		phy=$(iwinfo nl80211 phyname "path=$path")
		if [ -z "$phy" ]; then
			echo "Could not find phy from device path." >&2
			return 1;
		fi
	fi

	rm -f /var/run/hostapd-$phy*.conf

	morse_interface_cleanup "$phy"
	uci -q -P /var/state revert wireless._${phy}

	#Set mesh11sd to disabled
	uci set mesh11sd.setup.enabled='0'
	uci commit mesh11sd
}

morse_iface_create() {
	local auto_channel_only=0
	if [ "$country" = EU -o "$country" = GB ]; then
		auto_channel_only=1
	fi

	if [ "$interface_count" -ge 2 ]; then
		return 2
	fi

	if [ "$auto_channel" -gt 0 -a "$interface_count" -ge 1 ]; then
		return 7
	fi

	if [ -z "$interface_first" ]; then
		interface_first="$mode"
	else
		case "$mode" in
			sta)
				if [ "$interface_first" != "ap" ]; then
					return 3
				fi
				;;
			ap)
				case "$interface_first" in
					ap|mesh|sta)
						;;
					*)
						return 3
						;;
				esac
				;;
			mesh)
				if [ "$interface_first" != "ap" ]; then
					return 3
				fi
				;;
			*)
				return 3
				;;
		esac
	fi

	case "$mode" in
		ap)
			if [ "$auto_channel_only" = 1 ]; then
				[ "$auto_channel" = 0 ] && return 8

				if ! service smart_manager info > /dev/null; then
					return 10
				fi

				# If we don't have a DCS config section, it will default to enabled if channel=auto.
				# However, if it is there, is must be enabled.
				if uci get "smart_manager.${device_section}_dcs" > /dev/null 2>&1; then
					if [ "$(uci get smart_manager.${device_section}_dcs.enabled 2> /dev/null)" != 1 ]; then
						return 10
					fi
				fi
			fi

			[ "$has_chan_info" != 1 ] && return 6
			morse_iw_interface_add "$phy" "$ifname" __ap || return 1
			ifconfig "$ifname" hw ether $macaddr
			ip link set $ifname up
		;;

		sta)
			[ -z "$country" ] && return 5
			[ "$wds" -gt 0 ] && wdsflag="4addr on"
			morse_iw_interface_add "$phy" "$ifname" managed "$wdsflag" return 1
			if [ "$wds" -gt 0 ]; then
				iw dev "$ifname" set 4addr on
			else
				iw dev "$ifname" set 4addr off
			fi

			# Disable powersave for Morse USB mode as a workaround for APP-3745
			if iwinfo dot11ah path "$phy" | grep -q "usb"; then
				set_default powersave 0
			else
				set_default powersave 1
			fi
			[ "$powersave" -gt 0 ] && powersave="on" || powersave="off"
			iw dev "$ifname" set power_save "$powersave"
			ifconfig "$ifname" hw ether $macaddr
			ip link set $ifname up
		;;

		mesh)
			[ "$has_chan_info" != 1 ] && return 6
			[ "$auto_channel_only" = 1 ] && return 9
			[ "$auto_channel" -gt 0 ] && return 4
			morse_iw_interface_add "$phy" "$ifname" mp || return 1
			ifconfig "$ifname" hw ether $macaddr
			ip link set $ifname up
		;;

		adhoc)
			[ "$has_chan_info" != 1 ] && return 6
			[ "$country" = EU -o "$country" = GB ] && return 9
			[ "$auto_channel_only" = 1 ] && return 9
			[ "$auto_channel" -gt 0 ] && return 4
			morse_iw_interface_add "$phy" "$ifname" adhoc || return 1
		;;

		monitor)
			[ "$has_chan_info" != 1 ] && return 6
			morse_iw_interface_add "$phy" "$ifname" monitor || return 1
			ip link set "$ifname" up
			#we need morse0 to dump the packets from.
			ip link set morse0 up
		;;

		*)
			morse_iw_interface_add "$phy" "$ifname" managed || return 1
			ip link set $ifname up
		;;
	esac

	interface_count=$((interface_count + 1))
}

morse_iface_bringup() {
	local iface_index=$1
	json_select config
	json_get_vars ifname mode ssid wds powersave macaddr enable wpa_psk_file vlan_file
	set_default wds 0

	[ -z "$ifname" ] && ifname="$(_find_free_ifname wlan)"

	json_add_string ifname "$ifname"
	json_add_string phy "$phy"

	[ -n "$macaddr" ] || {
		macaddr="$(morse_generate_mac $phy)"
		macidx="$(($macidx + 1))"
	}

	json_add_string macaddr "$macaddr"

	morse_iface_create
	case "$?" in
		2)
			echo "wifi-iface $iface_index mode=$mode ignored; at most two interfaces are supported"
			;;
		3)
			echo "wifi-iface $iface_index mode=$mode ignored; can't coexist interface with mode=$interface_first"
			;;
		4)
			echo "wifi-iface $iface_index mode=$mode ignored; cannot have channel=auto in this mode on wifi-device"
			;;
		5)
			echo "wifi-iface $iface_index mode=$mode ignored; requires country to be set on wifi-device"
			;;
		6)
			echo "wifi-iface $iface_index mode=$mode ignored; requires valid country/channel setup on wifi-device"
			;;
		7)
			echo "wifi-iface $iface_index mode=$mode ignored; if using channel=auto, only a single interface is supported"
			;;
		8)
			echo "wifi-iface $iface_index mode=$mode ignored; EU/GB must have channel set to auto due to regulatory restrictions"
			;;
		9)
			echo "wifi-iface $iface_index mode=$mode ignored; EU/GB cannot use mesh/adhoc interfaces due to regulatory restrictions"
			;;
		10)
			echo "wifi-iface $iface_index mode=$mode ignored; EU/GB must have smart_manager installed and active for dynamic channel selection (DCS)"
			;;
		0)
			# This helps us track if we've managed to successfully create
			# the interface. This means subsequent steps will ignore this interface
			# if _created is not set.
			json_add_string _created 1
			append ifnames_$mode "$ifname"
			append ifnames "$ifname"
			;;
		*)
			echo "wifi-iface $iface_index mode=$mode could not be created"
			;;
	esac

	json_select ..

}

_find_free_ifname()
{
	local prefix=$1
	local idx=0

	while [ -e "/sys/class/net/$prefix$idx" ]
	do
		idx="$(( idx + 1 ))"
	done

	echo "$prefix$idx"
}

# These functions exist as we do not have another way to restart or notify
# services that want to know when the halow interfaces have been restarted.
# The built in OpenWrt hostapd has ubus hooks that use ubus mechanisms to
# notify init/procd.
morse_service_stop() {
	# squash "not found" messages when services are not installed
	service smart_manager stop &> /dev/null
	service dppd stop &> /dev/null
}

morse_service_restart() {
	#  The service is restarted instead of started for a specific case: If both
	# wireless and smart_manager have configuration changes, smart_manager may
	# be reloaded after the morse_service_stop has run but before
	# morse_service_restart. There is potential for it to come up too early and
	# communicate with the old hostapd, which is what this function is here to
	# prevent. We still need to reload smart_manager on smart_manager only
	# configuration changes, so we don't disable that trigger. This is not
	# perfect.

	# squash "not found" messages when services are not installed.
	service smart_manager restart &> /dev/null
	service dppd restart &> /dev/null
}

morse_setup_ap() {
	local hostapd_conf_file=$1
	local iface_index=$2
	json_select config
	json_get_vars _created ifname phy macaddr vif_txpower
	json_select ..

	if [ "$_created" != 1 ]; then
		# This wifi-iface failed earlier in morse_iface_bringup.
		return
	fi

	[ -n "$vif_txpower" ] && iw dev "$ifname" set txpower fixed "${vif_txpower%%.*}00"

	if [ "$iface_index" != 0 ] && [ "$interface_first" = ap ]; then
		morse_hostapd_add_bss "$hostapd_conf_file" "$phy" "$ifname" "$macaddr" secondary
	else
		morse_hostapd_add_bss "$hostapd_conf_file" "$phy" "$ifname" "$macaddr" primary
	fi

	wireless_add_vif "$iface_index" "$ifname"
}

morse_run_hostapd() {
	/usr/sbin/hostapd_s1g -t -B -s ${hostapd_conf_files}

	# prplmesh is looking for /var/morse/hostapd_s1g_multiap.conf as hostapd conf file.
	# So, we add a symlink from the actual conf file for prplmesh.
	if [ "$multi_ap" -gt 0 ]; then
		mkdir -p /var/morse
		ln -sf "${hostapd_conf_files%% *}" /var/morse/hostapd_s1g_multiap.conf
	fi
}

morse_setup_sta() {
	local iface_index=$1

	json_select config
	json_get_vars _created ifname

	if [ "$_created" != 1 ]; then
		# This wifi-iface failed earlier in morse_iface_bringup.
		return
	fi

	morse_wpa_supplicant_add $ifname 1 $matter_enable || failed=1
	json_select ..

	[ -n "$failed" ] || wireless_add_vif "$iface_index" "$ifname"
}

morse_setup_mesh() {
	local iface_index=$1

	json_select config
	json_get_vars _created ifname

	if [ "$_created" != 1 ]; then
		# This wifi-iface failed earlier in morse_iface_bringup.
		json_select ..
		return
	fi

	morse_wpa_supplicant_add $ifname 1 0 || failed=1
	json_select ..

	[ -n "$failed" ] || wireless_add_vif "$iface_index" "$ifname"

	#Set mesh11sd to enabled
	uci set mesh11sd.setup.enabled='1'
	uci commit mesh11sd

}

morse_setup_adhoc() {
	local iface_index=$1

	wireless_vif_parse_encryption

	json_select config
	json_get_vars _created ifname

	if [ "$_created" != 1 ]; then
		# This wifi-iface failed earlier in morse_iface_bringup.
		json_select ..
		return
	fi

	morse_wpa_supplicant_add $ifname 1 0 || failed=1

	json_select ..

	[ -n "$failed" ] || wireless_add_vif "$iface_index" "$ifname"
}

morse_setup_monitor() {
	local iface_index=$1

	json_select config
	json_get_vars _created ifname
	json_select ..

	if [ "$_created" != 1 ]; then
		# This wifi-iface failed earlier in morse_iface_bringup.
		return
	fi

	center_freq=
	_get_regulatory "$country" "$channel" "$s1g_chanbw" "$op_class"
	if [ $? -ne 0 ]; then
		echo "Couldn't find reg for monitor in $country with ch=$channel op=$op_class" >&2
		return
	fi
	#multiply the center_freq by 1000 and remove the decimal part
	center_freq=$(echo "$center_freq * 1000" | bc | awk '{printf "%g\n", $0}')
	morse_cli -i $ifname channel -c $center_freq ${s1g_chanbw:+-o $s1g_chanbw} ${s1g_prim_chwidth:+-p $(( s1g_prim_chwidth + 1 ))} ${s1g_prim_1mhz_chan_index:+-n $s1g_prim_1mhz_chan_index}

	wireless_add_vif "$iface_index" "$ifname"
}

morse_setup_none() {
	local iface_index=$1

	json_select config
	json_get_vars _created ifname
	json_select ..

	if [ "$_created" != 1 ]; then
		# This wifi-iface failed earlier in morse_iface_bringup.
		return
	fi

	wireless_add_vif "$iface_index" "$ifname"

}

morse_vap_cleanup() {
	local service="$1"
	local vaps="$2"

	for wdev in $vaps; do
		[ "$service" != "none" ] && kill_wait $service &> /dev/null
		ip link set dev "$wdev" down 2>/dev/null
		#for monitor mode, we needed to bring up the morse0 interface,
		#so if we are removing a (the) monitor interface, bring down morse0
		[ -n "$(iw dev $wdev info | grep "type monitor")" ] && ip link set dev morse0 down
		iw dev "$wdev" del 2>/dev/null
	done
}

morse_interface_cleanup() {
	local phy="$1"
	morse_service_stop

	morse_vap_cleanup hostapd_s1g "$(uci -q -P /var/state get wireless._${phy}.aplist)"
	morse_vap_cleanup wpa_supplicant_s1g "$(uci -q -P /var/state get wireless._${phy}.splist)"
	morse_vap_cleanup none "$(uci -q -P /var/state get wireless._${phy}.umlist)"
}

#################################################
#
#      generic s1g helpers
#
#################################################

morse_set_chan_info() {
	center_freq=
	_get_regulatory "$country" "$channel" "$s1g_chanbw" "$op_class"
	if [ $? -ne 0 ]; then
		echo "Couldn't find regulatory data for $country with ch=$channel bw=$s1g_chanbw op=$op_class" >&2
		return 1
	fi

	json_select config
	json_get_vars s1g_prim_1mhz_chan_index s1g_prim_chwidth

	if [ -n "$s1g_chanbw" ] && [ -n "$s1g_prim_chwidth" ] && [ "$s1g_prim_chwidth" -gt "$s1g_chanbw" ]; then
		s1g_prim_chwidth=
		echo "s1g_prim_chwidth incorrectly set for bw=$s1g_chanbw, using default"
	fi

	if [ -n "$s1g_chanbw" ] && [ -n "$s1g_prim_1mhz_chan_index" ] && [ "$s1g_prim_1mhz_chan_index" -ge "$s1g_chanbw" ]; then
		s1g_prim_1mhz_chan_index=
		echo "s1g_prim_1mhz_chan_index incorrectly set for bw=$s1g_chanbw, using default"
	fi

	#If bw config is empty the chwidth and chanindex are set to defaults.
	#In case of STA, where bw config is empty these configs are omitted and not configured to wpa_supplicant

	if [ -z "$s1g_prim_chwidth" ]; then
		if [ "$s1g_chanbw" = 4 -o "$s1g_chanbw" = 8 ]; then
			s1g_prim_chwidth=2
		else
			s1g_prim_chwidth=1
		fi
	fi

	s1g_prim_chwidth=$(( s1g_prim_chwidth - 1 ))

	set_default s1g_prim_1mhz_chan_index auto
	if [ "$s1g_prim_1mhz_chan_index" = "auto" ]; then
		s1g_prim_1mhz_chan_index=$(( (s1g_chanbw - 1) / 2 ))
	fi

	json_add_string channel "$channel"
	json_add_string freq "$center_freq"
	json_add_string op_class "$op_class"
	json_add_string s1g_prim_1mhz_chan_index "$s1g_prim_1mhz_chan_index"
	json_add_int s1g_prim_chwidth "$s1g_prim_chwidth"

	json_select ..

	return 0
}


#################################################
#
#      hostapd helpers
#
#################################################


morse_hostapd_conf_setup() {
	local phy=$1
	local hostapd_conf_file=$2
	json_select config
	json_get_vars noscan
	json_get_vars s1g_prim_chwidth s1g_prim_1mhz_chan_index op_class dtim_period
	json_get_vars freq
	json_get_values channel_list channels tx_burst

	if json_is_a s1g_capab array
	then
		json_select s1g_capab
		idx=1
		while json_is_a ${idx} string
		do
			json_get_var capab $idx
			[ -z "$s1g_capab" ] && s1g_capab=$capab || s1g_capab="$s1g_capab,$capab"
			idx=$(( idx + 1 ))
		done
		json_select ..
	fi

	#auto_channel preloaded before drv_ called
	[ "$auto_channel" -gt 0 ] && json_get_vars acs_exclude_dfs
	[ -n "$acs_exclude_dfs" ] && [ "$acs_exclude_dfs" -gt 0 ] &&
		append base_cfg "acs_exclude_dfs=1" "$N"

	[ "$auto_channel" = 0 ] && [ -z "$channel_list" ] && \
		channel_list="$channel"

	set_default noscan 0

	[ "$noscan" -gt 0 ] && hostapd_noscan=1
	[ "$tx_burst" = 0 ] && tx_burst=

	if [ "$band" = "s1g" ]; then
		append base_cfg "ieee80211ah=1" "$N"

		set_default s1g_capab "[SHORT-GI-ALL]"

	fi

	json_get_vars country_ie doth
	[ -z "$country_ie" ] && json_add_boolean country_ie '0'
	[ -z "$doth" ] && json_add_boolean doth '0'

	hostapd_prepare_device_config "$hostapd_conf_file" nl80211
	cat >> "$hostapd_conf_file" <<EOF
${channel:+channel=$channel}
${channel_list:+chanlist=$channel_list}
${op_class:+op_class=$op_class}
${s1g_capab:+s1g_capab=$s1g_capab}
${s1g_prim_chwidth:+s1g_prim_chwidth=$s1g_prim_chwidth}
${s1g_prim_1mhz_chan_index:+s1g_prim_1mhz_chan_index=$s1g_prim_1mhz_chan_index}
${hostapd_noscan:+noscan=1}
${tx_burst:+tx_queue_data2_burst=$tx_burst}
$base_cfg

EOF
	json_select ..
}


morse_hostapd_add_bss() {
	local _hostapd_conf_file="$1"
	local _phy="$2"
	local _ifname="$3"
	local _macaddr="$4"
	local _role="$5"

	hostapd_cfg=
	append hostapd_cfg "interface=$_ifname" "$N"

	json_select config

	morse_override_hostapd_set_bss_options hostapd_cfg "$_phy" "$vif" || {
		json_select ..
		return 1
	}
	json_get_vars wds wds_bridge sae_pwe dtim_period max_listen_int start_disabled dpp_configurator_connectivity raw

	raw_block=
	if [ "$_role" = primary ]; then
		# RAWs are not supported for non-primary APs.
		json_for_each_item morse_hostapd_add_raw raws
	fi

	json_select ..

	set_default wds 0
	set_default start_disabled 0
	set_default sae_pwe 1
	set_default raw 0
	# This controls whether DPP is advertised in the beacon. It does _not_ enable DPP,
	# and hostapd's DPP push button support is available regardless (even if a separate
	# dpp configurator like morse_dppd is not running).
	set_default dpp_configurator_connectivity 1

	if [ "$wds" -gt 0 ]; then
		append hostapd_cfg "wds_sta=1" "$N"
		[ -n "$wds_bridge" ] && append hostapd_cfg "wds_bridge=$wds_bridge" "$N"
	fi

	[ "$start_disabled" -eq 1 ] && append hostapd_cfg "start_disabled=1" "$N"

	local hostapd_ifname_conf_file=/var/run/hostapd-$_phy-$_ifname.conf
	cat "$hostapd_conf_file" - > "$hostapd_ifname_conf_file" <<EOF
$hostapd_cfg
bssid=$_macaddr
${dtim_period:+dtim_period=$dtim_period}
${max_listen_int:+max_listen_interval=$max_listen_int}
${sae_pwe:+sae_pwe=$sae_pwe}
${dpp_configurator_connectivity:+dpp_configurator_connectivity=$dpp_configurator_connectivity}
${raw:+raw=1}
$raw_block
EOF

	append hostapd_conf_files "$hostapd_ifname_conf_file"
}

morse_hostapd_add_raw(){
	local cfgtype priority enabled start_time_us duration_us slots cross_slot max_beacon_spread nominal_stas_per_beacon
	local T="	"
	config_load wireless
	config_get cfgtype "$1" TYPE
	[ "$cfgtype" != "raw" ] && return

	config_get priority "$1" priority
	config_get enabled "$1" enabled
	config_get start_time_us "$1" start_time_us
	config_get duration_us "$1" duration_us
	config_get slots "$1" slots
	config_get cross_slot "$1" cross_slot
	config_get max_beacon_spread "$1" max_beacon_spread
	config_get nominal_stas_per_beacon "$1" nominal_stas_per_beacon

	append raw_block "raw={" "$N"
	append raw_block "priority=${priority:-0}" "$N$T"
	append raw_block "enabled=${enabled:-0}" "$N$T"
	append raw_block "start_time_us=${start_time_us:-0}" "$N$T"
	append raw_block "duration_us=${duration_us:-0}" "$N$T"
	append raw_block "slots=${slots:-0}" "$N$T"
	append raw_block "cross_slot=${cross_slot:-0}" "$N$T"
	append raw_block "max_beacon_spread=${max_beacon_spread:-0}" "$N$T"
	append raw_block "nominal_stas_per_beacon=${nominal_stas_per_beacon:-0}" "$N$T"
	append raw_block "}" "$N"
}

#################################################
#
#      wpa_supplicant helpers
#
#################################################

morse_wpa_supplicant_add() {
	local _ifname=$1
	local _enable=$2
	local matter=$3
	local _save_dir="/etc/morse"
	local _save_file="${_save_dir}/wpa_supplicant-wlan-saved-over-boot.conf"

	if [ "$_enable" = 0 ]; then
		echo "interface is disabled"
		kill_wait wpa_supplicant_s1g &> /dev/null
		ip link set dev "$_ifname" down
		iw dev "$_ifname" del
		return 0
	fi

	wpa_supplicant_prepare_interface "$_ifname" nl80211 || {
		echo "wpa_supplicant_prepare_interface failed."
		iw dev "$_ifname" del
		return 1
	}
	morse_wpa_supplicant_prepare_interface "$_ifname"
	if [ "$mode" = "sta" ]; then
		morse_override_wpa_supplicant_add_network "$_ifname"
	else
		morse_override_wpa_supplicant_add_network "$_ifname" "$freq" "$htmode" "$noscan" "$enable_sgi"
	fi

	_wpa_supplicant_common $_ifname

	# As $_config ends up /var which is symlink to /tmp
	# the HaLow credentials are lost across reboot
	# So save them outside /var
	if [ "$matter" = 1 ]; then
		if ! [ -f "$_save_file" ]; then
			mkdir -p $_save_dir
			cp $_config $_save_file
		fi
		/usr/sbin/wpa_supplicant_s1g -t -u -D nl80211 -s -i $_ifname -c $_save_file -B
	else
		#need to handle bridge mode??
		/usr/sbin/wpa_supplicant_s1g -t -D nl80211 -s -i $_ifname -c $_config -B
	fi

	# React to DPP events (this will handle modifying our UCI configuration on successful DPP)
	if [ "$dpp" = 1 ]; then
		echo "Attempting to start DPP result listener..."
		ubus call dpp start_qrcode_listener
	fi
	return 0
}

#################################################
#
#      interface helpers
#
#################################################

find_phy() {
	[ -n "$phy" -a -d /sys/class/ieee80211/$phy ] && return 0

	if [ -n "$path" ]; then
		phy="$(iwinfo nl80211 phyname "path=$path")"
		[ -n "$phy" ] && return 0
	fi

	if [ -n "$macaddr" ]; then
		for phy in $(ls /sys/class/ieee80211 2>/dev/null); do
			grep -i -q "$macaddr" "/sys/class/ieee80211/${phy}/macaddress" && return 0
		done
	fi
	return 1
}

morse_iw_interface_add() {
	local _phy="$1"
	local _ifname="$2"
	local _type="$3"
	local _wdsflag="$4"
	local rc
	local old_ifname

	iw phy "$_phy" interface add "$_ifname" type "$_type" $_wdsflag
	rc="$?"

	if [ "$rc" = 233 ]; then
		# Device might have just been deleted, give the kernel some time to finish cleaning it up
		sleep 1
		echo "retrying..."
		iw phy "$_phy" interface add "$_ifname" type "$_type" $_wdsflag >/dev/null 2>&1
		rc="$?"
	fi

	if [ "$rc" = 233 ]; then
		# Keep matching pre-existing interface
		if [ -d "/sys/class/ieee80211/${_phy}/device/net/${_ifname}" ]; then
			case "$(iw dev $_ifname info | grep "^\ttype" | cut -d' ' -f2- 2>/dev/null)" in
				"AP")
					[ "$_type" = "__ap" ] && rc=0
					;;
				"IBSS")
					[ "$_type" = "adhoc" ] && rc=0
					;;
				"managed")
					[ "$_type" = "managed" ] && rc=0
					;;
				"mesh point")
					[ "$_type" = "mp" ] && rc=0
					;;
				"monitor")
					[ "$_type" = "monitor" ] && rc=0
					;;
			esac
		fi
	fi

	if [ "$rc" = 233 ]; then
		iw dev "$_ifname" del >/dev/null 2>&1
		if [ "$?" = 0 ]; then
			sleep 1
			iw phy "$_phy" interface add "$_ifname" type "$_type" $_wdsflag >/dev/null 2>&1
			rc="$?"
		fi
	fi

	if [ "$rc" != 0 ]; then
		# Device might not support virtual interfaces, so the interface never got deleted in the first place.
		# Check if the interface already exists, and avoid failing in this case.
		[ -d "/sys/class/ieee80211/${_phy}/device/net/${_ifname}" ] && rc=0
	fi

	if [ "$rc" != 0 ]; then
		# Device doesn't support virtual interfaces and may have existing interface other than _ifname.
		old_ifname="$(basename "/sys/class/ieee80211/${_phy}/device/net"/* 2>/dev/null)"
		[ "$old_ifname" ] && ip link set "$old_ifname" name "$_ifname" 1>/dev/null 2>&1
		rc="$?"
	fi

	[ "$rc" != 0 ] && echo "Failed to create interface $_ifname"
	return $rc
}

morse_get_addr() {
	local phy="$1"
	local idx="$(($2 + 1))"

	head -n $idx /sys/class/ieee80211/${phy}/addresses | tail -n1
}

#this is exactly same as mac80211.sh
morse_generate_mac() {
	local phy="$1"
	local id="${macidx:-0}"

	local ref="$(cat /sys/class/ieee80211/${phy}/macaddress)"
	local mask="$(cat /sys/class/ieee80211/${phy}/address_mask)"

	[ "$mask" = "00:00:00:00:00:00" ] && {
		mask="ff:ff:ff:ff:ff:ff";

		[ "$(wc -l < /sys/class/ieee80211/${phy}/addresses)" -gt $id ] && {
			addr="$(morse_get_addr "$phy" "$id")"
			[ -n "$addr" ] && {
				echo "$addr"
				return
			}
		}
	}

	local oIFS="$IFS"; IFS=":"; set -- $mask; IFS="$oIFS"

	local mask1=$1
	local mask6=$6

	local oIFS="$IFS"; IFS=":"; set -- $ref; IFS="$oIFS"

	macidx=$(($id + 1))
	[ "$((0x$mask1))" -gt 0 ] && {
		b1="0x$1"
		[ "$id" -gt 0 ] && \
			b1=$(($b1 ^ ((($id - !($b1 & 2)) << 2)) | 0x2))
		printf "%02x:%s:%s:%s:%s:%s" $b1 $2 $3 $4 $5 $6
		return
	}

	[ "$((0x$mask6))" -lt 255 ] && {
		printf "%s:%s:%s:%s:%s:%02x" $1 $2 $3 $4 $5 $(( 0x$6 ^ $id ))
		return
	}

	off2=$(( (0x$6 + $id) / 0x100 ))
	printf "%s:%s:%s:%s:%02x:%02x" \
		$1 $2 $3 $4 \
		$(( (0x$5 + $off2) % 0x100 )) \
		$(( (0x$6 + $id) % 0x100 ))
}

add_driver morse
