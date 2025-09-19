include $(TOPDIR)/rules.mk
include $(INCLUDE_DIR)/package.mk

PKG_NAME:=wizard-config
PKG_RELEASE=1

PKG_MAINTAINER:=Morse Micro

define Package/wizard-config
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Configure HaLow devices automatically on DHCP client success
  DEPENDS:=persistent-vars-storage @BUSYBOX_CONFIG_UDHCPC +umdns +ucode +ucode-mod-fs +ucode-mod-ubus +ucode-mod-uci +ucode-mod-math uhttpd
endef

define Build/Compile
endef

define Package/wizard-config/install
	$(INSTALL_DIR) $(1)/sbin
	$(INSTALL_BIN) ./files/sbin/wizard-config $(1)/sbin
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/wizard-config $(1)/etc/init.d/
	$(INSTALL_DIR) $(1)/etc/udhcpc.user.d
	$(INSTALL_BIN) ./files/etc/udhcpc.user.d/wizard-config $(1)/etc/udhcpc.user.d/
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/etc/uci-defaults/99-wizard-config $(1)/etc/uci-defaults/
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/etc/config/wizard-config $(1)/etc/config/
	$(INSTALL_DIR) $(1)/etc/umdns
endef

$(eval $(call BuildPackage,wizard-config))
