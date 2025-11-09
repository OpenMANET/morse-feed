#
# Copyright 2024 Morse Micro
#
# This is free software, licensed under the GNU General Public License v2.
# See /LICENSE for more information.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=morse-button
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/morse-button
  SECTION:=utils
  CATEGORY:=Morse Micro
  SUBMENU:=Hardware
  TITLE:=Morse Micro Button Functionality
  MAINTAINER:=Morse Micro
  DEPENDS:=+netifd-morse
endef

define Package/morse-button/description
  Add a button handler script for morse devices.
endef

define Build/Compile

endef

define Package/morse-button/install
	$(INSTALL_DIR) $(1)/etc/rc.button
	$(INSTALL_BIN) ./files/etc/rc.button/reset_override $(1)/etc/rc.button/reset_override
endef

$(eval $(call BuildPackage,morse-button))
