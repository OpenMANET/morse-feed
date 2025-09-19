#
# Copyright (C) 2024 Morse Micro
#

include $(TOPDIR)/rules.mk

PKG_NAME:=morse-modeswitch-button
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/morse-modeswitch-button
  SECTION:=utils
  CATEGORY:=Base system
  TITLE:=Morse Micro Button Functionality
  MAINTAINER:=Morse Micro
  DEPENDS:=+netifd-morse persistent-vars-storage
endef

define Package/morse-modeswitch-button/description
  Add a button handler script for morse devices.
endef

define Build/Compile

endef

define Package/morse-modeswitch-button/install
	$(INSTALL_DIR) $(1)/etc/rc.button
	$(INSTALL_BIN) ./files/etc/rc.button/BTN_0 $(1)/etc/rc.button/
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/etc/uci-defaults/* $(1)/etc/uci-defaults/.
endef

$(eval $(call BuildPackage,morse-modeswitch-button))
