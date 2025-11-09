include $(TOPDIR)/rules.mk


PKG_NAME:=dpp-qrcode-key
PKG_RELEASE=1

PKG_MAINTAINER:=Morse Micro

include $(INCLUDE_DIR)/package.mk

define Package/dpp-qrcode-key
  SECTION:=utils
  CATEGORY:=Morse Micro
  SUBMENU:=Features
  TITLE:=Recovers the DPP private key (or creates one if doesn't exist) and generates a qrcode
  # NB if a persistent-vars-storage binary is present, it will use this to discover
  # the dpp_priv_key, otherwise a new one will be generated on every factory reset.
  DEPENDS:=+qrencode +openssl-util
endef

define Build/Compile

endef

define Package/dpp-qrcode-key/install
	$(INSTALL_DIR) $(1)/etc/hotplug.d/ieee80211
	$(INSTALL_BIN) ./files/etc/hotplug.d/ieee80211/* $(1)/etc/hotplug.d/ieee80211/
endef

$(eval $(call BuildPackage,dpp-qrcode-key))
