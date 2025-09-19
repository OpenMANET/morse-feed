#
# Copyright 2022 Morse Micro
#
# This is free software, licensed under the GPL 2 license.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=morse-bundle
PKG_RELEASE=2

PKG_MAINTAINER:=Morse Micro

include $(INCLUDE_DIR)/package.mk

define Package/morse-bundle
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Morse Micro HaLow Bundle
  DEPENDS:= +morse-boot-prints \
            +gpiod-tools \
            +@BUSYBOX_CONFIG_PATCH \
            +rsync
  # patch is used by the bcm2711 specific init.d script which
  # helps migrate our config to distroconfig.txt.
endef

define Package/morse-bundle/description
 This package contains minor config/scripts adaptations for
 morse releases.
endef

define Build/Compile
endef

define Package/morse-bundle/install
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_DIR) $(1)/etc/board.d
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_DIR) $(1)/etc/sysctl.d
	$(INSTALL_DIR) $(1)/morse/scripts
	$(if $(CONFIG_TARGET_bcm27xx_bcm2711), \
		$(INSTALL_BIN) ./files/etc/init.d_bcm2711/* $(1)/etc/init.d/.)
	$(INSTALL_BIN) ./files/etc/uci-defaults/* $(1)/etc/uci-defaults/.
	$(if $(CONFIG_TARGET_ramips_mt76x8), \
		$(INSTALL_BIN) ./files/etc/uci-defaults-ramips/* $(1)/etc/uci-defaults/.
	)
	$(INSTALL_BIN) ./files/morse/scripts/* $(1)/morse/scripts/.
	$(INSTALL_BIN) ./files/etc/board.d/* $(1)/etc/board.d/.
	$(INSTALL_BIN) ./files/etc/init.d/* $(1)/etc/init.d/.
	$(INSTALL_BIN) ./files/etc/sysctl.d/* $(1)/etc/sysctl.d/
endef

$(eval $(call BuildPackage,morse-bundle))
