#!/bin/bash

set -ue -o pipefail

EXPECTED_VERSION=24.10

MYDIR=$(dirname $0)

failure() {
	echo Failed to adapt your existing OpenWrt. The most probably cause
	echo of this is that you have local changes that are incompatible.
	echo You should look at the particular patch/operation that failed,
	echo and adjust it appropriately.
	exit 1
}

trap failure ERR

if ! [ -e include/version.mk ]; then
	echo "Can't detect OpenWrt version (no include/version.mk)."
	echo "Make sure you're running this script in your OpenWrt directory."
	echo
	exit 1
fi

if ! grep -q "^VERSION_NUMBER:=.*,$EXPECTED_VERSION" include/version.mk; then
	echo "Cannot find $EXPECTED_VERSION in default VERSION_NUMBER."
	echo "This script can _only_ patch OpenWrt $EXPECTED_VERSION based distributions."
	echo "If there is no appropriate branch available in morse-feed, you"
	echo "will have to apply patches manually be referring to the patches"
	echo "provided with the morse driver for your kernel/mac80211 versions."
	echo
	exit 1
fi

FEED=feeds.conf.default
if [ -e feeds.conf ]; then
	FEED=feeds.conf
fi

if ! grep -q '^src.* morse ' "$FEED"; then
	echo "Make sure to update $FEED before running this script."
	echo "See $MYDIR/README.md for details."
	echo
	exit 1
fi

for dir in $MYDIR/patches/*; do
	basename=$(basename $dir)

	case $basename in
		linux.add)
			echo === Adding linux kernel patches...
			cp -rv "$dir"/* target/linux/generic
			echo
			;;
		mac80211.add)
			echo === Adding mac80211 kernel module patches...
			cp -rv "$dir"/* package/kernel/mac80211/patches/subsys
			echo
			;;
		*)
			if [ -d "$dir" ]; then
				echo === Applying $basename patches...
				for patch in $dir/*.patch; do
					patch -p1 < "$patch"
				done
				echo
			fi
			;;
	esac
done

echo "
Successfully adapted OpenWrt to add Morse support.

If you've run scripts/feeds install -p morse -a, you should now be able
to add the following package via make menuconfig:
  netifd-morse  (uci support for type morse devices)

This will pull in all necessary packages as dependencies,
including the morse kernel module and adapted hostapd/wpa_supplicant.

You probably want to commit these changes to a branch. Use git status to
see which files have been added or changed. For more information, see:
  feeds/morse/README.md
"
