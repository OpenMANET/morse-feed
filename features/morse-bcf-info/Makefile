include $(TOPDIR)/rules.mk

PKG_NAME:=morse-bcf-info
PKG_VERSION:=1.0
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/morse-bcf-info
  SECTION:=utils
  CATEGORY:=Morse Micro
  SUBMENU:=Features
  TITLE:=Parse Morse wifi chip BCF files and emit JSON metadata
  DEPENDS:=+libc +libelf
endef

define Package/morse-bcf-info/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/$(PKG_NAME) $(1)/usr/bin/
endef

$(eval $(call BuildPackage,morse-bcf-info))
