#!/bin/sh

# If you use this script to persist your dropbear setup, it will
# get automatically loaded on a fresh flash (i.e. not retaining settings).

if [ -e /etc/dropbear/authorized_keys ]; then 
	persistent_vars_storage.sh WRITE dropbear_authorized_keys "$(cat /etc/dropbear/authorized_keys)"
fi

for f in /etc/dropbear/dropbear_ed25519_host_key /etc/dropbear/dropbear_rsa_host_key; do
	if [ -e "$f" ]; then
		persistent_vars_storage.sh WRITE "$(basename "$f")" "$(base64 "$f")"
	fi
done

