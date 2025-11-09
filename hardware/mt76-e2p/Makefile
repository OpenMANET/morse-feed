include $(TOPDIR)/rules.mk

PKG_NAME:=mt76-e2p
PKG_RELEASE=1

PKG_MAINTAINER:=Morse Micro

include $(INCLUDE_DIR)/package.mk

define Package/mt76-e2p
  SECTION:=Utilities
  CATEGORY:=Morse Micro
  SUBMENU:=Hardware
  TITLE:=A tool to print and edit mt76 factory partition data.
  DEPENDS:= +kmod-mtd-rw
endef

define Package/mt76-e2p/description
  Replicates the interface of `iwpriv ra0 e2p`.
endef

define Build/Compile

endef

define Package/mt76-e2p/install
	$(INSTALL_DIR) $(1)/bin
	$(INSTALL_BIN) ./files/mt76-e2p $(1)/bin/mt76-e2p
endef

$(eval $(call BuildPackage,mt76-e2p))
