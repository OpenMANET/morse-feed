#
# Copyright (C) 2022 Morse Micro
#


include $(TOPDIR)/rules.mk

PKG_NAME:=dpp-handler
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/dpp-handler
  SECTION:=net
  CATEGORY:=Morse Micro
  SUBMENU:=Features
  TITLE:=Handle DPP actions/results for Morse S1G hostapd/wpa_supplicant
  MAINTAINER:=Morse Micro
  DEPENDS:= wpa_supplicant_s1g +libwpa_client_s1g
endef

define Package/dpp-handler/description
  This package adds a ubus (rpcd ucode) handler for DPP related
  actions (push button to initiate, and set UCI config if successful).
  Currently, success is detected by a wpa_event_listener.
endef

define Package/dpp-handler/install
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/wpa_event_listener 	$(1)/usr/sbin
	$(INSTALL_DIR) $(1)/usr/share/rpcd/ucode
	$(INSTALL_DATA) ./files/usr/share/rpcd/ucode/* $(1)/usr/share/rpcd/ucode
	$(INSTALL_DIR) $(1)/usr/share/dpp-handler
	$(INSTALL_BIN) ./files/usr/share/dpp-handler/* $(1)/usr/share/dpp-handler
endef

$(eval $(call BuildPackage,dpp-handler))