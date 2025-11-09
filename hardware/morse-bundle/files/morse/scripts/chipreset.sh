#!/bin/sh
#
# Copyright 2023-2024 Morse Micro
#

remove_driver() {
    modules="morse dot11ah"

    for module in morse dot11ah; do
        rmmod "$module" > /dev/null
    done
}

reset_chip() {
    # Timing is from reset.c in morse-ctrl
    gpioset -m time -u 50000 $1=0
    # Force pin back to in.
    gpioget $1 > /dev/null
    ucode -e 'sleep(50)'
}

# Find first MM_RESET pin
# (gpio-line-names are not guaranteed unique, but chances of more than one are low...)
reset_gpio="$(gpiofind MM_RESET | head -1)"

if [ -z "$reset_gpio" ]; then
    2>&1 echo 'morsechipreset: unable to reset as MM_RESET not in gpio-line-names in device tree'
    exit 1
fi

# This finds something like:
#    /sys/devices/platform/10130000.mmc/mmc_host
# and extracts a driver location and the device (10130000.mmc).
sdio_device_path="$(find /sys/devices/platform -name mmc_host | head -1)"
if [ -n "$sdio_device_path" ]; then
    sdio_driver_path="$(readlink -f "$sdio_device_path"/../driver)"
    sdio_device="$(basename $(dirname "$sdio_device_path"))"
fi

if [ -z "$sdio_device" ]; then
    2>&1 echo 'morsechipreset: unable to find sdio device/driver to unbind; proceeding anyway'
fi

# Strictly speaking, this:
#  (a) shouldn't be necessary, as unbind will remove (as long as sdio_device was found).
#  (b) will perform a reset anyway during removal so calling may be pointless.
# But for avoidance of any issues, we leave it in for now.

remove_driver

# Resetting the chip also resets its sdio bus. Therefore we need to tell the sdio
# driver to take another look.

if [ -n "$sdio_device_path" ]; then
    echo -n "$sdio_device" > "$sdio_driver_path/unbind"
fi

reset_chip "$reset_gpio"

if [ -n "$sdio_device_path" ]; then
    echo -n "$sdio_device" > "$sdio_driver_path/bind"
fi
