'use strict';
/* globals baseclass uci network */
'require baseclass';
'require uci';
'require network';

/* Various helpers so we can interact more easily with uci.
 *
 * e.g.
 * - getting values through levels of indirection
 * - creating sections if they don't exist
 */

function getZoneForNetwork(network) {
	const zoneSection = uci.sections('firewall', 'zone').find(z => L.toArray(z.network).includes(network));
	// Note that this returns the 'name' inside the zone (i.e. what is used in forwarding rules),
	// not the section name '.name'.
	return zoneSection?.['name'];
}

// Use F2 as prefix so that we know it's generated via this process (see below).
function getRandomMAC() {
	return 'F2:' + Array.from({ length: 5 }, () =>
		Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(':');
}

// This is used to generate a Bridge MAC address that's related to the MAC address on the HaLow module.
// This is particularly useful for prplmesh as a janky way of aligning MACs visible at
// different points.
// Use F2 as prefix so that we know it's generated via this process. Originally F2 was chosen to
// stay away from OpenWrt's method of auto-generating addresses if you started as 0c (the first octet
// of the Morse OUI) which it does if there are multiple wifi interfaces on the same radio.
//   i.e. 0c, 0e, ... , F2
// TODO - now this doesn't make sense: APP-3325
function getFakeMorseMAC(networkDevices) {
	for (const d of networkDevices) {
		if (d.getWifiNetwork() && d.getWifiNetwork().ubus('dev', 'iwinfo', 'hwmodes')?.includes('ah')) {
			if (d.getMAC()) {
				return 'F2:' + d.getMAC().slice(-14);
			}
		}
	}

	return null;
}

function getDefaultSSID() {
	return uci.get_first('system', 'system', 'hostname');
}

function getDefaultWifiKey() {
	const CHARS = 'abcdefghijklmnopqrstuvwxyz023456789';

	return uci.get_first('system', 'system', 'default_wifi_key') ?? Array.from({ length: 8 },
		() => CHARS.charAt(Math.floor(Math.random() * CHARS.length)));
}

function getOrCreateForwarding(srcZone, destZone, name = undefined) {
	// The code subsequent to this messes with firewall rules. However, if the
	// user hasn't changed what's in uci at all, we want to be able to issue
	// a 'save' on this page without destroying their firewall config
	// (i.e. if they have multiple forwards from a network in some way).
	// Therefore we detect this situation and do nothing.
	let existingForwarding = uci.sections('firewall', 'forwarding').find(f => f.src === srcZone && f.dest === destZone && f.enabled !== '0');
	if (existingForwarding) {
		return existingForwarding['.name'];
	}

	// Now it seems like the user has mutated something.

	// Make sure that the target has an appropriate setup for NAT.
	const zoneSection = uci.sections('firewall', 'zone').find(z => z['name'] === destZone);
	uci.set('firewall', zoneSection['.name'], 'mtu_fix', '1');
	uci.set('firewall', zoneSection['.name'], 'masq', '1');

	// Disable any other forwarding from this src (our dropdown only allows one).
	// Ideally we would like to delete here, but for now to avoid destroying
	// the default mmrouter/mmextender forwarding rules, we set enabled=0
	// (unfortunately, the LuCI pages at the moment don't understand enabled).
	for (const s of uci.sections('firewall', 'forwarding').filter(f => f.src === srcZone)) {
		uci.set('firewall', s['.name'], 'enabled', '0');
	}

	let existingDisabledForwarding = uci.sections('firewall', 'forwarding').find(f => f.src === srcZone && f.dest === destZone);
	if (existingDisabledForwarding) {
		uci.set('firewall', existingDisabledForwarding['.name'], 'enabled', '1');
		return existingDisabledForwarding['.name'];
	}

	// Finally, create a forwarding rule if necessary.
	const forwardingId = uci.add('firewall', 'forwarding', name);
	uci.set('firewall', forwardingId, 'src', srcZone);
	uci.set('firewall', forwardingId, 'dest', destZone);
	return forwardingId;
}

function getOrCreateZone(networkSectionId) {
	const zone = getZoneForNetwork(networkSectionId);
	if (zone) {
		return zone;
	}

	let proposedName = networkSectionId, i = 0;
	// Make sure we don't clash with either the section name or the actual name of the zone
	// to avoid confusion.
	while (uci.sections('firewall').some(s => [s['.name'], s.name].includes(proposedName))) {
		proposedName = `${networkSectionId}${++i}`;
	}

	// NB It's not necessary to name the zone here, but I think it makes things clearer.
	uci.add('firewall', 'zone', proposedName);
	uci.set('firewall', proposedName, 'name', proposedName);
	uci.set('firewall', proposedName, 'network', [networkSectionId]);
	uci.set('firewall', proposedName, 'input', 'ACCEPT');
	uci.set('firewall', proposedName, 'output', 'ACCEPT');
	uci.set('firewall', proposedName, 'forward', 'ACCEPT');

	return proposedName;
}

function createDhcp(dnsmasqName, networkSectionId) {
	let proposedName = `${networkSectionId}`, i = 0;
	while (uci.sections('dhcp').some(s => s['.name'] === proposedName)) {
		proposedName = `${networkSectionId}${++i}`;
	}

	uci.add('dhcp', 'dhcp', proposedName);
	uci.set('dhcp', proposedName, 'start', '100');
	uci.set('dhcp', proposedName, 'limit', '150');
	uci.set('dhcp', proposedName, 'leasetime', '12h');
	uci.set('dhcp', proposedName, 'interface', networkSectionId);
	if (!uci.get('dhcp', dnsmasqName)['.anonymous']) {
		uci.set('dhcp', proposedName, 'instance', dnsmasqName);
	}

	return proposedName;
}

function getOrCreateDhcp(dnsmasqName, networkSectionId) {
	const onSections = uci.sections('dhcp', 'dhcp').filter(dhcp => dhcp.interface === networkSectionId && dhcp.ignore !== '1' && (!dhcp.instance || dhcp.instance === dnsmasqName));
	const offSection = uci.sections('dhcp', 'dhcp').find(dhcp => dhcp.interface === networkSectionId && dhcp.ignore === '1' && (!dhcp.instance || dhcp.instance === dnsmasqName));
	if (onSections.length > 0) {
		return onSections[0]['.name'];
	} else if (offSection) {
		uci.unset('dhcp', offSection['.name'], 'ignore');
		return offSection['.name'];
	} else {
		return createDhcp(dnsmasqName, networkSectionId);
	}
}

function setupDnsmasq(dnsmasqName, networkSectionId) {
	// This is based on the necessary part of package/network/service/dnsmasq/file/dhcp.conf
	// (where necessary is overriding the default behaviour).
	uci.set('dhcp', dnsmasqName, 'domainneeded', '1');
	uci.set('dhcp', dnsmasqName, 'localise_queries', '1');
	uci.set('dhcp', dnsmasqName, 'rebind_localhost', '1');
	uci.set('dhcp', dnsmasqName, 'local', `/${networkSectionId}/`);
	uci.set('dhcp', dnsmasqName, 'domain', networkSectionId);
	uci.set('dhcp', dnsmasqName, 'expandhosts', '1');
	uci.set('dhcp', dnsmasqName, 'cachesize', '1000');
	uci.set('dhcp', dnsmasqName, 'authoritative', '1');
	uci.set('dhcp', dnsmasqName, 'readethers', '1');
	uci.set('dhcp', dnsmasqName, 'localservice', '1');
	uci.set('dhcp', dnsmasqName, 'ednspacket_max', '1232');
}

function getOrCreateDnsmasq(networkSectionId) {
	const dnsSections = uci.sections('dhcp', 'dnsmasq');
	const genericDnsSections = dnsSections.filter(dnsmasq => !dnsmasq.interface && !L.toArray(dnsmasq.notinterface).includes(networkSectionId));
	const interfaceDnsSections = dnsSections.filter(dnsmasq => L.toArray(dnsmasq.interface).includes(networkSectionId));

	if (genericDnsSections.length + interfaceDnsSections.length > 1) {
		console.error('More than one applicable dnsmasq for interface - probably broken config.');
	}

	if (genericDnsSections.length > 0) {
		return genericDnsSections[0]['.name'];
	} else if (interfaceDnsSections.length > 0) {
		return interfaceDnsSections[0]['.name'];
	} else if (dnsSections.length === 0) {
		const name = uci.add('dhcp', 'dnsmasq');
		setupDnsmasq(name, networkSectionId);

		return name;
	} else if (dnsSections.length === 1) {
		// There's exactly one dnsSection, but it's not available for our interface.
		// Let's just extend it to cover this interface.
		const dnsSection = dnsSections[0];
		if (dnsSection.interface) {
			uci.unset('dhcp', dnsSection['.name'], 'interface');
		}
		if (L.toArray(dnsSection.notinterface).includes(networkSectionId)) {
			uci.set('dhcp', dnsSection['.name'], 'notinterface', dnsSection.notinterface.filter(iface => iface === networkSectionId));
		}

		return dnsSection['.name'];
	} else {
		// There are multiple existing dnsSections, so we need to avoid clashes,
		// both in naming and in interfering with other sections.
		let proposedName = `${networkSectionId}_dns`, i = 0;
		while (uci.sections('dhcp').some(s => s['.name'] === proposedName)) {
			proposedName = `${networkSectionId}_dns${++i}`;
		}

		uci.add('dhcp', 'dnsmasq', proposedName);
		setupDnsmasq(proposedName, networkSectionId);
		uci.set('dhcp', proposedName, 'interface', [networkSectionId]);
		uci.set('dhcp', proposedName, 'localuse', '0');
		uci.set('dhcp', proposedName, 'notinterface', ['loopback']);

		return proposedName;
	}
}

/* Report if multiple devices are likely to appear on a network interface (i.e. bridge required).
 *
 * Unlike 'getNetworkDevices', this includes wireless ifaces (and double counts
 * wifi-ifaces that will generate multiple devices - e.g. WDS APs).
 */
function hasMultipleDevices(networkSectionId) {
	let count = getNetworkDevices(networkSectionId).length;

	for (const wifiIface of getNetworkWifiIfaces(networkSectionId)) {
		// TODO (APP-2823) I don't think wifiIface.mode 'mesh' is an appropriate trigger for this
		// (some confusion with prplmesh or +AP?), but for consistency with the old behaviour...
		count += (wifiIface.mode === 'ap' && wifiIface.wds === '1') || wifiIface.mode === 'mesh' ? 2 : 1;
	}

	return count > 1;
}

function forceBridge(networkSectionId, bridgeName, bridgeMAC = null) {
	const currentDevice = uci.get('network', networkSectionId, 'device');
	let bridge = uci.sections('network', 'device').find(s => s.type == 'bridge' && s.name == bridgeName);
	// Create a bridge device with the bridgeName if it doesn't exist
	if (!bridge) {
		bridge = uci.add('network', 'device');
		uci.set('network', bridge, 'name', bridgeName);
		uci.set('network', bridge, 'type', 'bridge');
		if (bridgeMAC)
			uci.set('network', bridge, 'macaddr', bridgeMAC);
	} else {
		// If bridge is mapped to any other network unset it
		for (const network of uci.sections('network', 'interface')) {
			if (network.device === bridgeName && network['.name'] !== networkSectionId) {
				uci.unset('network', network['.name'], 'device');
			}
		}
		if (bridgeMAC) {
			uci.set('network', bridge['.name'], 'macaddr', bridgeMAC);
		}
	}
	// Do nothing if the network is already on the expected bridge
	if (currentDevice != bridgeName) {
		// Remove any bridge attached to the network
		const existingBridge = uci.sections('network', 'device').find(s => s.type == 'bridge' && s.name == currentDevice);
		if (existingBridge) {
			uci.unset('network', networkSectionId, 'device');
			if (existingBridge.ports && existingBridge.ports.length > 0) {
				uci.set('network', bridge, 'ports', existingBridge.ports);
			}
			uci.unset('network', existingBridge, 'ports');
		}

		uci.set('network', networkSectionId, 'device', bridgeName);
	}
}

/* Check if we should add a bridge for the current network setup or remove a bridge.
 *
 * Be conservative: only remove a bridge if we need to, and only add a bridge if we need to.
 * This reduces the number of changes when interacting with the config page.
 */
function createOrRemoveBridgeAsNeeded(networkSectionId) {
	const currentDevice = uci.get('network', networkSectionId, 'device');
	const hasBridge = !!uci.sections('network', 'device').find(s => s.type == 'bridge' && s.name == currentDevice);
	const needBridge = hasMultipleDevices(networkSectionId);

	if (hasBridge && !needBridge) {
		// Do we need to remove this bridge because we have a wifi iface that can't be bridged?
		// (i.e. it's a sta/adhoc?)
		// Note that if we have multiple ifaces, we _can't_ safely remove the bridge; instead,
		// the frontend should fail validation in this situation.
		const wifiIfaces = getNetworkWifiIfaces(networkSectionId);
		// From the above hasMultipleDevices check, there should only be 0 or 1 wifi ifaces.
		if (wifiIfaces.length === 1) {
			const iface = wifiIfaces[0];

			if (iface.mode === 'adhoc' || (iface.mode === 'sta' && iface.wds !== '1')) {
				uci.unset('network', networkSectionId, 'device');
			}
		}
	} else if (!hasBridge && needBridge) {
		setBridgeWithPorts(networkSectionId, currentDevice ? [currentDevice] : []);
	}
}

const BRIDGED_NON_WDS_CLIENT_ERROR_TEMPLATE = _(
`The configuration for the "%s" network is not supported.

If a network has a non-WDS Wi-Fi client, it must be the only device.

This network currently has non-WDS Wi-Fi clients: %s

This network currently has other devices: %s

Please do one of:
 - remove the non-WDS Wi-Fi clients;
 - enable WDS for the Wi-Fi clients (if possible); or
 - remove all other devices from this network to leave a single non-WDS Wi-Fi client.
`);
const BRIDGED_PORT_SUMMARY_TEMPLATE = _('A "%s" port');
const BRIDGED_WIFI_SUMMARY_TEMPLATE = _('A %s Wi-Fi device in "%s" mode with SSID "%s"');

function validateBridge(networkSectionId, wifiDevices) {
	const currentDevice = uci.get('network', networkSectionId, 'device');
	const bridge = uci.sections('network', 'device').find(s => s.type == 'bridge' && s.name == currentDevice);

	if (!bridge) {
		return;
	}

	const wifiIfaces = getNetworkWifiIfaces(networkSectionId);
	const isNonWDSClient = wifiIface => (wifiIface.mode === 'adhoc' || (wifiIface.mode === 'sta' && wifiIface.wds !== '1'));
	const nonWDSWiFiClients = wifiIfaces.filter(isNonWDSClient);

	if (nonWDSWiFiClients.length) {
		const formatWifiDeviceSummary = wifiIface => BRIDGED_WIFI_SUMMARY_TEMPLATE.format(wifiDevices[wifiIface.device]?.get('type') ?? 'unknown', wifiIface.mode, wifiIface.ssid);

		const otherBridgedDevices = [
			...L.toArray(bridge.ports).map(port => BRIDGED_PORT_SUMMARY_TEMPLATE.format(port)),
			...wifiIfaces.filter(wifiIface => !isNonWDSClient(wifiIface)).map(formatWifiDeviceSummary),
		];
		throw new TypeError(BRIDGED_NON_WDS_CLIENT_ERROR_TEMPLATE.format(
			networkSectionId,
			['', ...nonWDSWiFiClients.map(formatWifiDeviceSummary)].join('\n - '),
			['', ...otherBridgedDevices].join('\n - '),
		));
	}
}

function setBridgeWithPorts(networkSectionId, ports) {
	const currentDevice = uci.get('network', networkSectionId, 'device');
	const existing = currentDevice && uci.sections('network', 'device').find(s => s.type == 'bridge' && s.name == currentDevice);
	if (existing) {
		if (ports.length > 0) {
			uci.set('network', existing['.name'], 'ports', ports);
		}

		return existing['name'];
	}

	const namePrefix = `br-${networkSectionId}`;
	let proposedName = namePrefix, i = 0;
	let bridgeSectionId;

	for (; ;) {
		const existingBridge = uci.sections('network', 'device').find(s => s.name === proposedName);
		if (!existingBridge) {
			bridgeSectionId = uci.add('network', 'device');
			uci.set('network', bridgeSectionId, 'name', proposedName);
			uci.set('network', bridgeSectionId, 'type', 'bridge');
			break;
		} else if (!uci.sections('network', 'interface').some(s => s.device === proposedName)) {
			// If it's currently unused, let's re-use.
			bridgeSectionId = existingBridge['.name'];
			break;
		}

		proposedName = `${namePrefix}${++i}`;
	}

	if (ports.length > 0) {
		uci.set('network', bridgeSectionId, 'ports', ports);
	}

	uci.set('network', networkSectionId, 'device', proposedName);
}

function getNetworkWifiIfaces(networkSectionId) {
	return uci.sections('wireless', 'wifi-iface')
		.filter(wifiIface => wifiIface.disabled !== '1' && wifiIface.network === networkSectionId);
}

function getNetworkDevices(sectionId) {
	const device = uci.get('network', sectionId, 'device');
	const bridge = uci.sections('network', 'device').find(s => s.name === device && s.type === 'bridge');
	let res;
	if (bridge) {
		res = bridge.ports;
	} else {
		res = device;
	}

	return res ? L.toArray(res) : [];
}

// Set the devices for a network section, creating a bridge if necessary.
function setNetworkDevices(sectionId, devices) {
	const device = uci.get('network', sectionId, 'device');
	const deviceSection = uci.sections('network', 'device')
		.find(s => s.name === device);

	if (device && deviceSection && deviceSection.type === 'bridge') {
		uci.set('network', deviceSection['.name'], 'ports', devices);
	} else if (devices.length === 1) {
		uci.set('network', sectionId, 'device', devices[0]);
	} else if (devices.length > 1) {
		setBridgeWithPorts(sectionId, devices);
	}
}

// Get all network interfaces (names of sections in uci network).
function getNetworkInterfaces() {
	return uci.sections('network', 'interface')
		.filter(s => s && s['.name'])
		.map(s => s['.name']);
}

// Return the batman interface for a network, or null if none exists.
// Note that this does NOT create a batman interface if one doesn't exist.
// USE setupBatmanOnNetwork TO CREATE IF NECESSARY
function getBatmanIfaceForNetwork(networkSectionId) {
	const ifaces = getNetworkInterfaces();
	if (!ifaces.includes(networkSectionId)) {
		return null;
	}
	for (const iface of ifaces) {
		const devSection = uci.sections('network', 'interface').find(s => s.name === iface);
		if (devSection && devSection.proto === 'batadv') {
			return iface;
		}
	}

	return null;
}

function setupBatmanDeviceOnNetwork(networkSectionId, gwMode = 'client') {
	const batmanIface = getBatmanIfaceForNetwork(networkSectionId);
	if (batmanIface) {
		return batmanIface;
	}

	const batmanDevice = uci.add('network', 'interface');
	uci.set('network', batmanDevice, 'name', 'bat0');
	uci.set('network', batmanDevice, 'proto', 'batadv');
	uci.set('network', batmanDevice, 'routing_algo', 'BATMAN_IV');
	uci.set('network', batmanDevice, 'bridge_loop_avoidance', '1');
	if (gwMode) {
		uci.set('network', batmanDevice, 'gw_mode', gwMode);
	}
	uci.set('network', batmanDevice, 'hop_penalty', '30');

	return uci.get('network', batmanDevice, 'name');
}

function setupBatmanInterfaceOnDevice(deviceName) {
	const batmanIfaceName = 'batmesh0';
	// See if there's already a batman interface on this device
	const batmanDevice= uci.sections('network', 'interface').find(s => s.proto === 'batadv' && s.batdev === deviceName);
	if (batmanDevice) {
		return batmanIfaceName;
	}

	const batmanIFace = uci.add('network', 'interface');
	uci.set('network', batmanIFace, 'name', batmanIfaceName);
	uci.set('network', batmanIFace, 'proto', 'batadv_hardif');
	uci.set('network', batmanIFace, 'master', deviceName);

	return uci.get('network', batmanIFace, 'name');
}

function setupNetworkWithDnsmasq(sectionId, ip, uplink = true) {
	const dnsmasq = getOrCreateDnsmasq(sectionId);
	const dhcp = getOrCreateDhcp(dnsmasq, sectionId);
	uci.set('network', sectionId, 'proto', 'static');
	uci.set('network', sectionId, 'ipaddr', ip);
	uci.set('network', sectionId, 'netmask', '255.255.255.0');

	if (!uplink) {
		uci.set('dhcp', dhcp, 'dhcp_option', ['3', '6']);
	} else {
		uci.unset('dhcp', dnsmasq, 'notinterface');
		uci.unset('dhcp', dhcp, 'dhcp_option');
	}
}

/* Get the first ipaddr/netmask for an interface from UCI.
 *
 * uci supports multiple ip addresses in a somewhat confusing (bad?) way:
 *   ipaddr = x.x.x.x and netmask = x.x.x.x
 *   ipaddr = [x.x.x.x/y, x.x.x.x/y] (and netmask is ignored)
 * For our purposes, we mostly want to not care about the second option as it
 * makes our interfaces more complex. However, we need to be able to load it successfully.
 * Hence this function, which pretends that the second format is the same as the first,
 * discarding any subsequent IP/masks.
 */
function getFirstIpaddrAndNetmask(iface) {
	let netmask = uci.get('network', iface, 'netmask');
	let ipaddr = uci.get('network', iface, 'ipaddr');

	if (Array.isArray(ipaddr)) {
		ipaddr = ipaddr[0];
	}

	if (ipaddr) {
		const ipaddrSplit = ipaddr.split('/');
		if (ipaddrSplit.length == 2) {
			ipaddr = ipaddrSplit[0];
			netmask = network.prefixToMask(ipaddrSplit[1]);
		}
	}

	return { ipaddr, netmask };
}

function getFirstIpaddr(iface) {
	const { ipaddr } = getFirstIpaddrAndNetmask(iface);
	return ipaddr;
}

function getFirstNetmask(iface) {
	const { netmask } = getFirstIpaddrAndNetmask(iface);
	return netmask;
}

/* Combine info from getBuiltinEthernetPorts (i.e. role) with
 * info from networkDevices (i.e. which will include usb hotplugs).
 */
function getEthernetPorts(builtinEthernetPorts, networkDevices) {
	const ports = {};

	for (const port of builtinEthernetPorts) {
		ports[port.device] = Object.assign({ builtin: true }, port);
	}

	for (const device of networkDevices) {
		if (!['ethernet', 'vlan'].includes(device.getType()) || device.dev.type === 803) {
			// Switch ports come up as vlan ports, so we leave vlan ports in for now.
			// 803 is the morse monitor interface (usu morse0), which luci picks
			// up as type ethernet (fallback).
			continue;
		}

		// If it's not in the builtin ports, consider it to have a role of 'wan'.
		ports[device.getName()] ??= { builtin: false, device: device.getName(), role: 'wan' };
		ports[device.getName()].deviceinfo = device;
	}

	return Object.values(ports);
}

/* Return a static IP associated with an ethernet port
 * (prefer builtin ports over other detected ones).
 */
function getEthernetStaticIp(ports) {
	const portsObj = {};
	for (const port of ports) {
		portsObj[port.device] = port;
	}

	const builtinIps = [];
	const externalIps = [];
	for (const network of uci.sections('network', 'interface')) {
		if (network.proto === 'static') {
			for (const deviceName of getNetworkDevices(network['.name'])) {
				if (portsObj[deviceName]) {
					(portsObj[deviceName].builtin ? builtinIps : externalIps).push(getFirstIpaddr(network['.name']));
				}
			}
		}
	}

	if (builtinIps.length > 0) {
		return builtinIps[0];
	} else if (externalIps.length > 0) {
		return externalIps[0];
	} else {
		return null;
	}
}

return baseclass.extend({
	getZoneForNetwork,
	getOrCreateZone,
	createDhcp,
	getOrCreateDnsmasq,
	getOrCreateDhcp,
	createOrRemoveBridgeAsNeeded,
	validateBridge,
	forceBridge,
	getNetworkDevices,
	setNetworkDevices,
	getNetworkWifiIfaces,
	getOrCreateForwarding,
	setupNetworkWithDnsmasq,
	getDefaultSSID,
	getDefaultWifiKey,
	getRandomMAC,
	getFakeMorseMAC,
	getFirstIpaddr,
	getFirstNetmask,
	getEthernetPorts,
	getEthernetStaticIp,
	getNetworkInterfaces,
	setupBatmanDeviceOnNetwork,
	setupBatmanInterfaceOnDevice,
});
