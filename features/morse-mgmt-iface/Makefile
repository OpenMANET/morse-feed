#
# Copyright (C) 2024 Morse Micro
#

include $(TOPDIR)/rules.mk

PKG_NAME:=morse-mgmt-iface
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/morse-mgmt-iface
	SECTION:=utils
	CATEGORY:=Morse Micro
	SUBMENU:=Features
	TITLE:=Morse Micro Management alias Network interface
	MAINTAINER:=Morse Micro
	DEPENDS:=+netifd-morse +ucode +ucode-mod-fs +ucode-mod-ubus +ucode-mod-uci +ucode-mod-uloop
endef

define Package/morse-mgmt-iface/description
	Create a management LAN alias network interface for Morse devices.
endef

define Build/Compile

endef

define Package/morse-mgmt-iface/install
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/* $(1)/etc/init.d/.
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) ./files/usr/sbin/* $(1)/usr/sbin/.
endef

$(eval $(call BuildPackage,morse-mgmt-iface))
