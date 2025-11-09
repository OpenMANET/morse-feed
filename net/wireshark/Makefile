#
# Copyright 2023 Morse Micro
#
# This is free software, licensed under the GNU General Public License v2.
# See /LICENSE for more information.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=wireshark
PKG_RELEASE:=1
PKG_VERSION:=4.4.2

# https://www.wireshark.org/download/src/all-versions/wireshark-4.4.2.tar.xz
PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.xz
PKG_SOURCE_URL:=https://www.wireshark.org/download/src/all-versions/
# https://www.wireshark.org/download/SIGNATURES-4.4.2.txt
PKG_HASH:=6053d97499c83feb87ce1d7f732d9c889c6c18bb334de67e65dca11483b0514e


PKG_LICENSE:=GPL-2.0
PKG_MAINTAINER:=Morse Micro <info@morsemicro.com>
PKG_INSTALL:=1

include $(INCLUDE_DIR)/package.mk
include $(INCLUDE_DIR)/cmake.mk
include $(INCLUDE_DIR)/nls.mk

define Package/wireshark
	SECTION:=utils
	CATEGORY:=Utilities
	URL:=https://wwww.wireshark.org
	TITLE:=Wireshark3
	DEPENDS:= +libgcrypt +glib2 +libpcap +libxml2 +libgnutls +libcap +libcares +libnl $(ICONV_DEPENDS) $(INTL_DEPENDS)
endef

define Package/wireshark/description
	Wireshark is a packet analyzer
endef

CMAKE_OPTIONS += -DBUILD_dumpcap=ON
CMAKE_OPTIONS += -DBUILD_tshark=ON
CMAKE_OPTIONS += -DENABLE_PCAP=ON
CMAKE_OPTIONS += -DBUILD_captype=ON
CMAKE_OPTIONS += -DBUILD_reordercap=ON
CMAKE_OPTIONS += -DBUILD_rawshark=ON
CMAKE_OPTIONS += -DBUILD_wireshark=OFF
CMAKE_OPTIONS += -DENABLE_LUA=OFF
CMAKE_OPTIONS += -DENABLE_ZLIB=OFF
CMAKE_OPTIONS += -DENABLE_PLUGINS=OFF
CMAKE_OPTIONS += -DENABLE_BCG729=OFF
CMAKE_OPTIONS += -DENABLE_BROTLI=OFF
CMAKE_OPTIONS += -DENABLE_ILBC=OFF
CMAKE_OPTIONS += -DENABLE_KERBEROS=OFF
CMAKE_OPTIONS += -DENABLE_LZ4=OFF
CMAKE_OPTIONS += -DENABLE_MINIZIP=OFF
CMAKE_OPTIONS += -DENABLE_SBC=OFF
CMAKE_OPTIONS += -DNABLE_SMI=OFF
CMAKE_OPTIONS += -DENABLE_SNAPPY=OFF
CMAKE_OPTIONS += -DENABLE_SPANDSP=OFF
CMAKE_OPTIONS += -DENABLE_ZSTD=OFF
CMAKE_OPTIONS += -DBUILD_androiddump=OFF
CMAKE_OPTIONS += -DBUILD_androiddump=OFF
CMAKE_OPTIONS += -DBUILD_capinfos=OFF
CMAKE_OPTIONS += -DBUILD_ciscodump=OFF
CMAKE_OPTIONS += -DBUILD_dcerpcidl2wrs=OFF
CMAKE_OPTIONS += -DBUILD_dftest=OFF
CMAKE_OPTIONS += -DBUILD_dpauxmon=OFF
CMAKE_OPTIONS += -DBUILD_editcap=OFF
CMAKE_OPTIONS += -DBUILD_fuzzshark=OFF
CMAKE_OPTIONS += -DBUILD_mergecap=OFF
CMAKE_OPTIONS += -DBUILD_mmdbresolve=OFF
CMAKE_OPTIONS += -DBUILD_randpkt=OFF
CMAKE_OPTIONS += -DBUILD_randpktdump=OFF
CMAKE_OPTIONS += -DBUILD_sdjournal=OFF
CMAKE_OPTIONS += -DBUILD_sharkd=OFF
CMAKE_OPTIONS += -DBUILD_sshdump=OFF
CMAKE_OPTIONS += -DBUILD_text2pcap=OFF
CMAKE_OPTIONS += -DBUILD_udpdump=OFF
CMAKE_OPTIONS += -DCMAKE_COLOR_MAKEFILE=OFF
CMAKE_OPTIONS += -DENABLE_CAP=OFF
CMAKE_OPTIONS += -DENABLE_GNUTLS=OFF
CMAKE_OPTIONS += -DENABLE_LIBXML2=OFF
CMAKE_OPTIONS += -DENABLE_NETLINK=OFF
CMAKE_OPTIONS += -DENABLE_NGHTTP2=OFF
CMAKE_OPTIONS += -DENABLE_OPUS=OFF
CMAKE_OPTIONS += -DENABLE_SMI=OFF

# lemon needs to compiled for the host, not target.
CMAKE_OPTIONS += -DLEMON_C_COMPILER="$(HOSTCC)"

# wireshark tries to compile and run a small app to check vsnprintf. this requires
# these two exitcodes to be defined. however, some other buildsystems such as void linux
# that uses musl, completely removed that test using a patch. Preferebly we are just setting
# these two defs here, to avoid using a patch. you can see void linux example here:
# https://github.com/void-linux/void-packages/blob/master/srcpkgs/wireshark/patches/HAVE_C99_VSNPRINTF.patch
CMAKE_OPTIONS += -DHAVE_C99_VSNPRINTF_EXITCODE="0"
CMAKE_OPTIONS += -DHAVE_C99_VSNPRINTF_EXITCODE__TRYRUN_OUTPUT="0"


define Package/wireshark/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/usr/bin/tshark $(1)/usr/bin/
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/usr/bin/captype $(1)/usr/bin/
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/usr/bin/dumpcap $(1)/usr/bin/
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/usr/bin/rawshark $(1)/usr/bin/
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/usr/bin/reordercap $(1)/usr/bin/
	$(INSTALL_DIR) $(1)/usr/lib
	$(CP) $(PKG_INSTALL_DIR)/usr/lib/lib*.so* $(1)/usr/lib

endef

$(eval $(call BuildPackage,wireshark))