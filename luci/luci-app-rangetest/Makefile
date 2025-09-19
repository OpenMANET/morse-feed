include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI Range Testing Tool UI
LUCI_DEPENDS:=+luci-base +umdns +luci-lib-httpclient +libiwinfo +iperf3 uhttpd

PKG_LICENSE:=Apache-2.0

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature