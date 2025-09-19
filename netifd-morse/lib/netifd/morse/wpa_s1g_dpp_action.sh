#!/bin/sh

# This helper script should go away in the future if we combine
# the rpcd dpp ucode plugin and wpa_event_listener.

case "$1" in
    config)
        ubus call dpp apply_config "{
            \"config\": {
                \"iface_name\": \"$iface_name\",
                \"key\": \"$(echo "$psk" | xxd -r -p)\",
                \"encryption\": \"$encryption\",
                \"ssid\": \"$ssid\"
            }
        }"
    ;;
    *)
        if [ "$2" -gt 0 ]; then
            ubus call dpp set_state "{\"state\": \"$1\", \"lockout_secs\": $2}"
        else
			# If we have no valid lockout value, it's hard to plug it into JSON,
			# so just call set_state without the lockout value.
            ubus call dpp set_state "{\"state\": \"$1\"}"
        fi
    ;;
esac
