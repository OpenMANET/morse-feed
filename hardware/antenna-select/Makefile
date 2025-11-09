#
# Copyright 2022 Morse Micro
#
# This is free software, licensed under the GNU General Public License v2.
# See /LICENSE for more information.
#

include $(TOPDIR)/rules.mk


PKG_NAME:=antenna-select
PKG_RELEASE=1

PKG_MAINTAINER:=Morse Micro <info@morsemicro.com>

include $(INCLUDE_DIR)/package.mk

define Package/antenna-select
  SECTION:=Utilities
  CATEGORY:=Morse Micro
  SUBMENU:=Hardware
  TITLE:=VoCore2 Antenna Selector script (defaults 2nd antenna)
  DEPENDS:= +kmod-mtd-rw +@BUSYBOX_CONFIG_XXD
endef

define Build/Compile

endef

define Package/antenna-select/install
	$(INSTALL_DIR) $(1)/sbin
	$(INSTALL_BIN) ./files/sbin/antenna-select $(1)/sbin/
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/antenna-select $(1)/etc/init.d/antenna-select
endef

$(eval $(call BuildPackage,antenna-select))
