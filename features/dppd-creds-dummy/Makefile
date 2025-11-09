include $(TOPDIR)/rules.mk


PKG_NAME:=dppd-creds-dummy
PKG_RELEASE=1

PKG_MAINTAINER:=The Customer

include $(INCLUDE_DIR)/package.mk

# "TheCustomer" value for CERT_HOSTNAME is just a dummy value, and needs to updated
# according to your own hostname. 

# CERT_HOSTNAME = TheCustomer
# SUBJECT_ALT_NAME = "DNS:$(CERT_HOSTNAME).local"
# SUBJECT_ALT_NAME += ",DNS:$(CERT_HOSTNAME)-2,DNS:$(CERT_HOSTNAME)-2.local"
# SUBJECT_ALT_NAME += ",DNS:$(CERT_HOSTNAME)-3,DNS:$(CERT_HOSTNAME)-3.local"
# SUBJECT_ALT_NAME += ",DNS:$(CERT_HOSTNAME)-4,DNS:$(CERT_HOSTNAME)-4.local"
# EXT = "[v3_cert] \\n\
# basicConstraints = CA:FALSE \\n\
# subjectAltName = '$(SUBJECT_ALT_NAME)'\\n\
# keyUsage = digitalSignature, keyEncipherment \\n\
# extendedKeyUsage = 1.3.6.1.5.5.7.3.1"

define Package/dppd-creds-dummy
  SECTION:=Utilities
  CATEGORY:=Utilities
  PROVIDES:=dppd-creds
  TITLE:=DPP daemon credentials generator.
endef


# This credential package is for Demo purposes only and is not secure as the server private key is published. 
# In order to have a secure connection between DPP mobile app and the router, you'll need to follow the instructions in
# files/README to generate your own certificate to sign the keys and update the compile step to sign your keys and 
# install step to copy your signed.

define Build/Compile
	openssl ecparam -genkey -name prime256v1 -noout -out $(PKG_BUILD_DIR)/key.pem
	openssl ecparam -genkey -name prime256v1 -noout -out $(PKG_BUILD_DIR)/ppkey.pem

	# openssl req -nodes -newkey rsa:4096 -keyout $(PKG_BUILD_DIR)/server.key -out $(PKG_BUILD_DIR)/server.csr -subj "/C=AU/O=Morse Micro/OU=Engineering/CN=$(CERT_HOSTNAME)"
	# echo -e "$(EXT)" > $(PKG_BUILD_DIR)/auto_ext.conf

	# openssl x509 -req -in $(PKG_BUILD_DIR)/server.csr -CA creds/ca.pem -CAkey creds/ca.key -CAcreateserial -days 1460 \
    #       -out $(PKG_BUILD_DIR)/server.pem -extensions v3_cert -extfile $(PKG_BUILD_DIR)/auto_ext.conf
endef

define Package/dppd-creds-dummy/description
 Generates the needed credentials for dpp daemon.
endef

define Package/dppd-creds-dummy/install
	$(INSTALL_DIR) $(1)/etc/dppd/
	$(INSTALL_DATA) -m 0444 -D $(PKG_BUILD_DIR)/key.pem       	$(1)/etc/dppd/key.pem
	$(INSTALL_DATA) -m 0444 -D $(PKG_BUILD_DIR)/ppkey.pem     	$(1)/etc/dppd/ppkey.pem
	$(INSTALL_DATA) -m 0666 -D files/etc/dppd/auth_secrets.txt 	$(1)/etc/dppd/auth_secrets.txt

	$(INSTALL_DATA) -m 0444 -D files/etc/dppd/server.key    	$(1)/etc/dppd/server.key
	$(INSTALL_DATA) -m 0444 -D files/etc/dppd/server.pem    	$(1)/etc/dppd/server.pem

endef

$(eval $(call BuildPackage,dppd-creds-dummy))
