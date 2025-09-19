#
# Copyright 2022 Morse Micro
#
# This is free software, licensed under the 3-Clause BSD License.
# See /LICENSE for more information.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=hostapd_s1g
PKG_RELEASE=2

PKG_VERSION:=1.15.3

PKG_LICENSE:=BSD-3-Clause

PKG_SOURCE_VERSION:=$(PKG_VERSION)
PKG_SOURCE_URL:=https://github.com/MorseMicro/hostap.git
PKG_HASH:=b8aca9353fa51e65836146ea6fdc966bc719ed67b7c217bc1934a2d063380056
PKG_SOURCE_PROTO:=git

PKG_MAINTAINER:=Morse Micro <info@morsemicro.com>
PKG_BUILD_PARALLEL:=1

PKG_CONFIG_DEPENDS:= \
	CONFIG_PACKAGE_kmod-morse \
	CONFIG_PACKAGE_kmod-cfg80211 \
	CONFIG_PACKAGE_hostapd \
	CONFIG_PACKAGE_hostapd-basic \
	CONFIG_PACKAGE_hostapd-mini \
	CONFIG_WPA_RFKILL_SUPPORT \
	CONFIG_DRIVER_WEXT_SUPPORT \
	CONFIG_DRIVER_11N_SUPPORT \
	CONFIG_DRIVER_11AC_SUPPORT \
	CONFIG_DRIVER_11AX_SUPPORT \
	CONFIG_WPA_ENABLE_WEP

include $(INCLUDE_DIR)/package.mk

MAKE_FLAGS += \
	MORSE_VERSION=$(PKG_VERSION)

MMHOSTAPD_CONFIG_ENABLE = \
	CONFIG_INTERNAL_LIBTOMMATH \
	CONFIG_DEBUG_FILE \
	CONFIG_DEBUG_SYSLOG \
	CONFIG_PMKSA_CACHE_EXTERNAL \
	CONFIG_SAE \
	CONFIG_SAE_PK \
	CONFIG_TESTING_OPTIONS \
	CONFIG_WNM \
	CONFIG_DRIVER_ACS \
	CONFIG_DRIVER_HOSTAP \
	CONFIG_DRIVER_NL80211 \
	CONFIG_DRIVER_NL80211_QCA \
	CONFIG_HS20 \
	CONFIG_IEEE80211AC \
	CONFIG_IEEE80211N \
	CONFIG_IEEE80211AH \
	CONFIG_IEEE80211R \
	CONFIG_INTERWORKING \
	CONFIG_FULL_DYNAMIC_VLAN \
	CONFIG_VLAN_NETLINK \
	CONFIG_OWE \
	CONFIG_LIBNL32 \
	CONFIG_DPP \
	CONFIG_DPP2 \
	CONFIG_WPS \
	CONFIG_WPS_UPNP \
	CONFIG_WPS_NFC

MMHOSTAPD_CONFIG_SET = \
	NEED_LINUX_IOCTL \
	CONFIG_DPP \
	CONFIG_SAE

MMHOSTAPD_CONFIG_DISABLE = \
    CONFIG_DRIVER_NONE \
	CONFIG_DRIVER_RTW \
	CONFIG_DRIVER_WIRED

MMHOSTAPD_CONFIG_EDITS += 's/\#\(CONFIG_TLS=openssl\)/\1/'

ifeq ($(CONFIG_MORSE_HOSTAPD_S1G_ACS),y)
	MMHOSTAPD_CONFIG_ENABLE += CONFIG_ACS
endif

ifeq ($(CONFIG_MORSE_HOSTAPD_S1G_EAP),y)
	MMHOSTAPD_CONFIG_EDITS += 's/\#\(CONFIG_EAP\)/\1/'
	MMHOSTAPD_CONFIG_ENABLE += \
		CONFIG_RADIUS_SERVER \
		CONFIG_TLSV1 \
		CONFIG_TLSV11 \
		CONFIG_TLSV12
else
	MMHOSTAPD_CONFIG_DISABLE += CONFIG_HOSTAPD_EAP
	MMHOSTAPD_CONFIG_ENABLE += \
		CONFIG_NO_ACCOUNTING \
		CONFIG_NO_RADIUS
endif

define Package/hostapd_s1g
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=WirelessAPD
  TITLE:=Morse Micro HaLow hostapd
  DEPENDS:= +kmod-morse +libnl +libopenssl +libubus
  USERID:=network=101:network=101
  PROVIDES:=hostapd_s1g
endef

define Package/hostapd_s1g/description
 This package contains a full featured Morse Micro patched
 Authenticator.
endef

define Package/hostapd_s1g/config
    source "$(SOURCE)/Config.in"
endef

MMHOSTAPD_CONFIG = $(PKG_BUILD_DIR)/hostapd/.config

define Build/Prepare
    $(call Build/Prepare/Default)
	$(CP) $(PKG_BUILD_DIR)/hostapd/defconfig $(MMHOSTAPD_CONFIG)
	sed -i $(patsubst %,-e 's/^#\(%=\)/\1/',$(MMHOSTAPD_CONFIG_ENABLE)) \
		$(patsubst %,-e 's/^\(%=\)/#\1/',$(MMHOSTAPD_CONFIG_DISABLE)) \
		$(patsubst %,-e '1i%=y',$(MMHOSTAPD_CONFIG_SET)) \
		$(patsubst %,-e %,$(MMHOSTAPD_CONFIG_EDITS)) \
		$(MMHOSTAPD_CONFIG)
endef

TARGET_CPPFLAGS := \
	-I$(STAGING_DIR)/usr/include/libnl3 \
	-I$(PKG_BUILD_DIR)/src/crypto \
	$(TARGET_CPPFLAGS) \
	-DCONFIG_LIBNL20 \
	-D_GNU_SOURCE

TARGET_LDFLAGS += -lnl-3 -lnl-genl-3 -lnl-route-3
TARGET_LDFLAGS += -lm -lpthread -lcrypto -lssl

TARGET_LDFLAGS += -lrt
TARGET_LDFLAGS_C += -lrt

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
	+$(call Build/RunMake,hostapd, \
		hostapd_s1g hostapd_cli_s1g \
	)
endef

define Package/hostapd_s1g/install
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/hostapd/hostapd_s1g $(1)/usr/sbin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/hostapd/hostapd_cli_s1g $(1)/usr/sbin
endef

$(eval $(call BuildPackage,hostapd_s1g))
