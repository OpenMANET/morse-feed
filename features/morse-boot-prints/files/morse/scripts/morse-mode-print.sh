#!/bin/sh

. /lib/netifd/morse/morse_utils.sh
. /usr/share/libubox/jshn.sh


print_halow_info()
{
	json_load "$(ubus call morse-mode query)"
	json_get_vars morse_mode

	if ! json_is_a device object || ! json_is_a iface object; then
		echo -e "\nHaLow not configured.\n"
		return
	fi

	json_select iface
	json_get_vars mode mesh_id ssid encryption
	json_select ..

	json_select device
	json_get_vars country channel s1g_chanbw op_class
	json_select ..

	if json_is_a prplmesh_config object; then
		json_select prplmesh_config
		json_get_vars enable management_mode
		json_select ..

		# By default, a prplmesh agent will find the STA interface.
		# But we want to treat it as an AP so we display the channel.
		mode=ap
	fi

	# To find out the channel/BW for a STA, we'd need to find out the ifname _and_
	# then call iwinfo. Not worth it for now.
	if [ "$mode" != "sta" ]; then
		_get_regulatory "$country" "$channel" "$s1g_chanbw" "$op_class"
		if [ $? -ne 0 ]; then
			echo "Couldn't find reg for $morse_interface_mode in $country with ch=$channel op=$op_class" >&2
		fi
	fi

	# And finally we have enough info to do the print.
	local banner_file="/morse/banners/$morse_mode.txt"
	if [ -e "$banner_file" ]; then
		cat "$banner_file"
	fi

	if [ "$mode" = mesh ]; then
		echo "Mesh ID: $mesh_id"
	else
		echo "SSID: $ssid"
	fi

	echo "Encryption: $encryption"

	if [ "$enable" = 1 ]; then
		echo "EasyMesh Mode: $management_mode"
	fi

	echo "Country: $country"
	if [ "$mode" != "sta" ]; then
		echo "Channel: $channel"
		echo "Bandwidth: $s1g_chanbw"
	fi

	echo
}

print_halow_info
# Show iface info only if IPv4 assigned (and skip IPv6...).
ip a | sed -n '/127.0.0.1/d;/lo: /d;s/^[0-9]*: //p;/    link/p;/    inet /p' | grep -B 2 '    inet '
echo