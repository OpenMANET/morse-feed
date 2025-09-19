/* Simplified user homepage for LuCI.
 *
 * Copyright 2024 Morse Micro
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * Developed referring to patterns in luci-mod-status and luci-mod-dashboard,
 * which are part of:
 *
 * LuCI - Lua Configuration Interface
 * Copyright 2008 Steven Barth <steven@midlink.org>
 * Copyright 2008 Jo-Philipp Wich <jow@openwrt.org>
 * Licensed under the Apache License, Version 2.0.
 *
 * Idea is similar to luci-mod-dashboard, but we instead try to focus more on
 * distinct interfaces, limit information a bit more, and prevent
 * over-large cards by only showing an arbitrary amount of data on request
 * (e.g. '5 devices' rather than a list).
 */

'use strict';

/* globals configDiagram dom firewall form morseuci morseui network poll prplmeshTopology rpc ui uci view */
'require dom';
'require firewall';
'require form';
'require network';
'require rpc';
'require uci';
'require ui';
'require view';
'require poll';
'require view.home.prplmesh-topology as prplmeshTopology';
'require custom-elements.morse-config-diagram as configDiagram';
'require tools.morse.uci as morseuci';
'require tools.morse.morseui as morseui';
'require view.morse.wpsbuttonelement';

const DPP_QRCODE_PATH = `/dpp_qrcode.svg?v=${L.env.sessionid?.slice(10)}`;

const callLuciDHCPLeases = rpc.declare({
	object: 'luci-rpc',
	method: 'getDHCPLeases',
	expect: { '': {} },
});

const callGetBuiltinEthernetPorts = rpc.declare({
	object: 'luci',
	method: 'getBuiltinEthernetPorts',
	expect: { result: [] },
});

const callSystemBoard = rpc.declare({
	object: 'system',
	method: 'board',
});

const callMorseModeQuery = rpc.declare({
	object: 'morse-mode',
	method: 'query',
});

const callSessionAccess = rpc.declare({
	object: 'session',
	method: 'access',
	params: ['scope', 'object', 'function'],
	expect: { access: false },
});

const callDPPPushButton = rpc.declare({
	object: 'dpp',
	method: 'push_button',
	params: ['mode'],
	expect: { '': {} },
});

const callDPPGetLockoutSecs = rpc.declare({
	object: 'dpp',
	method: 'get_lockout_secs',
	expect: { lockout_remaining_secs: 0 },
});

// Sadly, we add our own call to apply, because:
//  - the ui.changes.apply call (see ui.js) tries to do a bunch of vaguely annoying
//    things to the user interface
//  - uci.apply doesn't properly wait for the 'confirm' after applying changes
//  - the overridden .apply on localDevice swallows the res error code
//    and I'm scared to touch it
const callUciApply = rpc.declare({
	object: 'uci',
	method: 'apply',
	params: ['timeout', 'rollback'],
	reject: false, // So we can handle the 'nothing to do' case (returns 5).
});

async function applyUciChangesImmediately() {
	const res = await callUciApply(0, false);
	// 5 is no data - i.e. nothing to apply.
	if (![0, 5].includes(res)) {
		L.raise('RPCError', 'RPC call to uci/apply failed with ubus code %d: %s',
			res, rpc.getStatusText(res));
	}
}

function th(items) {
	return E('tr', { class: 'tr cbi-section-table-titles' },
		items.map(item => E('th', { class: `th cbi-section-table-cell` }, item)));
}

function makeClass(n) {
	const sanitised = n.getName().replace(/[^\w-]/g, '-');
	if (n.getProtocol) {
		// For simplicity, we allow passing both uci networks and devices
		// into highlights, but there's no clean way to determine the network
		// since we don't have easy access to the underlying class (Protocol). The presence
		// of getProtocol though tells us it's not a device but a network iface.
		return `iface--${sanitised}`;
	} else {
		return sanitised;
	}
}

// These are from LuCI's resources/network.js, but unfortunately they're buried
// in a switch statement there.
const WIFI_MODES = {
	ap: _('Access Point'),
	sta: _('Client'),
	mesh: _('Mesh Point'),
	adhoc: _('Ad-Hoc'),
	monitor: _('Monitor'),
};

const MORSE_MODES = {
	'ap-router': _('Router with HaLow Access Point'),
	'sta-extender': _('HaLow Extender'),
	'mesh-router': _('HaLow 11s Mesh Router'),
	'mesh-extender': _('HaLow 11s Mesh Extender'),
	'mesh-gate': _('HaLow 11s Mesh Gate'),
	'ap-easymesh': _('HaLow EasyMesh Controller'),
	'sta-easymesh': _('HaLow EasyMesh Agent'),
	'sta-matter': _('Matter'),

	// Remaining items align with normal modes.
	'ap': _('HaLow Access Point'),
	'sta': _('HaLow Client'),
	'adhoc': _('HaLow Ad-Hoc'),
	'mesh': _('HaLow 11s Mesh'),
	'monitor': _('HaLow Monitor'),
	'none': _('No HaLow enabled'),
};

// These are extracted from LuCI's view/network/wireless.js.
const ENCRYPTION_OPTIONS = {
	'psk2': 'WPA2-PSK',
	'psk-mixed': 'WPA-PSK/WPA2-PSK Mixed Mode',
	'psk': 'WPA-PSK',
	'sae': 'WPA3-SAE',
	'sae-mixed': 'WPA2-PSK/WPA3-SAE Mixed Mode',
	'wep-open': _('WEP Open System'),
	'wep-shared': _('WEP Shared Key'),
	'wpa3': 'WPA3-EAP',
	'wpa3-mixed': 'WPA2-EAP/WPA3-EAP Mixed Mode',
	'wpa2': 'WPA2-EAP',
	'wpa': 'WPA-EAP',
	'owe': 'OWE',
	'none': 'No encryption',
};

const ENCRYPTION_MODES_USING_KEYS = new Set([
	'psk',
	'psk2',
	'psk+psk2',
	'psk-mixed',
	'sae',
	'sae-mixed',
]);

const DEFAULT_ENCRYPTION_OPTIONS = ['psk2', 'psk', 'sae', 'wpa3', 'none'];
const DEFAULT_HALOW_ENCRYPTION_OPTIONS = ['sae', 'owe', 'wpa3', 'none'];

function isHaLow(wifiNetwork) {
	return wifiNetwork.ubus('dev', 'iwinfo', 'hwmodes')?.includes('ah');
}

// This is a shorter/more informative name than we get from hwmodes_text
// which prioritises the frequency for 'normal' wifi.
function getWifiName(wifiNetwork) {
	const hwmodes = wifiNetwork.ubus('dev', 'iwinfo', 'hwmodes');
	if (hwmodes?.includes('ah')) {
		return _('HaLow');
	}

	const frequency = wifiNetwork.ubus('dev', 'iwinfo', 'frequency');
	if (frequency) {
		if (frequency > 4000) {
			return '%.0f GHz'.format(frequency / 1000);
		} else {
			return '%.1f GHz'.format(frequency / 1000);
		}
	}

	return wifiNetwork.ubus('dev', 'iwinfo', 'hwmodes_text') ?? _('Wi-Fi');
}

function getL2Devices(netIface) {
	// Like netIface.getL2Device, but converts bridge into its associated sub-devices
	// and excludes WDS generated interfaces.

	const device = netIface.getL2Device();
	if (!device) {
		return [];
	} else if (device.isBridge()) {
		// Unclear how to nicely exclude WDS generated interfaces, so we use '.'
		// (i.e. exclude 'wlan0.sta1' etc.).
		const ports = device.getPorts();
		if (!ports) {
			return [];
		} else {
			return ports.filter(p => !(
				(p.getType() === 'wifi' && !p.getName())
				|| (p.getType() === 'wifi' && p.getName().includes('.'))
			));
		}
	} else if (device.getType() === 'wifi' && !device.getName()) {
		// This happens if the uci config has changed but hasn't been applied.
		// (e.g. if you remove a wifi-iface). This is tricky to resolve cleanly,
		// because the upstream luci code wants to interact with both the current
		// device state _and_ the updated uci (i.e. the approach is inherently
		// flawed).
		return [];
	} else {
		return [device];
	}
}

function getBestDevice(netIface) {
	// Determine best possible device for 'Uplink'
	// (in a bridge, hard to determine which device we actually want for DHCP client,
	// so preference wifi stations over ethernet over AP).
	const devices = getL2Devices(netIface);

	if (devices.length === 0) {
		return null;
	}

	// Find the device on bridge most likely to represent the 'upstream'.
	const scoreDevice = (wifiNetwork) => {
		if (!wifiNetwork) {
			return 2;
		} else if (wifiNetwork.isDisabled()) {
			return 0;
		} else if (wifiNetwork.getMode() === 'ap') {
			// It would be surprising if the device was configured with an
			// AP for the 'upstream'.
			return 1;
		} else {
			return 3;
		}
	};

	return devices.reduce((best, current) =>
		scoreDevice(current.getWifiNetwork()) > scoreDevice(best.getWifiNetwork()) ? current : best);
}

async function startDPP(mode) {
	const result = await callDPPPushButton(mode);
	if (!result || (result && result.error_code)) {
		let errorMessage = _('Unable to start DPP (internal error). Check system logs or reset device.');
		if (result && result.error_code == 'lockout') {
			errorMessage = _('DPP button has already been pressed. Wait at least %d seconds to avoid session overlaps.').format(result.lockout_remaining_secs);
		}
		ui.showModal(_('Unable to start DPP'), [
			E('p', {}, [E('em', { style: 'white-space:pre-wrap' }, errorMessage)]),
			E('div', { class: 'right' },
				E('button', { class: 'cbi-button', click: ui.hideModal }, [_('Dismiss')]),
			),
		]);
	}

	// Spin until we're not locked out (i.e. GetLockoutSecs returns 0),
	// even if the call failed (so we catch existing lockouts).
	// If we succeed, then lockout will finish.
	while (await callDPPGetLockoutSecs()) {
		await new Promise(resolveFn => window.setTimeout(resolveFn, 5000));
	}
}

function createSystemCard(boardinfo) {
	// Currently no nice way to get this.
	const morseVersion = boardinfo.release.description.split(' ').pop().replace('Morse-', '');

	return new Card('system', {
		heading: _('System'),
		link: { href: L.url('admin', 'system', 'system'), title: _('System Configuration') },
		contents: [
			E('dl', [
				E('dt', _('Model')),
				E('dd', boardinfo.model),
				E('dt', _('Hostname')),
				E('dd', uci.get_first('system', 'system', 'hostname')),
				E('dt', _('Linux Kernel')),
				E('dd', boardinfo.kernel),
				E('dt', _('OpenWrt')),
				E('dd', {}, boardinfo.release.version),
			]),
			E('div', { class: 'main-counter' }, [
				E('div', { class: 'medium-number' }, morseVersion),
				E('div', { class: 'big-text' }, _('Version')),
			]),
		],
	});
}

// Bunch up the logic to connect to wifi networks.
// In general, this front page is simply rendering the current state, which lets us
// get away with a simple 'just rerender everything on refresh' loop.
// However, to support establishing wifi connections (including credential setting),
// we have a persistent state here. Unfortunately, this means that we need to messily
// update parts of the DOM at arbitrary times. Probably should be using templates.
async function renderUplinkWifiConnectMethods(id, hasQRCode, wifiNetwork, isUp) {
	const map = new form.Map('wireless');
	const s = map.section(form.NamedSection, wifiNetwork.getName());
	let o = s.option(morseui.SSIDListScan, 'ssid', _('SSID'));
	o.staOnly = true;
	o.onchangeWithEncryption = function (ev, sectionId, value, encryption) {
		this.section.getUIElement(sectionId, 'key').setValue('');
		if (encryption) {
			const encryptionElement = this.section.getUIElement(sectionId, 'encryption');
			encryptionElement.setValue(encryption);
			encryptionElement.node.querySelector('select').dispatchEvent(new Event('change'));
		}
	};

	o = s.option(form.Value, 'key', _('Key/Password'));
	o.password = true;

	// Put only the most used (i.e. key based) options in encryption.
	o = s.option(form.ListValue, 'encryption', _('Encryption'));
	for (const k of isHaLow(wifiNetwork) ? DEFAULT_HALOW_ENCRYPTION_OPTIONS : DEFAULT_ENCRYPTION_OPTIONS) {
		if (ENCRYPTION_MODES_USING_KEYS.has(k)) {
			o.value(k, ENCRYPTION_OPTIONS[k]);
		}
	}

	const dppQRCodeSlider = new morseui.UISlider('0', ['0', '1'], {});
	const dppQRCodeSliderElement = dppQRCodeSlider.render();
	const isPrplmeshAgent = (uci.get('prplmesh', 'config', 'enable') === '1'
		&& uci.get('prplmesh', 'config', 'management_mode') === 'Multi-AP-Agent');

	async function updateAfterUciChange() {
		try {
			await updateUplinkWifiConnectMethods(hasQRCode, element);
			await uci.save();
			await applyUciChangesImmediately();
			await map.load();
		} catch (e) {
			console.error(e);

			// TODO
			alert('Unable to save changes.');
		}
	}

	const element = E('details', {
		id,
		'class': 'uplink-connect',
		'open': isUp ? null : '', // Show by default if we're not connected.
		'data-isup': isUp,
		'data-wifinetworkname': wifiNetwork.getName(),
	}, [
		E('summary', _('Connect to Access Point')),
		isPrplmeshAgent
			? E('p', _('Use the "Start WPS (client)" button on the EasyMesh Agent card to connect to an EasyMesh Controller.'))
			: E('dl', [
				E('dt', _('Credentials')),
				E('dd', {}, [
					await map.render(),
					E('button', {
						class: 'cbi-button cbi-button-action cbi-button-inline',
						style: 'margin-top: 0.3rem',
						click: ui.createHandlerFn(this, async () => {
							// disable qrcode DPP - we're doing normal creds.
							wifiNetwork.set('dpp', null);
							map.checkDepends();
							await map.parse();
							await updateAfterUciChange();
							// hack - sleep so that the user can't press the button again until
							// some attempt to connect has happened, otherwise this action is really fast
							// and you might think nothing has happened at all. Use pollinterval since there's
							// some chance that within this amount of time we'll have updated our connection status.
							// We do this since there's no trivial way to feed the wpa_supplicant status back
							// while we wait; note that if connection succeeds, Connected will change to 'Yes'
							// and the connection methods box will be hidden (see updateUplinkWifiConnectMethods).
							await new Promise(resolveFn => window.setTimeout(resolveFn, L.env.pollinterval * 1000 * 2));
						}),
					}, _('Save & Apply')),
				]),
				// Currently, we only support DPP on HaLow.
				hasQRCode && isHaLow(wifiNetwork) && E('dt', _('DPP QR Code')),
				hasQRCode && isHaLow(wifiNetwork) && E('dd', { class: 'dpp-qrcode' }, [
					E('div', _('Scan the QR Code in the app to connect this device to your Access Point.')),
					E('div', { style: 'padding: 0.2rem; height: 32px; width: 32px;' }, [
						dppQRCodeSliderElement,
						E('div', { class: 'spinning', hidden: '', style: 'height: 100%; width: 100%' }),
					]),
					E('img', {
						'style': 'cursor: help',
						'data-tooltip': _('Scan this QR Code in the app to connect this device to your Access Point.'),
						'src': DPP_QRCODE_PATH,
					}),
				]),
				isHaLow(wifiNetwork) && E('dt', _('DPP Push button')),
				isHaLow(wifiNetwork) && E('dd', [
					_('Start DPP push button on the Access Point, then '),
					E('button', {
						class: 'cbi-button cbi-button-action cbi-button-inline',
						click: ui.createHandlerFn(this, async () => {
							if (wifiNetwork.get('dpp') === '1') {
								// disable qrcode DPP - we're doing pushbutton.
								wifiNetwork.set('dpp', null);
								await updateAfterUciChange();
								// TODO hack - sleep so we have time for config to reload before triggering DPP.
								await new Promise(resolveFn => window.setTimeout(resolveFn, 3 * 1000));
							}
							await startDPP('sta');
							await updateUplinkWifiConnectMethods(hasQRCode, element);
						}),
					}, _('Start DPP push button')),
					_(' here.'),
				]),
			].filter(e => e)),
	]);

	dppQRCodeSlider.setValue(wifiNetwork.get('dpp'));
	dppQRCodeSliderElement.addEventListener('widget-change', async (event) => {
		const spinner = element.querySelector('.dpp-qrcode .spinning');
		spinner.removeAttribute('hidden');
		dppQRCodeSliderElement.setAttribute('hidden', '');
		const dppQRCodeSlider = dom.findClassInstance(event.target);
		wifiNetwork.set('dpp', dppQRCodeSlider.getValue() === '1' ? '1' : null);
		try {
			await updateUplinkWifiConnectMethods(hasQRCode, element);
			await uci.save();
			await applyUciChangesImmediately();
		} catch (e) {
			alert('Unable to save changes to device');
			console.error(e);
		}
		dppQRCodeSliderElement.removeAttribute('hidden', '');
		spinner.setAttribute('hidden', '');
	});

	return element;
}

// This is the 'messily update the existing JS to obey the current state'.
// TODO: I have seen wifiNetwork be in a bad state where it hasn't loaded
// data properly, and netIface is empty. Hence the guards. Bug in network.js?
async function updateUplinkWifiConnectMethods(hasQRCode, connectMethods, isUp) {
	const wifiNetwork = await network.getWifiNetwork(connectMethods.dataset.wifinetworkname);
	const netIface = wifiNetwork.getNetwork();
	if (netIface) {
		if (connectMethods.dataset.isup === 'false' && isUp) {
			// Close if we move from unconnected to connected as a cheap way to
			// show people that the state has changed.
			connectMethods.removeAttribute('open');
		} else if (connectMethods.dataset.isup === 'true' && !isUp) {
			// Show if we do the reverse.
			connectMethods.setAttribute('open', '');
		}

		connectMethods.dataset.isup = isUp;
	}

	if (isHaLow(wifiNetwork) && hasQRCode) {
		const dppQRCodeSlider = dom.findClassInstance(connectMethods.querySelector('.dpp-qrcode .cbi-checkbox'));
		const dppQRCodeImage = connectMethods.querySelector('.dpp-qrcode img');
		if (dppQRCodeSlider.getValue() === '1') {
			dppQRCodeImage.removeAttribute('hidden');
		} else {
			dppQRCodeImage.setAttribute('hidden', '');
		}
	}
}

async function createUplinkCard(netIface, hasQRCode) {
	const device = getBestDevice(netIface);
	let wifiNetwork = device.getWifiNetwork();

	let method, speed, ssid, meshId;
	if (wifiNetwork) {
		method = getWifiName(wifiNetwork);
		ssid = wifiNetwork.getSSID();
		meshId = wifiNetwork.getMeshID();
		speed = wifiNetwork.getBitRate();
	} else {
		method = 'Ethernet';
		speed = device.getSpeed();
	}

	const isUp = netIface.isUp() && device.isUp() && device.getCarrier();
	const ips = [netIface.getIPAddr(), netIface.getIP6Addr()].filter(e => e);
	const qrcodeDppMode = hasQRCode && wifiNetwork && isHaLow(wifiNetwork) && wifiNetwork.get('dpp') === '1';

	let connectMethods;
	if (wifiNetwork && wifiNetwork.getMode() === 'sta') {
		// This bit of trickery is to avoid the refresh on the add-device-info,
		// since we have three bits of state to persist:
		// - whether we've expanded the section
		// - whether we're in the middle of DPP (though this is just a timeout now)
		// - whether we've revealed the password
		const id = `client-connect-methods-${wifiNetwork.getDevice().getName()}`;
		connectMethods = document.getElementById(id) || await renderUplinkWifiConnectMethods(id, hasQRCode, wifiNetwork, isUp);
		updateUplinkWifiConnectMethods(hasQRCode, connectMethods, isUp);
	}

	return new Card(`uplink-${netIface.getName()}`, {
		heading: _('Uplink') + ` (${method})`,
		highlights: [device, netIface],
		contents: [
			E('dl', [
				ssid && E('dt', _('SSID')),
				ssid && E('dd', ssid),
				meshId && E('dt', _('SSID')),
				meshId && E('dd', meshId),
				E('dt', _('Device')),
				E('dd', device.getName()),
				ips.length && E('dt', _('IP')),
				ips.length && E('dd', ips.join(' / ')),
				speed > 0 && E('dt', _('Speed')),
				speed > 0 && E('dd', `${speed} Mbps`),
				qrcodeDppMode && E('dt', _('DPP')),
				qrcodeDppMode && E('dd', _('Looking for Access Point...')),
			].filter(e => e)),
			qrcodeDppMode
				? E('div', { class: 'main-image' }, [
					E('img', {
						'style': 'cursor: help',
						'data-tooltip': _('Scan this QR Code in the app to connect this device to your HaLow Access Point'),
						'src': DPP_QRCODE_PATH,
					}),
				])
				: E('div', { class: 'main-counter' }, [
					E('button', { class: 'big-number click-to-expand' }, isUp ? '✔' : '✘'),
					E('button', { class: 'big-text click-to-expand' }, isUp ? _('Connected') : _('Disconnected')),
				]),
		],
		maxContents: wifiNetwork && [
			E('dl', [
				ssid && E('dt', _('SSID')),
				ssid && E('dd', ssid),
				meshId && E('dt', _('SSID')),
				meshId && E('dd', meshId),
				E('dt', _('Device')),
				E('dd', device.getName()),
				ips.length && E('dt', _('IP')),
				ips.length && E('dd', ips.join(' / ')),
				speed > 0 && E('dt', _('Speed')),
				speed > 0 && E('dd', `${speed} Mbps`),
				E('dt', _('Connected')),
				E('dd', {
					style: `color: ${isUp ? 'green' : 'red'}`,
				}, isUp ? _('yes') : _('no')),
			].filter(e => e)),
			// Currently, we only support DPP on HaLow (custom script).
			connectMethods,
		].filter(e => e),
	});
}

function createModeCard(morseModeQuery, ethernetPorts) {
	const morseMode = MORSE_MODES[morseModeQuery['morse_mode']] || _('Unknown');
	const diagramMini = E('morse-config-diagram');
	diagramMini.updateFrom(uci, ethernetPorts);
	const diagramMax = E('morse-config-diagram');
	// Ideally, we'd clone the above to avoid having to recalculate, but there appears
	// to be some issue with that (maybe something to do with not cloning the shadow dom
	// properly?).
	diagramMax.updateFrom(uci, ethernetPorts);

	return new Card('mode', {
		heading: _('Mode'),
		link: { href: L.url('admin', 'selectwizard'), title: _('Change mode via wizard') },
		contents: [
			E('h4', morseMode),
			E('div', { class: 'click-to-expand' }, diagramMini),
		],
		maxContents: [
			E('h4', morseMode),
			E('div', {}, diagramMax),
		],
	});
}

function createNetworkInterfacesCard(networks, wifiDevices) {
	// For now we exclude dhcpv6 to reduce noise.
	networks = networks.filter(n =>
		getL2Devices(n).length > 0
		&& n.getL2Device().getName() != 'lo'
		&& ['dhcp', 'static'].includes(n.getProtocol()));

	function getZoneForNetwork(network) {
		const zoneSection = uci.sections('firewall', 'zone').find(z => L.toArray(z.network).includes(network));
		return zoneSection?.['name'];
	}

	// Hover on an interface highlights other cards.
	function addHover(elem) {
		elem.addEventListener('mouseenter', (e) => {
			for (const hElem of document.querySelectorAll(`.highlight-${e.target.dataset.highlight}`)) {
				hElem.classList.add('highlight');
			}
		});
		elem.addEventListener('mouseleave', (e) => {
			for (const hElem of document.querySelectorAll(`.highlight-${e.target.dataset.highlight}`)) {
				hElem.classList.remove('highlight');
			}
		});

		return elem;
	}

	function getNetworkTitle(n) {
		return `${n.getProtocol()}: ${n.getIPAddr()}`;
	}

	function getDeviceTitle(d) {
		const wifiNetwork = d.getWifiNetwork();
		if (wifiNetwork) {
			const displayName = wifiDevices[wifiNetwork.getWifiDeviceName()]
				.getI18n().replace(' Wireless Controller', '');
			return `${displayName}\nSSID: ${wifiNetwork.getSSID()}`;
		} else {
			return 'Ethernet';
		}
	}

	function renderNetworkIfaceBadge(n) {
		return addHover(E('div', {
			'class': 'zonebadge network-name',
			'data-highlight': makeClass(n),
			'data-tooltip': getNetworkTitle(n),
			'style': firewall.getZoneColorStyle(getZoneForNetwork(n.getName())),
		}, n.getName()));
	}

	function renderNetworkDevices(n) {
		return getL2Devices(n).map(d => addHover(E('div', {
			'class': 'ifacebox',
			'data-highlight': makeClass(d),
			'data-tooltip': getDeviceTitle(d),
		}, [
			E('div', { class: 'ifacebox-head' }, d.getName()),
			E('div', { class: 'ifacebox-body' }, [
				// From render_iface in luci-mod-network
				E('img', { src: L.resource('icons/%s%s.png').format(d.getType() || 'ethernet', d.getCarrier() ? '' : '_disabled') }),
			]),
		])));
	}

	const table = E('table', { class: 'table cbi-section-table' },
		th([_('Network'), _('Devices'), _('Configuration')]));

	cbi_update_table(table, networks.map(n => [
		renderNetworkIfaceBadge(n),

		E('div', {}, renderNetworkDevices(n)),

		E('dl', [
			E('dt', _('Protocol')),
			E('dd', n.getI18n()),
			E('dt', _('IPv4')),
			E('dd', n.getIPAddr() ?? _('None')),
			E('dt', _('IPv6')),
			E('dd', n.getIP6Addr() ?? _('None')),
		]),
	]));

	return new Card('networks', {
		heading: _('Network Interfaces'),
		link: { href: L.url('admin', 'network', 'network'), title: _('Network Interfaces') },
		contents: E('div', { class: 'network-interfaces' }, networks.flatMap(n => [
			E('div', {}, renderNetworkIfaceBadge(n)),
			E('div', '→'),
			E('div', {}, E('div', { class: 'devices-box' }, renderNetworkDevices(n))),
		])),
		maxContents: table,
	});
}

function createLocalNetworksCard(networks, dhcpLeases, hostHints) {
	const ipv4addrs = [];
	const ipv6addrs = [];
	const names = [];

	for (const netIface of networks) {
		names.push(netIface.getName());
		ipv4addrs.push(...netIface.getIPAddrs());
		ipv6addrs.push(...netIface.getIP6Addrs());
	}

	function expiry(timeInSecs) {
		if (!timeInSecs) {
			return '';
		} else if (timeInSecs === 0) {
			return _('Never');
		} else {
			return Math.round(timeInSecs / 60) + _(' min(s)');
		}
	}

	let table;
	if (dhcpLeases.length > 0) {
		table = E('table', { class: 'table cbi-section-table' }, th([
			_('MAC Address'), _('Hostname'), _('IPv4'),
			_('Expiry'), _('IPv6'), _('IPv6 Expiry'),
		]));

		cbi_update_table(table, dhcpLeases.map(lease => [
			lease.macaddr, hostHints.getHostnameByMACAddr(lease.macaddr), lease.ipaddr,
			expiry(lease.expires), lease.ip6addrs?.join(', '), expiry(lease.ip6expires),
		]));
	} else {
		table = E('em', _('No active leases'));
	}

	return new Card('localnetworks', {
		heading: _('Local Network'),
		highlights: networks.flatMap(netIface => [netIface, ...getL2Devices(netIface)]),
		contents: [
			E('dl', [
				E('dt', _('Name(s)')),
				E('dd', names.join(', ')),
				E('dt', _('IPv4')),
				E('dd', ipv4addrs.length > 0 ? ipv4addrs.join(', ') : _('None')),
				E('dt', _('IPv6')),
				E('dd', ipv6addrs.length > 0 ? ipv6addrs.join(', ') : _('None')),
			]),
			E('div', { class: 'main-counter' }, [
				E('button', { class: 'big-number click-to-expand' }, dhcpLeases.length),
				E('button', { class: 'big-text click-to-expand' }, _('DHCP Leases')),
			]),
		],
		maxContents: [
			E('dl', [
				E('dt', _('IPv4')),
				E('dd', ipv4addrs.length > 0 ? ipv4addrs.join(', ') : _('None')),
				E('dt', _('IPv6')),
				E('dd', ipv6addrs.length > 0 ? ipv6addrs.join(', ') : _('None')),
			]),
			table,
		],
	});
}

/* Card which focuses on connected devices if it's possible there is more
 * than one (e.g. ap/mesh/adhoc).
 */
function createAssoclistCard(wifiNetwork, hostHints) {
	const mode = wifiNetwork.getMode();
	const netIface = wifiNetwork.getNetwork();
	const bitrate = wifiNetwork.getBitRate();
	const wifiName = getWifiName(wifiNetwork);

	const associatedDevices = wifiNetwork.assoclist.filter(
		// 80211s mesh devices show up in this list when they are not fully
		// connected, for example if they have the wrong credentials. This is
		// only intended to filter out that case. For other modes the station
		// does not show in the list at all if it has the wrong credentials.
		d => d.authorized,
	).map(d => ({
		mac: d.mac,
		hostname: hostHints.getHostnameByMACAddr(d.mac),
		ip: hostHints.getIPAddrByMACAddr(d.mac),
		ip6: hostHints.getIP6AddrByMACAddr(d.mac),
		connected_time: Math.round(d.connected_time / 60),
		noise: d.noise,
		signal: d.signal,
	}));
	const hasHostname = associatedDevices.some(d => d.hostname);
	const hasIp = associatedDevices.some(d => d.ip);
	const hasIp6 = associatedDevices.some(d => d.ip6);
	const authentication = wifiNetwork.ubus('net', 'iwinfo', 'encryption')?.authentication || [];
	const wifiPassword = (authentication.includes('sae') || authentication.includes('psk')) && wifiNetwork.get('key');
	const hasDppd = L.hasSystemFeature('morsedppd');

	let connectMethods;
	if (wifiPassword) {
		// This bit of trickery is to avoid the refresh on the add-device-info,
		// since we have three bits of state to persist:
		// - whether we've expanded the section
		// - whether we're in the middle of DPP (though this is just a timeout now)
		// - whether we've revealed the password
		const id = `${mode}-connect-methods-${wifiNetwork.getDevice().getName()}`;
		connectMethods = document.getElementById(id) || E('details', { id, class: 'connect-methods' }, [
			E('summary', _('Connect a new device')),
			E('dl', [
				E('dt', _('Credentials')),
				E('dd', {}, E('dl', [
					E('dt', mode === 'mesh' ? _('Mesh ID') : _('SSID')),
					E('dd', mode === 'mesh' ? wifiNetwork.getMeshID() : wifiNetwork.getSSID()),
					E('dt', _('Key/Password')),
					E('dd', { class: 'control-group' }, [
						E('input', {
							type: 'password',
							value: wifiPassword,
							class: 'cbi-input-password',
							readonly: true,
						}),
						E('button', {
							class: 'cbi-button cbi-button-neutral',
							tabindex: '-1"',
							click: (e) => {
								const passwordInput = e.target.previousElementSibling;
								if (passwordInput.type === 'password') {
									passwordInput.type = 'text';
								} else {
									passwordInput.type = 'password';
								}
							},
						}, '*'),
					]),
				].filter(e => e))),
				// Currently, we only support DPP on HaLow.
				// We disable this if there is no QRCode on this device, as if this is not
				// there we likely aren't running dppd (currently true on HaLowLink 1).
				mode === 'ap' && hasDppd && isHaLow(wifiNetwork) && E('dt', _('DPP QR Code')),
				mode === 'ap' && hasDppd && isHaLow(wifiNetwork) && E('dd', _('Scan the Client QR Code in the app.')),
				mode === 'ap' && isHaLow(wifiNetwork) && E('dt', _('DPP Push button')),
				mode === 'ap' && isHaLow(wifiNetwork) && E('dd', [
					E('button', {
						class: 'cbi-button cbi-button-action cbi-button-inline',
						click: ui.createHandlerFn(this, () => startDPP('ap')),
					}, _('Start DPP push button')),
					_(' here, and then on the Client.'),
				]),
			].filter(e => e)),
		]);
	}

	let table;
	if (associatedDevices.length > 0) {
		table = E('table', { class: 'table cbi-section-table' }, th([
			_('MAC Address'), hasHostname && _('Hostname'), hasIp && _('IPv4'), hasIp6 && _('IPv6'),
			_('Time connected'), _('Noise'), _('Signal'),
		].filter(t => t)));

		cbi_update_table(table, associatedDevices.map(d => [
			d.mac, d.hostname ?? (hasHostname && ' '), d.ip ?? (hasIp && ' '), d.ip6 ?? (hasIp6 && ' '),
			d.connected_time + _(' min(s)'), d.noise + _(' dBm'), d.signal + _(' dBm'),
		].filter(t => t)));
	} else {
		table = E('em', _('No active devices'));
	}

	return new Card(`wifi-assoclist-${wifiNetwork.getDevice().getName()}`, {
		heading: WIFI_MODES[mode] + ` (${wifiName})`,
		link: { href: L.url('admin', 'network', 'wireless'), title: _('Wireless Configuration') },
		highlights: [wifiNetwork.getDevice(), netIface],
		contents: [
			E('dl', [
				E('dt', mode === 'mesh' ? _('Mesh ID') : _('SSID')),
				E('dd', mode === 'mesh' ? wifiNetwork.getMeshID() : wifiNetwork.getSSID()),
				E('dt', _('Device')),
				E('dd', wifiNetwork.getDevice().getName()),
				bitrate && E('dt', _('Speed (avg)')),
				bitrate && E('dd', `${wifiNetwork.getBitRate()} Mbps`),
			].filter(e => e)),
			E('div', { class: 'main-counter' }, [
				E('button', { class: 'big-number click-to-expand' }, associatedDevices.length),
				E('button', { class: 'big-text click-to-expand' }, _('Connected Devices')),
			]),
		],
		maxContents: [
			E('dl', [
				E('dt', mode === 'mesh' ? _('Mesh ID') : _('SSID')),
				E('dd', mode === 'mesh' ? wifiNetwork.getMeshID() : wifiNetwork.getSSID()),
				E('dt', _('Channel')),
				E('dd', wifiNetwork.getChannel()),
				E('dt', _('Frequency')),
				E('dd', wifiNetwork.getFrequency() + wifiNetwork.getFrequencyUnit()),
				E('dt', _('Device')),
				E('dd', wifiNetwork.getDevice().getName()),
				E('dt', _('IPv4')),
				E('dd', netIface.getIPAddr() ?? _('None')),
				E('dt', _('IPv6')),
				E('dd', netIface.getIP6Addr() ?? _('None')),
				E('dt', _('Encryption')),
				E('dd', wifiNetwork.getActiveEncryption()),
			].filter(e => e)),
			E('h2', { style: 'margin: 0' }, _('Associated devices')),
			connectMethods,
			table,
		].filter(e => e),
	});
}

function renderPrplmeshTopology(agentOperational, prplmeshData) {
	const graph = prplmeshData.buildGraph();

	// Re-rendering is painful, as it will mean that any existing zoom is lost.
	// Therefore we only rerender if something we care about has changed.
	const newState = Array.from(graph.getStateInfo()).join(' ') + ` agentOperational:${agentOperational}`;

	// This is a bit tricky. We search the DOM for a previous instance of our topology diagram,
	// then yank it out and re-use it if the state hasn't actually changed. This is how, at the moment,
	// we get away with having a stupidly simple top-level that blows all the cards away each
	// time while still keeping this one separate (since the topology render is one of the heaviest
	// actions, and if it's live we want to keep the current zoom status/layout).
	const existingTopology = document.getElementById('prplmesh-topology');
	if (existingTopology && newState === existingTopology.dataset.state) {
		return existingTopology;
	}

	const topology = E('div', { 'id': 'prplmesh-topology', 'data-state': newState }, [
		E('div', { class: 'graphbuttons pull-right' }, [
			E('button', { class: 'zoomin cbi-button cbi-button-action' }, _('Zoom in')),
			E('button', { class: 'zoomout cbi-button cbi-button-action' }, _('Zoom out')),
			E('button', { class: 'reset cbi-button cbi-button-action' }, _('Reset')),
		]),
		E('div', { class: 'graphcontainer', style: 'height: 600px;' }),
	]);

	// We only want to render the graph when it becomes visible
	// (as rendering when it's not visible causes it to render in the wrong place).
	// This also saves unnecessary graph calculations on initial load
	// (in particular, we run 1000 PRERENDER_ITERATIONS to have an initially mostly sane layout).
	new IntersectionObserver((entries, observer) => {
		entries.forEach((entry) => {
			if (entry.intersectionRatio > 0) {
				const renderer = graph.renderTo(topology.querySelector('.graphcontainer'));
				topology.querySelector('.graphbuttons .zoomin').addEventListener('click', () => renderer.zoomIn());
				topology.querySelector('.graphbuttons .zoomout').addEventListener('click', () => renderer.zoomOut());
				topology.querySelector('.graphbuttons .reset').addEventListener('click', () => renderer.reset());
				observer.disconnect();
			}
		});
	}, { root: document.documentElement }).observe(topology);

	return topology;
}

async function createPrplmeshControllerCard() {
	const managementMode = uci.get('prplmesh', 'config', 'management_mode');
	const operatingMode = uci.get('prplmesh', 'config', 'operating_mode');

	// Because this is a dependent operation anyway (we need to know the uci config
	// to understand whether it's necessary), and eventually we hope to move this
	// logic into a separate module (so not everyone is carrying vivagraph/prplmesh)
	// we do the load here.
	await callSessionAccess('access-group', 'luci-mod-home-index-prplmesh', 'read');
	let prplmeshData;
	try {
		prplmeshData = await prplmeshTopology.load();
	} catch (e) {
		console.error(e);
	}

	// Ideally we would call fs.exec('/opt/prplmesh/bin/beerocks_cli', ['-c', 'bml_get_agent_status']),
	// but this is horrifically slow.
	const agentOperational = uci.get('prplmesh', 'config', 'operational') === '1';

	const colorStyle = `color: ${agentOperational ? 'green' : 'red'}`;

	const agentCount = prplmeshData?.countAgents() || 0;

	return new Card('prplmesh-controller', {
		heading: 'EasyMesh Controller',
		contents: [
			E('div', { style: 'display: flex; justify-content: space-between; align-items: center;' }, [
				E('dl', [
					E('dt', _('Agent status')),
					E('dd', { style: colorStyle }, agentOperational ? _('active') : _('inactive')),
				]),
				// This bit of trickiness is because the WPS button has state (and its own internal polling mechanism),
				// so we keep the old wps button from a previous render if it exists.
				document.querySelector('cli-wps-button[service=hostapd]') || E('cli-wps-button', { service: 'hostapd', state: 'available' }),
			]),
			E('div', { class: 'main-counter' }, [
				E('button', { class: 'big-number click-to-expand' }, agentCount),
				E('button', { class: 'big-text click-to-expand' }, _('Connected Agents')),
			]),
		],
		maxContents: agentCount > 0 && [
			E('dl', [
				E('dt', _('Management mode')),
				E('dd', managementMode),
				E('dt', _('Operating mode')),
				E('dd', operatingMode),
				E('dt', _('Agent status')),
				E('dd', { style: colorStyle }, agentOperational ? _('active') : _('inactive')),
			]),
			renderPrplmeshTopology(agentOperational, prplmeshData),
		],
	});
}

function createPrplmeshAgentCard() {
	// On the agent (i.e. not Controller/Agent), there's no easy way to get the
	// operational state. This odd UCI config is actually set by the prplmesh
	// init script currently for other reasons.
	const operational = uci.get('prplmesh', 'config', 'operational') === '1';

	return new Card('prplmesh-agent', {
		heading: 'EasyMesh Agent',
		contents: [
			E('div', { style: 'display: flex; justify-content: space-between;' }, [
				// This bit of trickiness is because the WPS button has state (and its own internal polling mechanism),
				// so we keep the old wps button from a previous render if it exists. This is particularly
				// important for wps_supplicant because wpa_cli_s1g has no way to query the current
				// PBC state so it just has a timer.
				document.querySelector('cli-wps-button[service=wpa_supplicant]') || E('cli-wps-button', { service: 'wpa_supplicant', state: 'available' }),
				document.querySelector('cli-wps-button[service=hostapd]') || E('cli-wps-button', { service: 'hostapd', state: 'available' }),
			]),
			E('div', { class: 'main-counter' }, [
				E('div', { class: 'big-number' }, operational ? '✔' : '✘'),
				E('div', { class: 'big-text' }, operational ? _('Active') : _('Inactive')),
			]),
		],
	});
}

class Card {
	constructor(id, { heading, contents, maxContents, highlights, link }) {
		this.id = id;
		this.heading = heading;
		this.contents = contents;
		this.maxContents = maxContents;
		this.highlights = highlights;
		this.link = link;
	}

	expand() {
		const modalOverlay = document.getElementById('homepage-modal-overlay');
		const modal = modalOverlay.querySelector('div.modal');
		modal.style.top = `${modalOverlay.parentElement.parentElement.scrollTop}px`;
		modal.replaceChildren(this.renderMaxCard());
		modalOverlay.classList.add('active');
	}

	static collapse() {
		const modalOverlay = document.getElementById('homepage-modal-overlay');
		const modal = modalOverlay.querySelector('div.modal');
		modalOverlay.classList.remove('active');
		modal.replaceChildren();
	}

	renderCard() {
		const smallContents = E('div', { class: 'small-contents' }, this.contents);
		if (this.maxContents) {
			for (const e of smallContents.querySelectorAll('.click-to-expand')) {
				e.onclick = () => this.expand();
				e.classList.add('can-expand');
			}
		}

		return E('section', {
			id: this.id,
			class: 'card ' + (this.highlights ?? []).map(h => `highlight-${makeClass(h)}`).join(' '),
		}, [
			E('div', { class: 'header' }, [
				E('h2', this.heading),
				this.link && E('a', {
					href: this.link.href,
					title: this.link.title,
					class: 'bs-icon bs-icon-settings-cog advanced-config',
				}),
				this.maxContents && E('div', { class: 'expand bs-icon bs-icon-arrows-angle-expand', title: _('Expand'), click: () => this.expand() }),
			].filter(e => e)),
			smallContents,
		]);
	}

	renderMaxCard() {
		return E('section', {
			id: `${this.id}-max`,
			class: 'card ' + (this.highlights ?? []).map(h => `highlight-${makeClass(h)}`).join(' '),
		}, [
			E('div', { class: 'header' }, [
				E('h1', this.heading),
				this.link && E('a', {
					href: this.link.href,
					title: this.link.title,
					class: 'bs-icon bs-icon-settings-cog advanced-config',
				}),
				E('div', { class: 'collapse bs-icon bs-icon-x-lg', title: _('Restore'), click: () => Card.collapse() }),
			].filter(e => e)),
			E('div', { class: 'max-contents' }, this.maxContents),
		]);
	}
}

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	load() {
		return Promise.all([this.onceLoad(), this.repeatLoad()]);
	},

	async onceLoad() {
		const [hasQRCode, ..._] = await Promise.all([
			fetch(DPP_QRCODE_PATH, { method: 'HEAD' }).then(r => r.ok).catch(_e => false),
			configDiagram.loadTemplate(),
		]);

		return { hasQRCode };
	},

	async repeatLoad() {
		const [boardinfo, builtinEthernetPorts, morseMode, dhcpLeases] = await Promise.all([
			callSystemBoard(),
			callGetBuiltinEthernetPorts(),
			callMorseModeQuery(),
			callLuciDHCPLeases().then((result) => {
				// Compress IPv6 and IPv4 so we can try to show in one table.
				// Possibly ill-advised; some info loss.
				const leases = [];
				const leasesByHostname = {};
				for (const lease of result.dhcp_leases) {
					if (lease.hostname) {
						leasesByHostname[lease.hostname] = lease;
					} else {
						leases.push(lease);
					}
				}

				for (const lease of result.dhcp6_leases) {
					if (lease.hostname) {
						leasesByHostname[lease.hostname] ??= { hostname: lease.hostname };

						Object.assign(leasesByHostname[lease.hostname], {
							ip6expires: lease.expires,
							ip6addrs: lease.ip6addrs,
						});
					} else {
						lease['ip6expires'] = lease.expires;
						delete lease.expires;
						leases.push(lease);
					}
				}

				leases.push(...Object.values(leasesByHostname));
				return leases;
			}),
			uci.load(['network', 'firewall', 'dhcp', 'luci', 'system']),
			uci.load('wireless').catch(() => null),
			uci.load('prplmesh').catch(() => null),
			uci.load('mesh11sd').catch(() => null),
			uci.load('matter').catch(() => null),
			network.flushCache(true),
		]);

		return { boardinfo, builtinEthernetPorts, morseMode, dhcpLeases };
	},

	async render([onceLoadData, repeatLoadData]) {
		// This keeps our normal loading spinner until the first poll has resolved.
		// The poller has the annoying behaviour of doing the poll immediately.
		// I can't see a straightforward way to workaround this, so we just have
		// some janky logic around the initial data load.
		// Note that the LuCI status page just does the data load twice.

		poll.add(async () => {
			if (!repeatLoadData) {
				uci.unload(['wireless', 'network', 'firewall', 'dhcp', 'luci', 'system', 'prplmesh', 'mesh11sd']);
				repeatLoadData = await this.repeatLoad();
			}

			// Save activeElement so we can refocus after rerender.
			const view = document.getElementById('view');
			view.classList.add('no-transition');
			const activeElement = document.activeElement;

			const cards = await this.createCards({ ...onceLoadData, ...repeatLoadData });
			// i.e. force us to regen next time through the poll.
			repeatLoadData = null;

			// If we have an expanded card, let us continue having an expanded card.
			const modalOverlay = document.getElementById('homepage-modal-overlay');
			if (modalOverlay?.classList.contains('active')) {
				const id = modalOverlay.querySelector('section').id.replace(/-max$/, '');
				const maxCard = cards.find(c => c.id === id);
				if (maxCard) {
					modalOverlay.querySelector('.modal').replaceChildren(maxCard.renderMaxCard());
				}
			}

			view.replaceChildren(E('div', { class: 'cards' }, cards.map(c => c.renderCard())));

			if (activeElement && document.contains(activeElement)) {
				activeElement.focus();
			}
			setTimeout(() => view.classList.remove('no-transition'), 0);
		});

		document.getElementById('maincontent').append(
			E('div', {
				id: 'homepage-modal-overlay',
				tabindex: -1,
				click: () => Card.collapse(),
				// keydown: this.cancelModal,
			}, [
				this.modal = E('div', {
					'class': 'modal',
					'role': 'dialog',
					'click': e => e.stopPropagation(),
					'aria-modal': true,
				}),
			]),
		);

		return E('div');
	},

	async createCards({ hasQRCode, boardinfo, builtinEthernetPorts, morseMode, dhcpLeases }) {
		// Turn list into obj with getName() as keys.
		function makeObj(l) {
			return l.reduce((o, d) => (o[d.getName()] = d, o), {});
		}

		// NB All of these awaits are not going to cause actual network requests,
		// because (confusingly) network.flushCache(true) not only flushes the cache
		// but makes all these requests again.
		const networkDevices = await network.getDevices();
		const hostHints = await network.getHostHints();
		const networks = await network.getNetworks();
		const wifiDevices = makeObj(await network.getWifiDevices());
		const wanNetworks = makeObj(await network.getWANNetworks());
		const wan6Networks = makeObj(await network.getWAN6Networks());
		const wifiNetworks = await network.getWifiNetworks().then(
			networks => Promise.all(networks.map(async (network) => {
				// Patch assoclist into wifi networks.
				// Ugly, but this is what status page and dashboard do...
				const assoclist = await network.getAssocList();
				network.assoclist = assoclist.toSorted((a, b) => a.mac > b.mac);
				return network;
			})));

		const cards = [];
		const nonHaLowCards = [];

		// List HaLow ifaces first
		for (const wifiNetwork of wifiNetworks) {
			if (!wifiNetwork.isDisabled() && wifiNetwork.isUp() && wifiNetwork.getNetwork()) {
				const mode = wifiNetwork.getMode();
				if (['ap', 'mesh', 'adhoc'].includes(mode)) {
					const card = createAssoclistCard(wifiNetwork, hostHints);
					if (isHaLow(wifiNetwork)) {
						cards.push(card);
					} else {
						nonHaLowCards.push(card);
					}
				}
			}
		}

		if (uci.get('prplmesh', 'config', 'enable') === '1') {
			cards.push(
				uci.get('prplmesh', 'config', 'management_mode') === 'Multi-AP-Controller-and-Agent'
					? await createPrplmeshControllerCard()
					: createPrplmeshAgentCard());
		}

		const localNetworks = [];
		let uplink;
		for (const netIface of networks) {
			const devices = getL2Devices(netIface);
			if (devices.length === 0) {
				continue;
			}

			const name = netIface.getName();
			if (wanNetworks[name] || wan6Networks[name] || netIface.getProtocol() === 'dhcp') {
				uplink = netIface;
			} else if (netIface.getProtocol() === 'static' && netIface.getDevice()?.getName() !== 'lo') {
				localNetworks.push(netIface);
			}
		}

		if (localNetworks.length > 0) {
			cards.push(createLocalNetworksCard(localNetworks, dhcpLeases, hostHints));
		}

		if (uplink) {
			cards.push(await createUplinkCard(uplink, hasQRCode));
		}

		// List non-HaLow APs later
		cards.push(...nonHaLowCards);

		cards.push(createModeCard(morseMode, morseuci.getEthernetPorts(builtinEthernetPorts, networkDevices)));
		cards.push(createNetworkInterfacesCard(networks, wifiDevices));
		cards.push(createSystemCard(boardinfo));

		return cards;
	},
});
