#!/bin/bash

# The filename to save the CA as
NAME=ca

set -e

if [ -e "${NAME}".pem ]; then
	echo "Are you sure you want to regenerate the root CA? The app will need updating."
	echo "Please delete ca.pem if you are sure you want to regenerate the CA"
	exit 1;
fi

# Make our testing CA last 5 years
openssl req -nodes -x509 -newkey rsa:4096 -keyout "${NAME}".key -out "${NAME}".pem -days 1825 -subj "/C=AU/O=Morse Micro/OU=Development/CN=Dppd Test CA" 

openssl x509 -in "${NAME}".pem -outform der -out "${NAME}".cer
openssl x509 -in "${NAME}".pem -text
