#
# Copyright 2022 Morse Micro
#
# This is free software, licensed under the MIT License.
#
# This package installs Morse Micro firmware binaries, which are
# distributed under the Morse Micro Binary Distribution License.
# This license is available in LICENSE.binaries.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=morse-fw
PKG_RELEASE=2

PKG_VERSION:=1.16.4

PKG_SOURCE_VERSION:=68fcf18643b0fe12d1ff73ad03089b8c0b7d2979
PKG_SOURCE_URL:=https://github.com/MorseMicro/morse-firmware.git
PKG_HASH:=dbc6b5428fc6d4defa89a29c00c99a73ca07f704501d3618eddacb826007f486
PKG_SOURCE_PROTO:=git

PKG_MAINTAINER:=Morse Micro <info@morsemicro.com>
PKG_BUILD_PARALLEL:=1

RSTRIP:=:

include $(INCLUDE_DIR)/kernel.mk
include $(INCLUDE_DIR)/package.mk

define Package/morse-fw-6108
  CATEGORY:=Morse Micro
  SUBMENU:=Essentials
  URL:=$(PKG_SOURCE_URL)
  TITLE:=Morse Micro WIFI HaLow standard firmware for 6108
  PROVIDES:=morse-fw
endef

define Package/morse-fw/config
  source "$(SOURCE)/Config.in"
endef

define Package/morse-fw-6108-tlm
  CATEGORY:=Morse Micro
  SUBMENU:=Essentials
  URL:=$(PKG_SOURCE_URL)
  TITLE:=Morse Micro WIFI HaLow Thin LMAC firmware for 6108
  PROVIDES:=morse-fw
endef

define Package/morse-fw-6108-tlm/description
  This firmware reduces the per-station table size in the chip to
  allow a large number of associations in AP mode.
endef

define Package/morse-fw-8108
  CATEGORY:=Morse Micro
  SUBMENU:=Essentials
  URL:=$(PKG_SOURCE_URL)
  TITLE:=Morse Micro WIFI HaLow standard firmware for 8108
  PROVIDES:=morse-fw
endef

define Package/morse-fw-8108-tlm
  SECTION:=firmware
  CATEGORY:=Morse Micro
  SUBMENU:=Essentials
  URL:=$(PKG_SOURCE_URL)
  TITLE:=Morse Micro WIFI HaLow Thin LMAC firmware for 8108
  PROVIDES:=morse-fw
endef

define Package/morse-fw-8108-tlm/description
  This firmware reduces the per-station table size in the chip to
  allow a large number of associations in AP mode.
endef

define Package/morse-fw-8108-flm
  SECTION:=firmware
  CATEGORY:=Morse Micro
  SUBMENU:=Essentials
  URL:=$(PKG_SOURCE_URL)
  TITLE:=Morse Micro WIFI HaLow FullMAC firmware for 8108
  PROVIDES:=morse-fw
endef

define Package/morse-fw-8108-flm/description
  This firmware implements the functionality of the mac80211
  module (and some wpa_supplicant functionality) on the 8108.
  This will allow you to reduce host processor CPU usage
  and maintain association if the host processor is turned off.
  However, it currently only supports station/client mode
  (i.e. not AP/mesh/adhoc).
endef

define Build/Compile

endef

# Files from the tarball are overriden by a file in this path.
# This is for local development and used by jenkins.
define install_file_or_override
	if [ -e ./files/lib/firmware/morse/$(1) ]; then \
		$(INSTALL_DATA) ./files/lib/firmware/morse/$(1) $(2)/lib/firmware/morse/; \
	else \
		$(INSTALL_DATA) $(PKG_BUILD_DIR)/firmware/$(1) $(2)/lib/firmware/morse/; \
	fi
endef

define Package/morse-fw-6108/install
	$(INSTALL_DIR) $(1)/lib/firmware/morse/.
	$(call install_file_or_override,mm6108.bin,$(1))
endef

define Package/morse-fw-6108-tlm/install
	$(INSTALL_DIR) $(1)/lib/firmware/morse/.
	$(call install_file_or_override,mm6108-tlm.bin,$(1))
endef

define Package/morse-fw-8108/install
	$(INSTALL_DIR) $(1)/lib/firmware/morse/.
	$(call install_file_or_override,mm8108b2-rl.bin,$(1))
endef

define Package/morse-fw-8108-tlm/install
	$(INSTALL_DIR) $(1)/lib/firmware/morse/.
	$(call install_file_or_override,mm8108b2-tlm-rl.bin,$(1))
endef

define Package/morse-fw-8108-flm/install
	$(INSTALL_DIR) $(1)/lib/firmware/morse/.
	$(call install_file_or_override,mm8108b2-flm-rl.bin,$(1))
endef

$(eval $(call BuildPackage,morse-fw-6108))
$(eval $(call BuildPackage,morse-fw-6108-tlm))
$(eval $(call BuildPackage,morse-fw-8108))
$(eval $(call BuildPackage,morse-fw-8108-tlm))
$(eval $(call BuildPackage,morse-fw-8108-flm))
