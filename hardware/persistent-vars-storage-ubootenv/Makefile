#
# Copyright 2024 Morse Micro
#
# This is free software, licensed under the GNU General Public License v2.
# See /LICENSE for more information.
#

include $(TOPDIR)/rules.mk


PKG_NAME:=persistent-vars-storage-ubootenv
PKG_RELEASE=1

PKG_MAINTAINER:=Morse Micro

include $(INCLUDE_DIR)/package.mk

define Package/persistent-vars-storage-ubootenv
  SECTION:=Utilities
  CATEGORY:=Morse Micro
  SUBMENU:=Hardware
  PROVIDES:=persistent-vars-storage
  TITLE:=Reads or writes key-value vars from/into the persistent storage (u-boot-env)
  DEPENDS:= uboot-envtools
endef

define Build/Compile

endef

define Package/persistent-vars-storage-ubootenv/install
	$(INSTALL_DIR) $(1)/sbin
	$(INSTALL_BIN) ./files/sbin/persistent_vars_storage.sh $(1)/sbin/persistent_vars_storage.sh
	$(INSTALL_DIR) $(1)/etc
endef

$(eval $(call BuildPackage,persistent-vars-storage-ubootenv))
