#
# Copyright 2023 Morse Micro
#
# This is free software, licensed under the 3-Clause BSD License.
#

# Because the contents of morse_regdb are private, this package does
# some tricky things to _avoid_ downloading under normal circumstances,
# instead using a cached file stored in this repository. If you'd like
# to regenerate the cached file, do:
#
#   make package/morse-regdb/clean package/morse-regdb/download package/morse-regdb/compile V=sc REGENERATE=1
#
include $(TOPDIR)/rules.mk


PKG_NAME:=morse-regdb
PKG_RELEASE:=1
PKG_BUILD_DEPENDS:=python3/host

PKG_SOURCE_VERSION:=v2.2.1
# This points to an internal repo, but the repo is not used unless REGENERATE is set
# (see initial comment).
PKG_SOURCE_URL:=ssh://git@bitbucket.org/morsemicro/morse_regdb.git
PKG_SOURCE_PROTO:=git
PKG_MIRROR_HASH:=39f04ac799341e7a07d256c89ad8d30e22848f28af211a2a313bf9a16e5a6311

PKG_VERSION:=$(PKG_SOURCE_VERSION)

include $(INCLUDE_DIR)/package.mk

# Skip download unless REGENERATE is on.
# This must occur after including package.mk, as PKG_SKIP_DOWNLOAD is defined there.
PKG_SKIP_DOWNLOAD=$(USE_SOURCE_DIR)$(USE_GIT_TREE)$(USE_GIT_SRC_CHECKOUT)$(if $(REGENERATE),,1)

define Package/morse-regdb
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Regulatory data for 802.11ah
  URL:=https://bitbucket.org/morsemicro/morse_regdb/src/master/
  PKGARCH:=all
endef

define Package/morse-regdb/description
	Regulatory data for 802.11ah in a csv.
endef

define Package/morse-regdb/config
	config MORSE_REGDB_COUNTRY_CODE_FILTER
		string "Two letter country codes to filter in, separated by |"
		depends on PACKAGE_morse-regdb
		help
			Filter the country codes in the regulatory database.
			Enter a list of two letter country codes separated by |.
			Leave blank to include all countries.
			This only filters the channels.csv file, which affects the choices
			available in the UI but does not otherwise limit the capabilities
			of the device.
	config MORSE_REGDB_CHANNEL_NEGATIVE_FILTER
		string "Channel number to filter out, separated by |"
		depends on PACKAGE_morse-regdb
		help
			Filter out channels from regulatory database.
			Enter a list of channels separated by |.
			Leave blank to include all channels.
			This only filters the channels.csv file, which affects the choices
			available in the UI but does not otherwise limit the capabilities
			of the device.
endef

define Build/Prepare
	$(if $(REGENERATE),$(call Build/Prepare/Default))
endef

FILTER_ARG := $(strip $(subst ",,$(CONFIG_MORSE_REGDB_COUNTRY_CODE_FILTER)))
ifeq ($(FILTER_ARG),)
FILTER := cat
else
FILTER := awk -F, 'NR==1 || ($$$$1 ~ /^($(FILTER_ARG))$$$$/)'
endif

FILTER_ARG := $(strip $(subst ",,$(CONFIG_MORSE_REGDB_CHANNEL_NEGATIVE_FILTER)))
ifeq ($(FILTER_ARG),)
FILTER += | cat
else
FILTER += | awk -F, 'NR==1 || !($$$$3 ~ /^($(FILTER_ARG))$$$$/)'
endif

define Build/Compile
	$(if $(REGENERATE),
		mkdir -p artefacts
		python3 $(PKG_BUILD_DIR)/regdbconverter.py -v -f csv $(PKG_BUILD_DIR)/regdb_Sub-1_GHz.tsv > artefacts/repo_channels.csv
		find patch/ -type f -name '*.patch' -print0 | sort -z | xargs -r -t -0 -n 1 patch -p1 -i
	)

	mkdir -p $(PKG_BUILD_DIR)/artefacts
	# Mash the 5g shim channels in.
	python3 add_5g_shim_channels.py < artefacts/repo_channels.csv | $(FILTER) > $(PKG_BUILD_DIR)/artefacts/channels.csv
endef

define Package/morse-regdb/install
	$(INSTALL_DIR) $(1)/usr/share/morse-regdb
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/artefacts/* $(1)/usr/share/morse-regdb
	# Make channels.csv accessible from the web.
	$(INSTALL_DIR) $(1)/www
	ln -sf /usr/share/morse-regdb/channels.csv $(1)/www/halow-channels.csv
endef

$(eval $(call BuildPackage,morse-regdb))
