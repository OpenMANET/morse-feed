#
# Copyright 2022 Morse Micro
#
# This is free software, licensed under the GPL 2 license.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=morse_driver
PKG_RELEASE=3

PKG_VERSION:=1.16.4

PKG_LICENSE:=GPLv2
PKG_LICENSE_FILES:=LICENSE

PKG_SOURCE_VERSION:=$(PKG_VERSION)
PKG_SOURCE_URL:=https://github.com/MorseMicro/morse_driver.git
PKG_HASH:=abacddf6fabe024d8496799048d83eaf4d447dd70f22eac8af17e0b02c831d53
PKG_SOURCE_PROTO:=git

PKG_MAINTAINER:=Morse Micro
PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/package.mk

DTC=$(wildcard $(LINUX_DIR)/scripts/dtc/dtc)

define KernelPackage/morse
  SUBMENU:=Wireless Drivers
  TITLE:=Morse Micro WIFI HaLow driver
  DEPENDS:= +kmod-mmc +kmod-mac80211 +kmod-trelay +kmod-lib-crc7 morse-fw +morse-board-config +MORSE_USB:kmod-usb-core
  FILES:=\
    $(PKG_BUILD_DIR)/morse.ko \
    $(PKG_BUILD_DIR)/dot11ah/dot11ah.ko
  AUTOLOAD:=$(call AutoProbe,morse)
  MODPARAMS.morse:=country=US
  PROVIDES:=kmod-morse
endef

define KernelPackage/morse/config
    source "$(SOURCE)/Config.in"
endef

ifeq ($(CONFIG_MORSE_SDIO),y)
  MORSE_MAKEDEFS += CONFIG_MORSE_SDIO=y
endif

ifeq ($(CONFIG_MORSE_SPI),y)
  MORSE_MAKEDEFS += CONFIG_MORSE_SPI=y
endif

ifeq ($(CONFIG_MORSE_USB),y)
  MORSE_MAKEDEFS += CONFIG_MORSE_USB=y
endif

ifeq ($(CONFIG_MORSE_USER_ACCESS),y)
  MORSE_MAKEDEFS += CONFIG_MORSE_USER_ACCESS=y
endif

ifeq ($(CONFIG_MORSE_VENDOR_COMMAND),y)
  MORSE_MAKEDEFS += CONFIG_MORSE_VENDOR_COMMAND=y
endif

ifeq ($(CONFIG_MORSE_MONITOR),y)
  MORSE_MAKEDEFS += CONFIG_MORSE_MONITOR=y
endif

ifeq ($(CONFIG_MORSE_DEBUG),y)
  # This DEBUG (used by the driver Makefile) should not be confused with
  # -DDEBUG (used by the kernel build system).
  MORSE_MAKEDEFS += DEBUG=y
  MORSE_MAKEDEFS += CONFIG_MORSE_DEBUGFS=y
  MORSE_MAKEDEFS += CONFIG_MORSE_ENABLE_TEST_MODES=y
else
  MORSE_MAKEDEFS += DEBUG=n
endif

ifneq ($(CONFIG_MORSE_RC),y)
  MORSE_MAKEDEFS += CONFIG_DISABLE_MORSE_RC=y
endif

MORSE_MAKEDEFS += \
  MORSE_VERSION=0-$(PKG_VERSION) \
  KERNEL_SRC=$(LINUX_DIR) \
  CONFIG_MORSE_SDIO_ALIGNMENT=$(CONFIG_MORSE_SDIO_ALIGNMENT) \
  CONFIG_BACKPORT_VERSION=v6.1.24
# This refers to the version of mac80211 backported to OpenWrt
# Occasionally patches are required to remove some parts of the driver
# as OpenWrt may sometimes pull in further patches from later kernel versions
# than that of the mac80211 backport.

NOSTDINC_FLAGS = \
	-I$(PKG_BUILD_DIR) \
	-I$(STAGING_DIR)/usr/include/mac80211-backport/uapi \
	-I$(STAGING_DIR)/usr/include/mac80211-backport \
	-I$(STAGING_DIR)/usr/include/mac80211/uapi \
	-I$(STAGING_DIR)/usr/include/mac80211 \
	-include backport/autoconf.h \
	-include backport/backport.h

ifeq ($(CONFIG_MORSE_DEBUG_LOGGING),y)
  NOSTDINC_FLAGS += -DDYNAMIC_DEBUG_MODULE
  NOSTDINC_FLAGS += -DDEBUG
endif

MORSE_MAKEDEFS += CONFIG_WLAN_VENDOR_MORSE=m
MORSE_MAKEDEFS += V=1

NOSTDINC_FLAGS += -DMORSE_TRACE_PATH=.

include $(INCLUDE_DIR)/kernel-defaults.mk

define Build/Compile
	$(MAKE) $(MORSE_MAKEDEFS) $(PKG_JOBS) -C "$(LINUX_DIR)" \
		$(KERNEL_MAKE_FLAGS) \
		M="$(PKG_BUILD_DIR)" \
		NOSTDINC_FLAGS="$(NOSTDINC_FLAGS)" \
		modules
endef

$(eval $(call KernelPackage,morse))
