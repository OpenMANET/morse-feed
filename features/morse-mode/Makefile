include $(TOPDIR)/rules.mk

PKG_NAME:=morse-mode
PKG_RELEASE=1

PKG_LICENSE:=
PKG_LICENSE_FILES:=

PKG_MAINTAINER:=Morse Micro

include $(INCLUDE_DIR)/package.mk

define Package/morse-mode
  SECTION:=utils
  CATEGORY:=Morse Micro
  SUBMENU:=Features
  TITLE:=Access morse mode info via ubus
  DEPENDS:=+netifd-morse +morse-regdb
endef

define Build/Compile
endef

define Package/morse-mode/install
	$(INSTALL_DIR) $(1)/usr/share/rpcd/ucode
	$(INSTALL_BIN) ./files/usr/share/rpcd/ucode/* $(1)/usr/share/rpcd/ucode
endef


$(eval $(call BuildPackage,morse-mode))
