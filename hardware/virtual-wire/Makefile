# Copyright 2023 Morse Micro
include $(TOPDIR)/rules.mk

PKG_NAME:=virtual-wire
PKG_RELEASE=1

PKG_MAINTAINER:=Morse Micro

include $(INCLUDE_DIR)/package.mk

define Package/virtual-wire
  SECTION:=Utilities
  CATEGORY:=Morse Micro
  SUBMENU:=Hardware
  TITLE:=virtual-wire
  DEPENDS:=+smart_manager +morse-regdb +gpioctl-sysfs +morse-dppd persistent-vars-storage
endef

define Package/virtual-wire/description
  The virtual-wire package configures the device into a virtual wire mode at
  boot time. The virtual wire mode is a mode where the device acts as a
  transparent bridge between two physical networks - the ethernet and HaLow Wi-Fi
  networks. The script runs at boot and checks the state of a physical jumper on
  the board and configures the halow device as either an access point or client
  based on the value of the jumper. The region must either be already set in
  uci, or be readable from mm_region by persistent_vars_storage.sh (separate package).
  The ethernet and halow devices are bridged and configured with a static IP. If the
  jumper is moved the halow device will change modes at the next boot. If the
  user reconfigures their device using the Luci interface, the script will no
  longer run.
endef

define Build/Compile

endef

define Package/virtual-wire/install
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/virtual-wire $(1)/etc/init.d/virtual-wire
endef

$(eval $(call BuildPackage,virtual-wire))
