#
# Copyright 2022 Morse Micro
#
# This is free software, licensed under the 3-Clause BSD License.
# See /LICENSE for more information.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=wpa_supplicant_s1g
PKG_RELEASE=2

PKG_VERSION:=1.15.3

PKG_LICENSE:=BSD-3-Clause

PKG_SOURCE_VERSION:=$(PKG_VERSION)
PKG_SOURCE_URL:=https://github.com/MorseMicro/hostap.git
PKG_HASH:=13f8f9a14d99e53c5280ccc43492570f6803d87a326416c92de903f69448b9d5
PKG_SOURCE_PROTO:=git

PKG_MAINTAINER:=Morse Micro <info@morsemicro.com>
PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk

MAKE_FLAGS += \
	MORSE_VERSION=$(PKG_VERSION)

# Add support for simple background scan
MMWPA_SUPPLICANT_CONFIG_SET = \
	CONFIG_UBUS


MMWPA_SUPPLICANT_CONFIG_ENABLE = \
	CONFIG_IEEE80211AC \
	CONFIG_IEEE80211N \
	CONFIG_IEEE80211R \
	CONFIG_INTERNAL_LIBTOMMATH \
	CONFIG_DEBUG_FILE \
	CONFIG_MATCH_IFACE \
	CONFIG_LIBNL32 \
	CONFIG_DRIVER_WEXT \
	CONFIG_DRIVER_NL80211 \
	CONFIG_DRIVER_NL80211_QCA \
	CONFIG_DRIVER_WIRED \
	CONFIG_IEEE8021X_EAPOL \
	CONFIG_WPS \
	CONFIG_WPS_ER \
	CONFIG_WPS_NFC \
	CONFIG_WPS_REG_DISABLE_OPEN \
	CONFIG_PKCS12 \
	CONFIG_CTRL_IFACE \
	CONFIG_READLINE \
	CONFIG_IEEE80211W \
	CONFIG_INTERNAL_LIBTOMMATH_FAST \
	CONFIG_DEBUG_SYSLOG \
	CONFIG_DEBUG_SYSLOG_FACILITY \
	CONFIG_INTERWORKING \
	CONFIG_HS20 \
	CONFIG_MATCH_IFACE \
	CONFIG_AP \
	CONFIG_P2P \
	CONFIG_IBSS_RSN \
	CONFIG_OWE \
	CONFIG_DPP \
	CONFIG_DPP2 \
	CONFIG_DPP3 \
	CONFIG_SAE \
	CONFIG_SAE_PK \
	CONFIG_TESTING_OPTIONS \
	CONFIG_PMKSA_CACHE_EXTERNAL \
	CONFIG_WNM \
	CONFIG_IPV6

MMWPA_SUPPLICANT_CONFIG_DISABLE = \
	CONFIG_BGSCAN_SIMPLE \
	CONFIG_SMARTCARD \
	CONFIG_READLINE

MMWPA_SUPPLICANT_CONFIG_EDITS += 's/\#\(CONFIG_TLS=openssl\)/\1/'

ifeq ($(CONFIG_MORSE_WPA_SUPPLICANT_S1G_MESH_NETWORKING),y)
	MMWPA_SUPPLICANT_CONFIG_ENABLE += CONFIG_MESH
endif

ifeq ($(CONFIG_MORSE_WPA_SUPPLICANT_S1G_EAP),y)
	MMWPA_SUPPLICANT_CONFIG_ENABLE += \
		CONFIG_EAP_PEAP \
		CONFIG_EAP_MD5 \
		CONFIG_EAP_MSCHAPV2 \
		CONFIG_EAP_TLS \
		CONFIG_EAP_TLSV1_3 \
		CONFIG_EAP_TTLS \
		CONFIG_EAP_GTC \
		CONFIG_EAP_PWD
endif

ifeq ($(CONFIG_MORSE_WPA_SUPPLICANT_S1G_DBUS),y)
	MMWPA_SUPPLICANT_CONFIG_ENABLE += CONFIG_CTRL_IFACE_DBUS_NEW
endif

define Package/wpa_supplicant_s1g
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=WirelessAPD
  TITLE:=Morse Micro HaLow wpa_supplicant
  DEPENDS:= +kmod-morse +libnl +libopenssl +libubus +MORSE_WPA_SUPPLICANT_S1G_DBUS:dbus +MORSE_WPA_SUPPLICANT_S1G_DBUS:libdbus
  USERID:=network=101:network=101
  PROVIDES:=wpa_supplicant_s1g
endef

define Package/libwpa_client_s1g
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=WirelessAPD
  TITLE:=libwpa_client_s1g
  DEPENDS:=wpa_supplicant_s1g
endef

define Package/libwpa_client_s1g/description
  wpa_supplicant_s1g client library
endef

define Package/wpa_supplicant_s1g/config
    source "$(SOURCE)/Config.in"
endef

MMWPA_SUPPLICANT_CONFIG = $(PKG_BUILD_DIR)/wpa_supplicant/.config

define Build/Prepare
	$(call Build/Prepare/Default)
	$(CP) $(PKG_BUILD_DIR)/wpa_supplicant/defconfig $(MMWPA_SUPPLICANT_CONFIG)
	sed -i $(patsubst %,-e 's/^#\(%=\)/\1/',$(MMWPA_SUPPLICANT_CONFIG_ENABLE)) \
		$(patsubst %,-e 's/^\(%=\)/#\1/',$(MMWPA_SUPPLICANT_CONFIG_DISABLE)) \
		$(patsubst %,-e '1i%=y',$(MMWPA_SUPPLICANT_CONFIG_SET)) \
		$(patsubst %,-e %,$(MMWPA_SUPPLICANT_CONFIG_EDITS)) \
		$(MMWPA_SUPPLICANT_CONFIG)
endef

TARGET_CPPFLAGS := \
	-I$(STAGING_DIR)/usr/include/libnl3 \
	-I$(PKG_BUILD_DIR)/src/crypto \
	$(TARGET_CPPFLAGS) \
	-DCONFIG_LIBNL20 \
	-D_GNU_SOURCE

TARGET_CFLAGS += -Wno-deprecated-declarations

TARGET_LDFLAGS += -lnl-3 -lnl-genl-3 -lnl-route-3
TARGET_LDFLAGS += -lm -lpthread -lcrypto -lssl
ifeq ($(CONFIG_MORSE_WPA_SUPPLICANT_S1G_DBUS),y)
	TARGET_LDFLAGS += -ldbus-1
endif

define Build/RunMake
	CFLAGS="$(TARGET_CPPFLAGS) $(TARGET_CFLAGS)" \
	$(MAKE) $(MAKE_FLAGS) $(PKG_JOBS) -C $(PKG_BUILD_DIR)/$(1) \
		$(TARGET_CONFIGURE_OPTS) \
		$(DRIVER_MAKEOPTS) \
		LIBS="$(TARGET_LDFLAGS)" \
		LIBS_c="$(TARGET_LDFLAGS_C)" \
		AR="$(TARGET_CROSS)gcc-ar" \
		BCHECK= \
		$(2)
endef

define Build/Compile
	+$(call Build/RunMake,wpa_supplicant, \
		wpa_supplicant_s1g wpa_cli_s1g \
	)
	+$(call Build/RunMake,wpa_supplicant, libwpa_client_s1g.so)
endef

define Package/wpa_supplicant_s1g/install
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/wpa_supplicant/wpa_supplicant_s1g $(1)/usr/sbin/
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/wpa_supplicant/wpa_cli_s1g $(1)/usr/sbin/

ifeq ($(CONFIG_MORSE_WPA_SUPPLICANT_S1G_DBUS),y)
	$(INSTALL_DIR) $(1)/etc/dbus-1/system.d/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/wpa_supplicant/dbus/dbus-wpa_supplicant_s1g.conf $(1)/etc/dbus-1/system.d/wpa_supplicant_s1g.conf
endif
endef

define Package/libwpa_client_s1g/install
	$(INSTALL_DIR) $(1)/usr/lib/
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/wpa_supplicant/libwpa_client_s1g.so $(1)/usr/lib/
endef

define Build/InstallDev
	$(INSTALL_DIR) $(1)/usr/lib/
	$(INSTALL_DIR) $(1)/usr/include/
	$(CP) $(PKG_BUILD_DIR)/wpa_supplicant/libwpa_client_s1g.so		$(1)/usr/lib/
	$(CP) $(PKG_BUILD_DIR)/src/common/wpa_ctrl.h				$(1)/usr/include/wpa_ctrl.h
endef

$(eval $(call BuildPackage,wpa_supplicant_s1g))
$(eval $(call BuildPackage,libwpa_client_s1g))
