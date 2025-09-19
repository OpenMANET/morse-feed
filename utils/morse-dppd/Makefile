#
# Copyright (C) 2023 Morse Micro
#
# This is free software, licensed under the GNU General Public License v2.
# See /LICENSE for more information.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=morse-dppd
PKG_RELEASE:=1

PKG_VERSION:=1.15.3

PKG_SOURCE_VERSION:=$(PKG_VERSION)
PKG_SOURCE_URL:=https://github.com/MorseMicro/dpp-daemon.git
PKG_SOURCE_PROTO:=git
PKG_HASH:=70fa804b19687a3c15f7f401f4f287df0ea2b19596544c21402962b4e6e2bd9b

MAKE_PATH:=daemon

include $(INCLUDE_DIR)/package.mk

# These Flags here are supposed to be inside the dppd's makefile.
# They are there, but, instead of "CFLAGS +=" they've used "CFLAGS ?="
# Which makes it impossible to just add the OpenWrt specific flags.
# so, We have to redefine all of them here and append them to OpenWrt CFLAGS.
TARGET_CFLAGS += \
-I$(PKG_BUILD_DIR)/$(MAKE_PATH) \
-I$(PKG_BUILD_DIR)/$(MAKE_PATH)/include \
-I$(PKG_BUILD_DIR)/$(MAKE_PATH)/backend/wpa_ctrl  \
-I$(PKG_BUILD_DIR)/$(MAKE_PATH)/backend/wpa_ctrl/utils \
-I$(PKG_BUILD_DIR)/$(MAKE_PATH)/backend/wpa_ctrl/common \
-I$(STAGING_DIR)/usr/include/libnl3 \
-DHOSTAPD \
-DHOSTAPD_DUMP_STATE \
-DCONFIG_CTRL_IFACE_UNIX \
-DCONFIG_CTRL_IFACE \
-DCONFIG_RSN_PREAUTH  \
-DCONFIG_DRIVER_HOSTAP  \
-DCONFIG_DRIVER_NL80211 \
-DCONFIG_ERP \
-DEAP_SERVER_MD5 \
-DEAP_SERVER_TLS \
-DEAP_SERVER_PEAP \
-DEAP_SERVER_TTLS \
-DEAP_SERVER_MSCHAPV2 \
-DEAP_SERVER_GTC \
-DEAP_SERVER_IDENTITY \
-DEAP_SERVER \
-DPKCS12_FUNCS \
-DEAP_TLS_FUNCS \
-DTLS_DEFAULT_CIPHERS=\""DEFAULT:!EXP:!LOW"\" \
-DCONFIG_DES \
-DCONFIG_SHA256 \
-DCONFIG_IPV6 \
-DNEED_AP_MLME

# Add CFLAGS to suppress warnings about the usage of deprecated OpenSSL APIs.
TARGET_CFLAGS += -Wno-deprecated-declarations

define Package/morse-dppd
  SECTION:=Utilities
  CATEGORY:=Utilities
  TITLE:=MorseMicro 802.11ah DPP Daemon
  MAINTAINER:=Morse Micro
  DEPENDS:=dppd-creds +libnl +libnl-genl +libopenssl +libncurses +libmicrohttpd-ssl +avahi-utils +libwpa_client_s1g
endef

define Package/morse-dppd/description
 MorseMicro 802.11ah Device Provisioning Protocol Daemon
endef

define Package/morse-dppd/install
	$(INSTALL_DIR) $(1)/usr/bin/
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/$(MAKE_PATH)/build/$(ARCH)/dppd $(1)/usr/bin/
	$(INSTALL_BIN) ./files/etc/init.d/dppd $(1)/etc/init.d/
endef

$(eval $(call BuildPackage,morse-dppd))
