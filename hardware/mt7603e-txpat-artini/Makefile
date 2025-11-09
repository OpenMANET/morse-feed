#
# Copyright 2025 Morse Micro
#
# This is free software, licensed under the 3-Clause BSD License.
#

include $(TOPDIR)/rules.mk


PKG_NAME:=mt7603e-txpat-artini
PKG_RELEASE:=1
PKG_BUILD_DEPENDS:=python3/host

PKG_VERSION:=v1.0

include $(INCLUDE_DIR)/package.mk

define Package/mt7603e-txpat-artini
  SECTION:=net
  CATEGORY:=Morse Micro
  SUBMENU:=Hardware
  TITLE:=MT7603E Tx Power Adjustment Table for Artini
  PKGARCH:=all
endef

define Package/mt7603e-txpat-artini/description
	This package generates the MT7603E Tx Power Adjustment Table for Artini as a binary file.
endef


define Build/Compile
	# Generate the mt7603e_txpat for artini
	python3 generate_mt7603e_txpat.py --output $(PKG_BUILD_DIR)/mt7603e_txpat.bin
endef

define Package/mt7603e-txpat-artini/install
	$(INSTALL_DIR) $(1)/lib/firmware/
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/mt7603e_txpat.bin $(1)/lib/firmware/
endef

$(eval $(call BuildPackage,mt7603e-txpat-artini))
