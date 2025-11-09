#
# Copyright 2022 Morse Micro
#
# This is free software, licensed under the GNU General Public License v3.
# See /LICENSE for more information.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=morse-wavemon
PKG_RELEASE=2

PKG_VERSION:=0.9.5-3

PKG_LICENSE:=GPL-3.0+
PKG_LICENSE_FILES:=LICENSE

PKG_SOURCE_VERSION:=784ba651e42a33b52accde6059e4756c3e61fa42
PKG_SOURCE_URL:=https://github.com/MorseMicro/wavemon.git
PKG_HASH:=0815f68470b472e850c1455618907bd1c7ca64764b746806c9483bd65f25364c
PKG_SOURCE_PROTO:=git

PKG_MAINTAINER:=Morse Micro <info@morsemicro.com>
PKG_BUILD_PARALLEL:=1

include $(INCLUDE_DIR)/package.mk

define Package/morse-wavemon
  SECTION:=utils
  CATEGORY:=Network
  TITLE:=Morse Micro WIFI HaLow aware wavemon
  DEPENDS:= +kmod-morse +libnl +libncurses +nload
  FILES:=\
	$(PKG_BUILD_DIR)/wavemon
  PROVIDES:=morse-wavemon
endef

# When libcap is enabled in the build - eg via wireshark additions
# autoconf picks it up as an available library to compile against,
# but a lack of build dependency causes a failure to link against
# the libcap shared library.
# In order maintain build compatibility across our platforms, I'm
# opting to force a build without libcap - as this is what has been
# built on our boards in the past.
# An alternative would be to enable the libcap package for all boards
# and add the libcap build dependency instead.
CONFIGURE_ARGS += \
	--without-libcap

TARGET_CFLAGS += -I$(STAGING_DIR)/usr/include/libnl3
TARGET_LDFLAGS += -lnl-3 -lnl-genl-3 -lm

define Package/morse-wavemon/install
	$(INSTALL_DIR) $(1)/sbin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/wavemon $(1)/sbin/
	$(INSTALL_BIN) ./files/sbin/pt $(1)/sbin/
endef

$(eval $(call BuildPackage,morse-wavemon))
