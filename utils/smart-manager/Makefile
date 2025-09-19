#
# Copyright (C) 2023 Morse Micro
#
# This is free software, licensed under the Apache License, Version 2.0
#


include $(TOPDIR)/rules.mk

PKG_NAME:=smart_manager
PKG_RELEASE:=1
PKG_VERSION:=rel_1_15_3_2025_Apr_16
PKG_SOURCE:=$(PKG_NAME)_$(PKG_VERSION).tar.xz
PKG_SOURCE_URL:=https://github.com/MorseMicro/smart-manager/releases/download/1.15.3/
PKG_HASH:=39d63e7a1d93042d32c76cf0dd217277cb598683dafd596678a13b5a7e5290dc
PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)_$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk

define Package/smart_manager
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=WirelessAPD
  TITLE:=Morse Micro HaLow DCS Smart Manager
  DEPENDS:= +kmod-morse +libnl +libpthread +libconfig +hostapd_s1g
  USERID:=network=101:network=101
endef

define Package/smart_manager/description

endef

define Build/Compile
endef

define Package/smart_manager/install
	$(INSTALL_DIR) $(1)/etc
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_DIR) $(1)/usr/share/smart_manager
	$(INSTALL_DIR) $(1)/sbin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/$(CONFIG_TARGET_ARCH_PACKAGES)/etc/init.d/smart_manager $(1)/etc/init.d/smart_manager
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/$(CONFIG_TARGET_ARCH_PACKAGES)/etc/uci-defaults/50-smart_manager $(1)/etc/uci-defaults/50-smart_manager
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/$(CONFIG_TARGET_ARCH_PACKAGES)/sbin/smart_manager $(1)/sbin/smart_manager
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/$(CONFIG_TARGET_ARCH_PACKAGES)/usr/share/smart_manager/dcs.mmext $(1)/usr/share/smart_manager/dcs.mmext
endef

$(eval $(call BuildPackage,smart_manager))
