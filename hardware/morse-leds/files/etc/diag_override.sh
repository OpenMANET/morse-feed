#!/bin/sh
# Copyright (C) 2006-2019 OpenWrt.org
# Copyright 2024 Morse Micro

# This is a rewritten version of /etc/diag.sh from base-files which
# adds more possible states and handles RGB leds. It also simplifies
# things by passing by argument rather than via setting status_led.

# New states are:
#   factory_reset/rebooting - 'about to happen' states in morse-button
#                             (triggered by holding down button)
#   dpp_started/dpp_failed - if we have no morse specific LED
#                            and need to re-use one of the normal ones

# This is run before /tmp/sysinfo/board_name is populated on boot.
board_name="$(strings /proc/device-tree/compatible | head -1)"

# This lets us have a different basic LED colour depending
# on the mode of the device.
_mm_mode="$(persistent_vars_storage.sh READ mm_mode 2> /dev/null)"
if [ -z "$_mm_mode" ]; then
	# Sadly, fw_*.config files are populated by uci-defaults, and when we're
	# early in the boot process we don't have it. But we really want to
	# show the mode colour early in the boot process to avoid confusion.
	case "$board_name" in
	morse,halowlink1)
		echo '/dev/mtd1 0x0 0x8000 0x1000' > /tmp/artini_preinit_fw_sys.config
		_mm_mode="$(fw_printenv -n -c /tmp/artini_preinit_fw_sys.config mm_mode 2> /dev/null)"
		rm /tmp/artini_preinit_fw_sys.config
		;;
	esac
fi

status_red=$(get_dt_led status-red)
status_green=$(get_dt_led status-green)
status_blue=$(get_dt_led status-blue)

halow="$(get_dt_led halow)"
wifi="$(get_dt_led wifi)"
status="$(get_dt_led status)"

red="255 0 0"
green="0 255 0"
blue="0 0 127"
yellow="255 255 0"
cyan="0 255 127"
light_purple="255 0 127"
dark_purple="64 0 128"

led_set_color() {
	# input is <led> <R G B>, The assumption here is that
	# /sys/class/leds/$1/multi_index is always "red green blue". And that
	# /sys/class/leds/$1/max_brightness is always 255
	led_set_attr "$1" multi_intensity "$2"
}

led_blink_slow() {
	led_timer "$1" 1000 1000
}

led_blink() {
	led_timer "$1" 300 300
}

led_blink_fast() {
	led_timer "$1" 100 100
}

led_blink_veryfast() {
	led_timer "$1" 50 50
}

set_three_pwmled_normal() {
	# There's a bug in the pwm-multicolor module which means colour
	# change malfunctions if the LED is off due to a timer trigger.
	# APP-3323
	led_on "$status"

	# Force the colours of all LEDs to the standard colours.
	led_set_color "$halow" "$light_purple"
	led_set_color "$wifi" "$green"
	if [ "$_mm_mode" = sta ]; then
		led_set_color "$status" "$cyan"
	else
		led_set_color "$status" "$green"
	fi
}

# The transitions are:
# failsafe -> preinit_regular -> done
# preinit -> done
# done -> upgrade
# done -> ap_change -> sta_change -> factory_reset
# done -> dpp_started -> dpp_failed -> done
set_three_pwmled_state() {
	case "$1" in
	preinit|preinit_regular)
		set_three_pwmled_normal
		led_blink_fast "$status"
		;;
	failsafe)
		led_off "$halow"
		led_off "$wifi"
		led_set_color "$status" "$red"
		led_blink_veryfast "$status"
		;;
	upgrade)
		led_off "$halow"
		led_off "$wifi"
		led_set_color "$status" "$blue"
		led_blink "$status"
		;;
	dpp_started)
		led_set_color "$halow" "$dark_purple"
		led_blink_slow "$halow"
		;;
	dpp_failed)
		led_set_color "$halow" "$dark_purple"
		led_blink_fast "$halow"
		;;
	factory_reset)
		led_off "$halow"
		led_off "$wifi"
		led_set_color "$status" "$yellow"
		led_blink "$status"
		;;
	ap_change)
		# Changing to AP mode.
		led_set_color "$status" "$green"
		led_blink "$status"
		;;
	sta_change)
		# Changing to STA mode.
		led_set_color "$status" "$cyan"
		led_blink_fast "$status"
		;;
	done)
		# This state is called both after boot completes and after a DPP session finishes.
		set_three_pwmled_normal
		# DPP overrides the normal halow led trigger, so restore it here by calling the led script.
		/etc/init.d/led restart
		;;
	esac
}

set_single_rgbled_state() {
	led_off "$status_red"
	led_off "$status_green"
	led_off "$status_blue"

	case "$1" in
	preinit)
		led_blink_fast "$status_green"
		;;
	failsafe)
		led_blink_veryfast "$status_red"
		;;
	preinit_regular)
		led_blink "$status_green"
		;;
	upgrade)
		led_blink "$status_blue"
		;;
	dpp_started)
		# purple
		led_blink_slow "$status_red"
		led_blink_slow "$status_blue"
		;;
	dpp_failed)
		# purple
		led_blink_fast "$status_red"
		led_blink_fast "$status_blue"
		;;
	rebooting)
		# Because rebooting and factory_reset are triggered
		# by the same button on the EKH03/4, and we start flashing
		# as soon as the function has changed, it's useful to
		# have both a colour difference and a timing difference
		# (for colour blindness, and to make it clear that
		# a different state has been reached).
		led_blink "$status_green"
		;;
	factory_reset)
		# This is intentionally the same colour as the uboot: the
		# idea is that the flashing yellow transition to solid yellow
		# which shows you that the reset has completed, just as the
		# flashing green transitions to solid green on boot.
		# yellow
		led_blink_fast "$status_green"
		led_blink_fast "$status_red"
		;;
	done)
		# Restore the LEDs default triggers since we might
		# have finished messing with it.
		status_led_restore_trigger status-red
		status_led_restore_trigger status-green
		status_led_restore_trigger status-blue

		led_on "$status_green"

		# Now force OpenWrt's normal LED management
		# to re-apply.
		/etc/init.d/led restart
		;;
	esac
}

set_state() {
	if [ -n "$halow" -a -n "$wifi" -a -n "$status" ]; then
		set_three_pwmled_state "$1"
	elif [ -n "$status_red" -a -n "$status_green" -a -n "$status_blue" ]; then
		set_single_rgbled_state "$1"
	elif [ -n "$boot" -o -n "$failsafe" -o -n "$running" -o -n "$upgrade" ]; then
		# This is the normal action, but with our additional button generated states added
		# for our enhanced button scripts.
		# Note that unlike the above we don't handle dpp_started/dpp_failed, since
		# the default LED setup doesn't give us a suitable target.
		case "$1" in
		factory_reset)
			led_off "$running"
			led_blink_fast "$upgrade"
			;;
		rebooting)
			led_off "$running"
			led_blink "$boot"
			;;
		*)
			set_led_state "$1"
			;;
		esac
	fi
}
