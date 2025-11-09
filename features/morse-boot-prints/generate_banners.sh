#!/bin/sh

# Re-run this script when the possible outputs from morse-mode have changed
# to generate new banners.
# Requires 'figlet' to be installed.

BASEDIR="$(dirname "$0")"

MORSE_MODE_LOC="$BASEDIR/../morse-mode/files/usr/share/rpcd/ucode/morse-mode"

make_banner() {
	fname="$1"
	shift
	figlet $* > "$BASEDIR/files/morse/banners/$fname.txt"
}

sed -n '/SHORT_MODE_NAMES/,/};/{p;/};/q}' "$MORSE_MODE_LOC" | sed -n "s/'\(.*\)': '\(.*\)'.*/\1 \2/p" |
while IFS= read -r line; do
	make_banner $line
done
