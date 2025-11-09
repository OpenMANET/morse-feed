#!/bin/bash

# Exit if any commands return an error
set -e

# This will try and automatically generate the correct certificate for this machine
# If it doesn't, or you need to generate for another machine
# You can manually override any of NAME, CA_NAME, HOSTNAME, ADDR as needed

# The filename to save this certificate to
NAME="$(hostname)"
CA_NAME=ca
# The local hostname to include within the certificate
HOSTNAME="$(hostname)"
LONGHOSTNAME="$(hostname -f)"
# A local address to include within the certificate
DEFAULT_INTERFACE="$(ip route show default | awk '/default/ {print $3}')"
ADDR="$DEFAULT_INTERFACE"

openssl req -nodes -newkey rsa:4096 -keyout "$NAME".key \
        -out "$NAME".csr -subj "/C=AU/O=Morse Micro/OU=Development/CN=$HOSTNAME"

# Generate our AltNames
ALT_NAMES="IP:127.0.0.1,DNS:localhost"
if [ -n "$ADDR" ]; then
    ALT_NAMES="$ALT_NAMES,IP:$ADDR"
fi
if [ -n "$HOSTNAME" ]; then
    ALT_NAMES="$ALT_NAMES,DNS:$HOSTNAME,DNS:$HOSTNAME.local"
    # If another device with the same name already exists on the network
    # avahi will try HOSTNAME-2, -3, -4 etc ... see avahi_alternative_host_name
    # So we also sign for "-2"
    ALT_NAMES="$ALT_NAMES,DNS:$HOSTNAME-2,DNS:$HOSTNAME-2.local"
fi
if [ -n "$LONGHOSTNAME" ] && [ "$HOSTNAME" != "$LONGHOSTNAME" ]; then
    # Generate for the long hostname
    ALT_NAMES="$ALT_NAMES,DNS:$LONGHOSTNAME"
fi

echo "subjectAltName" "$ALT_NAMES"

EXT='[v3_cert]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
subjectAltName = '"$ALT_NAMES"'
extendedKeyUsage = 1.3.6.1.5.5.7.3.1
'

echo "$EXT" > auto_ext.conf

openssl x509 -req -in "$NAME".csr -CA "$CA_NAME".pem -CAkey "$CA_NAME".key \
       -CAcreateserial -out "$NAME".pem -extensions v3_cert \
       -extfile ./auto_ext.conf

rm auto_ext.conf

openssl x509 -in "$NAME".pem -outform der -out "$NAME".cer
openssl x509 -in "$NAME".pem -text

ln -fs "$NAME".pem server.pem
ln -fs "$NAME".key server.key

cat "$NAME".pem "$CA_NAME".pem > "$NAME"-bundle.pem

echo "Find your certificate $NAME.pem and the keyfile $NAME.key"
echo "These have also been symlinked to server.pem and server.key"
