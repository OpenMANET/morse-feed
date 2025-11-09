#
# Copyright 2023 Morse Micro
#
# This is free software, licensed under the GNU General Public License v2.
# See /LICENSE for more information.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=morse-boot-prints
PKG_RELEASE=2

PKG_LICENSE:=
PKG_LICENSE_FILES:=

PKG_MAINTAINER:=Morse Micro

include $(INCLUDE_DIR)/package.mk

define Package/morse-boot-prints
  SECTION:=utils
  CATEGORY:=Morse Micro
  SUBMENU:=Features
  TITLE:=Morse Boot Info Prints
  DEPENDS:=+morse-mode
endef

define Build/Compile
endef

define Package/morse-boot-prints/install
	# scripts
	$(INSTALL_DIR) $(1)/morse/scripts/
	$(INSTALL_BIN) ./files/morse/scripts/* $(1)/morse/scripts/

	# init script
	$(INSTALL_DIR) $(1)/etc/init.d/
	$(INSTALL_BIN) ./files/etc/init.d/morse-boot-prints $(1)/etc/init.d/

	# banners
	$(INSTALL_DIR) $(1)/morse/banners/
	$(INSTALL_BIN) ./files/morse/banners/* $(1)/morse/banners/

endef


$(eval $(call BuildPackage,morse-boot-prints))
