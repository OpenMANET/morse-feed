include $(TOPDIR)/rules.mk

PKG_NAME:=smart_manager
PKG_VERSION:=1.16.4
PKG_RELEASE=1


PKG_LICENSE:=BSD-3-Clause

PKG_SOURCE_URL:=https://github.com/MorseMicro/smart-manager.git
PKG_SOURCE_PROTO:=git
PKG_SOURCE_VERSION:=$(PKG_VERSION)
PKG_HASH:=cd19357aa658f421c2bbb564ab2d6eafe78899e6f4e530e048f4ea51e548faf1

PKG_MAINTAINER:=Morse Micro
PKG_BUILD_PARALLEL:=1
PKG_BUILD_DEPENDS:=scons/host

include $(INCLUDE_DIR)/package.mk
include ../../include/scons.mk

define Package/smart_manager
  SECTION:=net
  CATEGORY:=Morse Micro
  SUBMENU:=Features
  TITLE:=Morse Micro HaLow DCS Smart Manager
  DEPENDS:= +kmod-morse +libnl +libpthread +libconfig +hostapd_s1g
  USERID:=network=101:network=101
endef

SCONS_OPTIONS+="MORSE_VERSION=$(PKG_VERSION)"

define Build/Configure
	(cd $(PKG_BUILD_DIR); \
		$(SCONS_VARS) scons $(SCONS_OPTIONS) \
	)
endef

define Package/smart_manager/install
	$(INSTALL_DIR) $(1)/sbin
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_DIR) $(1)/usr/share/smart_manager
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/build/smart_manager $(1)/sbin/
	$(INSTALL_BIN) ./files/etc/init.d/smart_manager $(1)/etc/init.d/
	$(INSTALL_BIN) ./files/etc/uci-defaults/50-smart_manager $(1)/etc/uci-defaults/
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/build/modules/dcs/dcs.mmext $(1)/usr/share/smart_manager/
endef

$(eval $(call BuildPackage,smart_manager))
