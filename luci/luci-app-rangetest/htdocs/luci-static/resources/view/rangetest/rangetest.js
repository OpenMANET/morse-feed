/**
 * A user-centric range testing application with exportable test output.
 */

'use strict';

/* globals view ui form rpc fs remoteDevice progressBar */
'require view';
'require ui';
'require form';
'require rpc';
'require fs';
'require tools.morse.rangetest.remote as remoteDevice';
'require tools.morse.rangetest.progressbar as progressBar';

const TEST_RESULT_DIRECTORY = '/tmp/rangetest';

document.querySelector('head').appendChild(E('link', {
	rel: 'stylesheet',
	type: 'text/css',
	href: L.resourceCacheBusted('view/rangetest/css/rangetest.css'),
}));

const umdnsUpdate = rpc.declare({
	object: 'umdns',
	method: 'update',
	params: [],
});

const umdnsBrowse = rpc.declare({
	object: 'umdns',
	method: 'browse',
	params: ['array'],
	expect: { '_http._tcp': {} },
});

const backgroundIperf3Client = rpc.declare({
	object: 'rangetest',
	method: 'background_iperf3_client',
	params: ['target', 'udp', 'reverse', 'time'],
});

const getBackground = rpc.declare({
	object: 'rangetest',
	method: 'get_background',
	params: ['id'],
});

const iwStationDump = rpc.declare({
	object: 'rangetest',
	method: 'iw_station_dump',
});

const morseCliStatsReset = rpc.declare({
	object: 'rangetest',
	method: 'morse_cli_stats_reset',
});

const morseCliStats = rpc.declare({
	object: 'rangetest',
	method: 'morse_cli_stats',
});

const morseCliChannel = rpc.declare({
	object: 'rangetest',
	method: 'morse_cli_channel',
});

const ipLink = rpc.declare({
	object: 'rangetest',
	method: 'ip_link',
});

const iwinfoInfo = rpc.declare({
	object: 'iwinfo',
	method: 'info',
	params: ['device'],
});

let knownRemoteDevices = {};

/**
 * Update the available remote devices stored in the global variable `knownRemoteDevices`.
 */
const updateKnownRemoteDevices = async () => {
	Object.keys(knownRemoteDevices).forEach(ipv4Address => knownRemoteDevices[ipv4Address]['available'] = false);

	// Fully restarting the service clears the cache of old advertisements. TODO: APP-3717.
	// Also, if run too early the umdns service is not yet ready.
	await new Promise(resolveFn => window.setTimeout(resolveFn, 500));
	fs.exec_direct('/etc/init.d/umdns', ['restart']);
	await umdnsUpdate();
	// Similar issue to above, docs indicate we should "wait a couple of seconds"
	// after running umdns update. umdns update doesn't seem to wait for us,
	// instead it returns after sending mdns queries, but before receiving the responses.
	// Similar cache updating issue to above. TODO: APP-3717.
	await new Promise(resolveFn => window.setTimeout(resolveFn, 1500));
	let report = await umdnsBrowse(true);

	if (Object.keys(report).length === 0) {
		ui.addNotification(_('Discovery error'), E('pre', {}, _('No compatible remote devices found!')), 'error');
		return;
	}

	for (const [hostname, deviceInfo] of Object.entries(report)) {
		for (const ipv4Address of deviceInfo.ipv4) {
			// Ignore the HaLowLink 1 management address as it always fails.
			if (ipv4Address === '10.22.121.111') {
				continue;
			}

			knownRemoteDevices[ipv4Address] = { hostname, ipv4Address, deviceInfo };
			knownRemoteDevices[ipv4Address]['available'] = true;
		}
	}
};

const iperf3ResultsTemplate = {
	iperf3: {
		udp: { receive: {}, send: {} },
		tcp: { receive: {}, send: {} },
	},
};

const testResultsTemplate = {
	id: 0,
	timestamp: '',
	local: {
		morseCliChannel: {},
		morseCliStats: {},
		iwStationDump: {},
		ipLink: {},
		iwinfoInfo: {},
		connectedInterface: '',
		...iperf3ResultsTemplate,
	},
	remote: {
		morseCliStats: {},
		iwStationDump: {},
		ipLink: {},
		connectedInterface: '',
		...iperf3ResultsTemplate,
	},
};

/**
 * Validate GPS or manually entered coordinate input.
 */
function validateDecimalDegrees(sectionId, value) {
	if (!value) {
		return true;
	}

	const coordinates = value.split(',');

	if (coordinates.length !== 2) {
		return _('Expecting: \'latitude, longitude\' format.');
	}
	const latitude = parseFloat(coordinates[0].trim());
	const longitude = parseFloat(coordinates[1].trim());

	if (isNaN(latitude) || isNaN(longitude)) {
		return _('Expecting: Coordinates must be numeric values.');
	}

	if (latitude < -90 || latitude > 90) {
		return _('Expecting: Latitude must be between -90 and 90.');
	}

	if (longitude < -180 || longitude > 180) {
		return _('Expecting: Longitude must be between -180 and 180.');
	}

	return true;
}

/* Uses the Haversine formula from https://www.movable-type.co.uk/scripts/latlong.html
 */
function getDistanceBetweenDecimalDegreesCoordinates(lat1, lon1, lat2, lon2) {
	const R = 6371e3; // metres
	const φ1 = lat1 * Math.PI / 180; // φ, λ in radians
	const φ2 = lat2 * Math.PI / 180;
	const Δφ = (lat2 - lat1) * Math.PI / 180;
	const Δλ = (lon2 - lon1) * Math.PI / 180;

	const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2)
		+ Math.cos(φ1) * Math.cos(φ2)
		* Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	const d = R * c; // in metres

	return d;
}

async function setupStatistics(testResults, remoteRangetestDevice) {
	await Promise.all([
		morseCliStatsReset(),
		remoteRangetestDevice.morseCliStatsReset(),
	]);
}

/**
 * Identify the wireless network interfaces being used in the test by correlating MAC addresses between
 * the output of an `ip -j link show <dev>` command on one device and a `iw <dev> station dump` on another.
 *
 * This function is useful for inferring which interface (might be) being used to communicate
 * with the remote DUT so that the correct statistics for that direct connection
 * can be identified i.e. RSSI.
 *
 * This function will fail in cases where the connection is indirect.
 */
function identifyConnectedInterfaces(ipLinkOutput, stationDumpOutput) {
	for (const ipLinkInterface in ipLinkOutput) {
		const macAddress = ipLinkOutput[ipLinkInterface]?.address;
		for (const stationDumpInterface in stationDumpOutput) {
			if (macAddress && stationDumpOutput[stationDumpInterface].includes(macAddress)) {
				return [ipLinkInterface, stationDumpInterface];
			}
		}
	}
	return null;
}

async function collectStatistics(testResults, remoteRangetestDevice) {
	[
		testResults.local.morseCliChannel,
		testResults.local.morseCliStats,
		testResults.remote.morseCliStats,
		testResults.local.iwStationDump,
		testResults.remote.iwStationDump,
		testResults.local.ipLink,
		testResults.remote.ipLink,
	] = await Promise.all([
		morseCliChannel(),
		morseCliStats(),
		remoteRangetestDevice.morseCliStats(),
		iwStationDump(),
		remoteRangetestDevice.iwStationDump(),
		ipLink(),
		remoteRangetestDevice.ipLink(),
	]);

	let localInterface, remoteInterface;
	let connectedInterfaces = identifyConnectedInterfaces(testResults.local.ipLink, testResults.remote.iwStationDump);
	if (connectedInterfaces) {
		[localInterface, remoteInterface] = connectedInterfaces;
		testResults.remote.connectedInterface = remoteInterface;
		testResults.local.connectedInterface = localInterface;
		testResults.local.iwinfoInfo = await iwinfoInfo(localInterface);
		return;
	}

	connectedInterfaces = identifyConnectedInterfaces(testResults.remote.ipLink, testResults.local.iwStationDump);
	if (connectedInterfaces) {
		[remoteInterface, localInterface] = connectedInterfaces;
		testResults.remote.connectedInterface = remoteInterface;
		testResults.local.connectedInterface = localInterface;
		testResults.local.iwinfoInfo = await iwinfoInfo(localInterface);
		return;
	}
}

/* Manages the core rangetest functionality here.
 *
 * This functionality should eventually be transferred to the backend.
 */
async function runRangetest(cancelPromise, configuration, testProgressBar, alertMessageContainer) {
	const {
		advanced: {
			protocol: protocols,
			direction: directions,
		},
		basic: {
			remoteDevicePassword: remotePassword,
			remoteDeviceIpAddress: remoteIp,
		},
	} = configuration;
	let remoteRangetestDevice = remoteDevice.load(remoteIp, remotePassword);

	// This is the Mozilla foundation's recommended method to make JSON deep copies.
	let testResults = JSON.parse(JSON.stringify(testResultsTemplate));
	testResults.id = Math.random().toString(16).slice(8);
	testResults.configuration = configuration;
	testResults.timestamp = new Date().toISOString();

	const iperf3TestTime = 10;
	const iperf3PollInterval = 2;

	const nSubtests = protocols.length * directions.length;
	const maxSubtestIncrements = iperf3TestTime / iperf3PollInterval;
	const percentPerIncrement = 100 / (maxSubtestIncrements * nSubtests);
	testProgressBar.show();
	testProgressBar.reset('Beginning...');

	await setupStatistics(testResults, remoteRangetestDevice);

	for (const protocol of protocols) {
		for (const direction of directions) {
			testProgressBar.text = `${protocol.toUpperCase()} ${direction}`;

			const iperf3RemoteResponse = await remoteRangetestDevice.backgroundIperf3Server();
			const iperf3LocalResponse = await backgroundIperf3Client(remoteIp, (protocol === 'udp'), (direction === 'receive'), iperf3TestTime);
			const iperf3LocalResults = await waitForIperf3Results(iperf3LocalResponse.id, iperf3TestTime, iperf3PollInterval, maxSubtestIncrements, percentPerIncrement, testProgressBar, cancelPromise, alertMessageContainer);
			const iperf3RemoteResults = await remoteRangetestDevice.getBackground(iperf3RemoteResponse.id);

			testResults['local']['iperf3'][protocol][direction]['end'] = iperf3LocalResults?.end;
			testResults['remote']['iperf3'][protocol][direction]['end'] = iperf3RemoteResults?.end;
		}
	}

	await collectStatistics(testResults, remoteRangetestDevice);

	testProgressBar.complete('Test Complete');
	saveLocalTest(testResults.id, testResults);
	return testResults;
}

async function getLocalTests() {
	try {
		const filenames = await fs.list(TEST_RESULT_DIRECTORY);
		const sortedFilenames = filenames.sort((a, b) => new Date(a.ctime) - new Date(b.ctime));
		const testResults = [];
		for (const file of sortedFilenames) {
			const path = `${TEST_RESULT_DIRECTORY}/${file.name}`;
			try {
				const content = await fs.read_direct(path, 'json');
				testResults.push(content);
			} catch (readError) {
				console.warn(`Error reading file: ${path}`, readError);
			}
		}
		return testResults;
	} catch (error) {
		return [];
	}
}

async function deleteLocalTest(testId) {
	const path = `${TEST_RESULT_DIRECTORY}/${testId}`;
	try {
		await fs.remove(path);
	} catch (error) {
		console.warn(`Error deleting file: ${path}`, error);
	}
}

function saveLocalTest(testId, data) {
	const path = `${TEST_RESULT_DIRECTORY}/${testId}`;
	try {
		fs.exec_direct('mkdir', ['-p', TEST_RESULT_DIRECTORY]);
		fs.write(path, JSON.stringify(data));
	} catch (error) {
		console.warn(`Error saving file: ${path}`, error);
	}
}

function exportTestDataAsJSONFile(testData, fileName) {
	const dataString = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(testData, null, 2));
	let downloadAnchorNode = document.createElement('a');
	downloadAnchorNode.setAttribute('href', dataString);
	downloadAnchorNode.setAttribute('download', `${fileName}.json`);
	document.body.appendChild(downloadAnchorNode);
	downloadAnchorNode.click();
	downloadAnchorNode.remove();
}

function exportResultsSummaryAsCSVFile(allTestData, fileName) {
	const headerBlocklist = ['rawData', 'export'];
	let resultsSummaries = [];
	allTestData.forEach((testData) => {
		resultsSummaries.push(parseResultsSummaryRowData(testData));
	});

	const csvColumnNames = Object.keys(resultsSummaries[0]).filter(columnName => !headerBlocklist.includes(columnName));
	const csvRows = resultsSummaries.map((summary) => {
		return csvColumnNames.map((header) => {
			switch (typeof summary[header]) {
				case 'string':
					return `"${summary[header]}"`;
				case 'number':
				case 'boolean':
					return summary[header];
				case 'undefined':
					return '';
				default:
					throw new Error('Unexpected data type in CSV export.');
			}
		});
	});
	const csvData = [csvColumnNames.join(','), ...csvRows.map(row => row.join(','))].join('\n');

	const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const downloadAnchor = document.createElement('a');
	downloadAnchor.setAttribute('href', url);
	downloadAnchor.setAttribute('download', fileName);
	document.body.appendChild(downloadAnchor);
	downloadAnchor.click();
	document.body.removeChild(downloadAnchor);
}

function formatFilenameDatetime(date) {
	const pad = num => String(num).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_`
		+ `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function displayWarningMessage(alertMessageContainer, testString) {
	alertMessageContainer.appendChild(E('div', { class: 'alert-message-fade-in warning' }, [
		E('p', {}, _('The %s test took longer than expected, possibly due to a slow connection. If the test doesn\'t terminate automatically, you may need to abort the test.').format(testString)),
		E('button', {
			class: 'cbi-button cbi-button-action',
			click: function () { this.parentElement.style.display = 'none'; },
		}, [_('Dismiss')]),
	]));
}

async function waitForIperf3Results(iperf3ClientId, duration, pollInterval, remainingIncrements, percentPerIncrement, testProgressBar, cancelPromise, alertMessageContainer) {
	// 30% margin of safety
	const timeout = (duration * 1300);
	const startTime = Date.now();
	let clientPollResponse, completed = false;
	let notificationShown = false;

	while (!completed) {
		if (Date.now() - startTime > timeout) {
			let testString = testProgressBar.text;
			testProgressBar.setErrorState(_('%s (Test took too long)').format(testString));
			if (!notificationShown) {
				displayWarningMessage(alertMessageContainer, testString);
				notificationShown = true;
			}
		}

		let timeoutPromise = await Promise.race([cancelPromise, new Promise(resolve => setTimeout(resolve, pollInterval * 1000))]);
		if (timeoutPromise === ui.CANCEL) {
			testProgressBar.reset('Test Cancelled');
			throw new Error('Test Cancelled');
		}

		clientPollResponse = await getBackground(iperf3ClientId);
		if (Number.isInteger(clientPollResponse) && clientPollResponse !== 0) {
			throw new Error(`Request to local device failed with UBUS code: ${clientPollResponse}`);
		} else if (Object.keys(clientPollResponse).length > 0) {
			completed = true;
		}

		if (remainingIncrements > 0) {
			remainingIncrements--;
			testProgressBar.increment(percentPerIncrement);
		}
	}

	return clientPollResponse;
}

function parseResultsSummaryRowData(data) {
	const { local, remote } = data;

	const timestamp = new Date(data.timestamp).toLocaleString('en-US');

	let localCoords = data.configuration.basic?.localDeviceCoordinates;
	let remoteCoords = data.configuration.basic?.remoteDeviceCoordinates;
	let locationURL;
	if (localCoords && remoteCoords) {
		localCoords = localCoords.replace(/\s+/g, '');
		remoteCoords = remoteCoords.replace(/\s+/g, '');
		locationURL = `https://www.google.com/maps/dir/?api=1&origin=${localCoords}&destination=${remoteCoords}&travelmode=walking`;
	}

	const bandwidth = data.local.morseCliChannel?.channel_op_bw;
	const channel = data.local.iwinfoInfo?.channel
		? `${data.local.iwinfoInfo.channel} (${data.local.iwinfoInfo.frequency / 1e3} MHz)`
		: undefined;

	const parseThroughputValue = (value) => {
		if (typeof value === 'number' && !isNaN(value)) {
			return (value / 1e6).toFixed(2);
		}
		return undefined;
	};

	// Only display the receiving end of the iperf for data.
	// Recall that in 'receive' mode, iperf runs with the reverse
	// flag (-R) where the client (the local device) receives traffic.
	const udpThroughputSend = parseThroughputValue(remote.iperf3.udp.send.end?.sum_received?.bits_per_second);
	const udpThroughputReceive = parseThroughputValue(local.iperf3.udp.receive.end?.sum_sent?.bits_per_second);
	const tcpThroughputSend = parseThroughputValue(remote.iperf3.tcp.send.end?.sum_received?.bits_per_second);
	const tcpThroughputReceive = parseThroughputValue(local.iperf3.tcp.receive.end?.sum_sent?.bits_per_second);

	const localSignalStrength = data.local.iwinfoInfo?.signal;
	const remoteDeviceIpAddress = data.configuration.basic?.remoteDeviceIpAddress;
	const remoteDeviceHostname = data.configuration.basic?.remoteDeviceInfo?.hostname;

	return {
		id: data.id,
		timestamp: timestamp,
		remoteHost: `${remoteDeviceIpAddress} ${remoteDeviceHostname ? `(${remoteDeviceHostname})` : ''}`,
		description: data.configuration.basic?.description,
		distance: data.configuration.basic?.range,
		location: locationURL,
		bandwidth: bandwidth,
		channel: channel,
		udpThroughputSend: udpThroughputSend,
		udpThroughputReceive: udpThroughputReceive,
		tcpThroughputSend: tcpThroughputSend,
		tcpThroughputReceive: tcpThroughputReceive,
		signalStrength: localSignalStrength,
		export: true,
		rawData: data,
	};
}

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	load() {
		this.rangetestConfiguration = {
			basic: {},
			advanced: {
				protocol: ['udp', 'tcp'],
				direction: ['send', 'receive'],
			},
		};
		return Promise.all([getLocalTests()]);
	},

	addResultsSummaryRow(data) {
		const parsedRowData = parseResultsSummaryRowData(data);
		const rowIndex = Object.keys(this.resultsSummaryTable.data.data).length;
		this.resultsSummaryTable.data.add(null, String(rowIndex), String(rowIndex));
		Object.assign(this.resultsSummaryTable.data.data[rowIndex], parsedRowData);
		this.resultsSummaryTable.load();
		this.resultsSummaryTable.save();
	},

	async handleStartTest(ev, cancelPromise) {
		try {
			await this.basicTestConfigurationForm.parse();
			const remoteHostIp = this.rangetestConfiguration.basic.remoteDeviceIpAddress;
			this.rangetestConfiguration.basic.remoteDeviceInfo = knownRemoteDevices[remoteHostIp];
			// Remove all previous alert messages before starting a new test
			this.alertMessageContainer.replaceChildren();
			const testResults = await runRangetest(cancelPromise, this.rangetestConfiguration, this.testProgressBar, this.alertMessageContainer);
			this.addResultsSummaryRow(testResults);
		} catch (error) {
			console.error(error);
			ui.addNotification(_('Rangetest error'), E('pre', {}, error.message), 'error');
		}
	},

	RemoteDeviceSelect: form.Value.extend({
		__init__: function () {
			this.super('__init__', arguments);
			this.orientation = 'horizontal';
		},

		renderWidget: function (sectionId, optionIndex, cfgvalue) {
			this.clear();
			for (const [ipv4Address, deviceInfo] of Object.entries(knownRemoteDevices)) {
				if (deviceInfo.available) {
					this.value(ipv4Address, `${ipv4Address} (${deviceInfo.hostname})`);
					cfgvalue = cfgvalue || ipv4Address;
				}
			}

			return E('div', { class: 'control-group' }, [
				form.Value.prototype.renderWidget.call(this, sectionId, optionIndex, cfgvalue),
				E('button', {
					'id': 'discover-button',
					'class': 'cbi-button cbi-button-action',
					'title': _('Scan for wifi networks'),
					'aria-label': _('Scan for wifi networks'),
					'click': ui.createHandlerFn(this, async () => {
						await updateKnownRemoteDevices();
						this.renderUpdate(sectionId);
					}),
				}, '\u{1F50D}'),
			]);
		},
	}),

	basicTestConfigurationForm() {
		const sectionId = 'basic';
		const m = new form.JSONMap(this.rangetestConfiguration);
		const s = m.section(form.NamedSection, sectionId);
		let o;

		o = s.option(this.RemoteDeviceSelect, 'remoteDeviceIpAddress', _('Remote Device'), _('Select the remote device to test against'));
		o.datatype = 'ip4addr';
		o.rmempty = false;
		o.optional = false;

		o = s.option(form.Value, 'remoteDevicePassword', _('Password'), _('Remote device password'));
		o.datatype = 'string';
		o.password = true;
		o.optional = true;

		o = s.option(form.Value, 'description', _('Description'), _('Optional: short description of the test conditions'));
		o.datatype = 'string';
		o.placeholder = _('line of sight, low noise environment...');
		o.optional = true;

		let localDeviceCoordinatesInput = s.option(form.Value, 'localDeviceCoordinates', _('Local device coordinates'), _('Optional: Must be provided in Decimal Degrees (DD) format, used by Google Maps'));
		localDeviceCoordinatesInput.validate = validateDecimalDegrees;
		localDeviceCoordinatesInput.placeholder = '-33.885553, 151.211138'; // MM Sydney office
		localDeviceCoordinatesInput.optional = true;

		let remoteDeviceCoordinatesInput = s.option(form.Value, 'remoteDeviceCoordinates', _('Remote device coordinates'), _('Optional: Must be provided in Decimal Degrees (DD) format, used by Google Maps'));
		remoteDeviceCoordinatesInput.validate = validateDecimalDegrees;
		remoteDeviceCoordinatesInput.placeholder = '-34.168550, 150.611910';	// MM Picton office
		remoteDeviceCoordinatesInput.optional = true;

		let rangeInput = s.option(form.Value, 'range', _('Range (m)'), _('The distance between devices under test'));
		rangeInput.datatype = 'and(min(1), uinteger)';
		rangeInput.placeholder = _('500');
		rangeInput.rmempty = false;
		rangeInput.optional = false;

		// If the user manually enters the range, remove any invalid coordinate input
		rangeInput.onchange = () => {
			localDeviceCoordinatesInput.getUIElement(sectionId).setValue(null);
			remoteDeviceCoordinatesInput.getUIElement(sectionId).setValue(null);
		};

		const updateRangeIfUsingCoordinates = function () {
			let localCoords = localDeviceCoordinatesInput.getUIElement(sectionId).getValue();
			let remoteCoords = remoteDeviceCoordinatesInput.getUIElement(sectionId).getValue();
			if (localCoords === '' || !localDeviceCoordinatesInput.isValid(sectionId) || remoteCoords === '' || !remoteDeviceCoordinatesInput.isValid(sectionId)) {
				return;
			}

			localCoords = localCoords.replace(/\s+/g, '');
			remoteCoords = remoteCoords.replace(/\s+/g, '');

			let localLat, localLong, remoteLat, remoteLong;
			[localLat, localLong] = localCoords.split(',').map(parseFloat);
			[remoteLat, remoteLong] = remoteCoords.split(',').map(parseFloat);
			const newRange = getDistanceBetweenDecimalDegreesCoordinates(localLat, localLong, remoteLat, remoteLong);

			rangeInput.getUIElement(sectionId).setValue(Math.round(newRange));
			rangeInput.triggerValidation(sectionId);
		};

		localDeviceCoordinatesInput.onchange = updateRangeIfUsingCoordinates;
		remoteDeviceCoordinatesInput.onchange = updateRangeIfUsingCoordinates;

		let progressBarContainer, progressBarElement;
		progressBarContainer = E('div', { class: 'cbi-progressbar', style: 'margin: 0 2em 0 2em; visibility: hidden;' }, progressBarElement = E('div', { style: 'width: 0%' }));
		this.testProgressBar = progressBar.new(progressBarContainer, progressBarElement);

		this.progressBarContainer = E('div', { class: 'cbi-progressbar', style: 'margin: 0 2em 0 2em; visibility: hidden;' }, this.progressBarElement = E('div', { style: 'width: 0%' }));
		this.testProgressBar = progressBar.new(this.progressBarContainer, this.progressBarElement);

		this.alertMessageContainer = E('div', { class: 'alert-container' });

		return m;
	},

	async renderAdvancedTestConfigurationForm() {
		const m = new form.JSONMap(this.rangetestConfiguration);
		const s = m.section(form.NamedSection, 'advanced');
		let o;

		o = s.option(form.MultiValue, 'protocol', _('Protocol'));
		o.value('udp', _('UDP'));
		o.value('tcp', _('TCP'));
		o.rmempty = false;
		o.optional = false;

		o = s.option(form.MultiValue, 'direction', _('Data Direction'));
		o.value('send', _('Send'));
		o.value('receive', _('Receive'));
		o.rmempty = false;
		o.optional = false;

		const save = async () => {
			await m.save();
			ui.hideModal();
		};

		ui.showModal(_('Advanced Configuration'), [
			await m.render(),
			E('div', { class: 'right' }, [
				E('button', { class: 'cbi-button', click: ui.hideModal }, _('Dismiss')), ' ',
				E('button', { class: 'cbi-button cbi-button-positive', click: save }, _('Save')), ' ',
			]),
		]);
	},

	resultsSummaryTable() {
		const m = new form.JSONMap(null);
		const s = m.section(form.GridSection);
		s.addremove = true;
		s.anonymous = true;
		s.nodescriptions = true;

		let o;

		s.handleRemove = async function (sectionId, _ev) {
			let configName = this.map.config;
			const testId = this.map.data.data[sectionId].id;
			ui.showModal(_('Confirm Deletion'), [
				E('p', {}, _('Are you sure?')),
				E('div', { class: 'right' }, [
					E('button', {
						class: 'cbi-button cbi-button-negative',
						click: ui.createHandlerFn(this, async () => {
							deleteLocalTest(testId);
							this.map.data.remove(configName, sectionId);
							this.map.save(null, true);
							ui.hideModal();
						}),
					}, _('Delete')),
					' ',
					E('button', {
						class: 'cbi-button',
						click: ui.hideModal,
					}, _('Cancel')),
				]),
			]);
		};

		o = s.option(form.DummyValue, 'timestamp', _('Time'));
		o.datatype = 'string';
		o.readonly = true;

		o = s.option(form.DummyValue, 'remoteHost', _('Remote Host'));
		o.datatype = 'string';
		o.readonly = true;

		o = s.option(form.DummyValue, 'description', _('Description'));
		o.datatype = 'string';

		o = s.option(form.DummyValue, 'distance', _('Distance (m)'));
		o.datatype = 'uinteger';
		o.readonly = true;

		const locationLink = s.option(form.DummyValue, 'location', _('Location'));
		locationLink.editable = true;
		locationLink.renderWidget = function (sectionId, optionIndex, cfgvalue) {
			if (!cfgvalue) {
				return E('em', {}, 'unknown');
			}

			return E('div', { style: 'display: flex; align-items: flex-start; gap: 1em;' }, [
				E('a', {
					href: cfgvalue,
					target: '_blank',
					rel: 'noopener noreferrer',
				}, [_('map view')]),
			]);
		};

		o = s.option(form.DummyValue, 'bandwidth', _('Bandwidth (MHz)'));
		o.datatype = 'uinteger';
		o.readonly = true;

		o = s.option(form.DummyValue, 'channel', _('Channel'));
		o.datatype = 'uinteger';
		o.readonly = true;

		o = s.option(form.DummyValue, 'udpThroughputSend', _('UDP Send Throughput (Mbps)'));
		o.datatype = 'string';
		o.readonly = true;

		o = s.option(form.DummyValue, 'udpThroughputReceive', _('UDP Receive Throughput (Mbps)'));
		o.datatype = 'string';
		o.readonly = true;

		o = s.option(form.DummyValue, 'tcpThroughputSend', _('TCP Send Throughput (Mbps)'));
		o.datatype = 'string';
		o.readonly = true;

		o = s.option(form.DummyValue, 'tcpThroughputReceive', _('TCP Receive Throughput (Mbps)'));
		o.datatype = 'string';
		o.readonly = true;

		o = s.option(form.DummyValue, 'signalStrength', _('Signal Strength (dBm)'));
		o.datatype = 'integer';
		o.readonly = true;

		const downloadButton = s.option(form.DummyValue, 'export', _('Raw Data (JSON)'));
		downloadButton.editable = true;
		downloadButton.renderWidget = function (sectionId, _optionIndex, _cfgvalue) {
			return E('div', { style: 'display: flex; align-items: flex-start; gap: 1em;' }, [
				E('button', {
					class: 'cbi-button cbi-button-action',
					click: ui.createHandlerFn(this, () => {
						const rawData = this.map.data.data[sectionId].rawData;
						const ISOdatetimeString = this.map.data.data[sectionId].timestamp;
						const filenameDatetimeString = formatFilenameDatetime(new Date(ISOdatetimeString));
						exportTestDataAsJSONFile(rawData, `rangetest_data_${filenameDatetimeString}`);
					}),
				}, [_('Download')]),
			]);
		};

		return m;
	},

	async render([localTests]) {
		this.basicTestConfigurationForm = this.basicTestConfigurationForm();
		this.resultsSummaryTable = this.resultsSummaryTable();

		this.titleSection = E('section', { class: 'cbi-section' }, [
			E('h2', {}, _('Range Test')),
			E('div', { class: 'cbi-map-descr' }, _('This is a network utility to perform static range tests.')),
			E('div', { class: 'cbi-map-descr' }, [
				E('span', {}, _('How to use:')),
				E('div', { class: 'cbi-value cbi-message-value' }, [
					E('ol', {}, [
						E('li', { style: 'list-style-type: inherit' }, _('Associate this device with another remote device which you want to test against.')),
						E('li', { style: 'list-style-type: inherit' }, _('Choose that remote device from the dropdown list and select your desired test settings.')),
						E('li', { style: 'list-style-type: inherit' }, _('Click \'Start Test\' to begin.')),
					]),
				]),
			]),
		]);
		this.configurationSection = E('section', { class: 'cbi-section' }, [
			E('h3', {}, [
				_('Test Configuration'),
				E('button', {
					title: 'Advanced Configuration',
					class: 'icon-button icon-button-settings-cog pull-right',
					click: ui.createHandlerFn(this, this.renderAdvancedTestConfigurationForm),
				}),
			]),
			await this.basicTestConfigurationForm.render(),
			E('div', { class: 'cbi-page-actions', style: 'display: flex; align-items: center;' }, [
				E('button', { class: 'cbi-button cbi-button-action', click: ui.createCancellableHandlerFn(this, this.handleStartTest, _('Stop')) }, [_('Start Test')]),
				this.progressBarContainer,
			]),
			this.alertMessageContainer,
		]);
		this.resultsSummarySection = E('section', { class: 'cbi-section' }, [
			E('h3', {}, _('Results Summary')),
			await this.resultsSummaryTable.render(),
			E('div', { class: 'cbi-section-create cbi-tblsection-create' }, [
				E('button', { class: 'cbi-button cbi-button-action', click: ui.createHandlerFn(this, async () => {
					const filenameDatetimeString = formatFilenameDatetime(new Date());
					const allTests = await getLocalTests();
					if (allTests.length === 0) {
						ui.addNotification(null, E('pre', {}, 'No test data available!'));
						return;
					}

					exportResultsSummaryAsCSVFile(allTests, `rangetest_all_data_${filenameDatetimeString}`);
				}) }, [_('Download Results Summary (CSV)')]),
				E('button', { class: 'cbi-button cbi-button-negative', click: ui.createHandlerFn(this, async () => {
					const allTests = await getLocalTests();
					if (allTests.length === 0) {
						ui.addNotification(null, E('pre', {}, 'No test data available!'));
						return;
					}
					ui.showModal(_('Confirm Deletion'), [
						E('p', {}, _('Are you sure?')),
						E('div', { class: 'right' }, [
							E('button', {
								class: 'cbi-button cbi-button-negative',
								click: ui.createHandlerFn(this, async () => {
									const allTests = await getLocalTests();
									for (const test of allTests) {
										await deleteLocalTest(test.id);
									}
									this.resultsSummaryTable.data.data = {};
									this.resultsSummaryTable.load();
									this.resultsSummaryTable.save();
									ui.hideModal();
								}),
							}, _('Delete All')),
							' ',
							E('button', {
								class: 'cbi-button',
								click: ui.hideModal,
							}, _('Cancel')),
						]),
					]);
				}) }, [_('Delete All')]),
			]),
		]);

		const res = [
			this.titleSection,
			this.configurationSection,
			this.resultsSummarySection,
		];

		localTests.forEach(test => this.addResultsSummaryRow(test));
		this.configurationSection.querySelector('#discover-button').click();
		return res;
	},
});
