/**
 * A user-centric range testing application with exportable test output.
 */

'use strict';

/* global Leaflet */

/* globals view ui form rpc fs network remoteDevice progressBar errorUtils */
'require view';
'require ui';
'require form';
'require rpc';
'require fs';
'require network';
'require tools.morse.rangetest.remote as remoteDevice';
'require tools.morse.rangetest.progressbar as progressBar';
'require tools.morse.rangetest.errorutils as errorUtils';

const TEST_RESULT_DIRECTORY = '/tmp/rangetest';

const MESSAGE_TYPES = {
	ERROR: 'error',
	WARNING: 'warning',
	INFO: 'info',
};

document.querySelector('head').appendChild(E('link', {
	rel: 'stylesheet',
	type: 'text/css',
	href: L.resourceCacheBusted('view/rangetest/css/rangetest.css'),
}));

document.querySelector('head').appendChild(E('link', {
	rel: 'stylesheet',
	type: 'text/css',
	href: 'https://repo.apps.morsemicro.com/leaflet@1.9.4/dist/leaflet.css',
	crossorigin: '',
}));

window.Leaflet = null;
document.querySelector('head').appendChild(E('script', {
	load: () => {
		window.Leaflet = window.L.noConflict();
		document.dispatchEvent(new Event('leafletLoaded'));
	},
	src: 'https://repo.apps.morsemicro.com/leaflet@1.9.4/dist/leaflet.js',
	crossorigin: '',
}));

const umdnsUpdate = rpc.declare({
	object: 'umdns',
	method: 'update',
	params: [],
	filter: errorUtils.catchRangetestErrors,
	nobatch: true,
});

const umdnsBrowse = rpc.declare({
	object: 'umdns',
	method: 'browse',
	params: ['array'],
	expect: { '_http._tcp': {} },
	filter: errorUtils.catchRangetestErrors,
	nobatch: true,
});

const backgroundIperf3Client = rpc.declare({
	object: 'rangetest',
	method: 'background_iperf3_client',
	params: ['target', 'udp', 'reverse', 'time', 'omit'],
	filter: errorUtils.catchRangetestErrors,
	nobatch: true,
});

const getBackground = rpc.declare({
	object: 'rangetest',
	method: 'get_background',
	params: ['id'],
	filter: errorUtils.catchRangetestErrors,
	nobatch: true,
});

const iwStationDump = rpc.declare({
	object: 'rangetest',
	method: 'iw_station_dump',
	filter: errorUtils.catchRangetestErrors,
	nobatch: true,
});

const morseCliStatsReset = rpc.declare({
	object: 'rangetest',
	method: 'morse_cli_stats_reset',
	filter: errorUtils.catchRangetestErrors,
	nobatch: true,
});

const morseCliStats = rpc.declare({
	object: 'rangetest',
	method: 'morse_cli_stats',
	nobatch: true,
});

const morseCliChannel = rpc.declare({
	object: 'rangetest',
	method: 'morse_cli_channel',
	filter: errorUtils.catchRangetestErrors,
	nobatch: true,
});

const ipLink = rpc.declare({
	object: 'rangetest',
	method: 'ip_link',
	filter: errorUtils.catchRangetestErrors,
	nobatch: true,
});

const iwinfoInfo = rpc.declare({
	object: 'iwinfo',
	method: 'info',
	params: ['device'],
	filter: errorUtils.catchRangetestErrors,
	nobatch: true,
});

const info = rpc.declare({
	object: 'rangetest',
	method: 'info',
	filter: errorUtils.catchRangetestErrors,
	nobatch: true,
});

let localRangetestVersion = null;
let inProgressTestId = null;
let lastUmdnsUpdateTime = null;
let knownRemoteDevices = {};

function resetKnownRemoteDevices() {
	Object.keys(knownRemoteDevices).forEach((ipv4Address) => {
		knownRemoteDevices[ipv4Address].cached = false;
		knownRemoteDevices[ipv4Address].online = false;
		knownRemoteDevices[ipv4Address].rangetest_api_version = null;
		knownRemoteDevices[ipv4Address].compatible = false;
	});
}

function checkVersionCompatibility(localRangetestVersion, remoteRangetestVersion) {
	if (!localRangetestVersion || !remoteRangetestVersion) return false;

	const [major, _minor, _patch] = localRangetestVersion.split('.').map(Number);
	const [remoteMajor, _remoteMinor, _remotePatch] = remoteRangetestVersion.split('.').map(Number);
	return (major === remoteMajor);
}

async function updateUmdnsCache() {
	// Do not update cache initially to avoid overload.
	if (lastUmdnsUpdateTime !== null) {
		await umdnsUpdate();

		// Documentation says to 'wait a second or two' before browsing.
		await new Promise(resolve => setTimeout(resolve, 1500));
	}
	lastUmdnsUpdateTime = Date.now();
}

function parseTxtRecord(deviceInfo) {
	if (!deviceInfo?.txt) return null;

	const txtRecord = { rangetest_api_version: null };
	deviceInfo.txt.forEach((record) => {
		const [key, value] = record.split('=');

		if (key === 'rangetest_api_version') {
			if ((/^\d+\.\d+\.\d+$/g).test(value)) {
				txtRecord.rangetest_api_version = value;
			} else {
				console.warn(`Invalid rangetest version found in TXT record: ${deviceInfo.txt}`);
			}
		}
	});

	return txtRecord;
}

/**
 * Retrieve all the local device's unique IP addresses.
 */
async function getLocalDeviceIpAddrs() {
	const localDeviceIpAddrs = new Set();
	const networks = await network.getNetworks();

	for (const network of networks) {
		const ipAddrs = network.getIPAddrs().map(ipAddr => ipAddr.split('/')[0]);
		ipAddrs.forEach(ipAddr => localDeviceIpAddrs.add(ipAddr));
	}

	return localDeviceIpAddrs;
}

async function fetchRemoteDeviceInfo(ipv4Address) {
	const deviceInfoRequest = (async () => {
		try {
			const unauthenticatedRemoteDeviceSession = remoteDevice.load(ipv4Address, null);
			const timeout = new Promise((_, reject) =>
				setTimeout(() => reject(new Error('Request timed out')), 5000),
			);
			const remoteRangetestInfo = await Promise.race([unauthenticatedRemoteDeviceSession.info(), timeout]);

			// The remote device has responded with a version, treat it as authoritative.
			knownRemoteDevices[ipv4Address].online = true;
			if (remoteRangetestInfo.rangetest_api_version) {
				knownRemoteDevices[ipv4Address].rangetest_api_version = remoteRangetestInfo.rangetest_api_version;
				knownRemoteDevices[ipv4Address].compatible = checkVersionCompatibility(localRangetestVersion, remoteRangetestInfo.rangetest_api_version);
			}
		} catch (error) {
			knownRemoteDevices[ipv4Address].online = false;
			console.warn(`Error fetching device info from ${ipv4Address}`, error);
		}
	})();

	return deviceInfoRequest;
}

/**
 * Updates the global `knownRemoteDevices` object with the latest information
 * about remote devices discovered on the network.
 *
 * - Cached devices: Devices previously discovered by umdns are marked as `cached: false`
 *   and `online: false` initially. Their status is updated (`cached: true`) if they appear
 * 	 in the latest umdns browse results.
 * - Online devices: Remote devices which respond to rangetest info requests are marked
 *   as `online: true`.
 */
async function updateKnownRemoteDevices() {
	resetKnownRemoteDevices();
	await updateUmdnsCache();

	// Ensure that umdnsUpdate is not called on the first run
	// to avoid overload in larger networks (If it behaved correctly
	// it would have been updated by itself as it or other remote
	// devices came online).
	if (lastUmdnsUpdateTime !== null) {
		await umdnsUpdate();

		// Documentation says to 'wait a second or two' before browsing.
		await new Promise(resolve => setTimeout(resolve, 1500));
	}
	lastUmdnsUpdateTime = Date.now();

	let browseResults = await umdnsBrowse(true);

	// If no devices are cached at all, display an error message
	if (Object.keys(browseResults).length === 0) {
		displayMessageToUser(
			MESSAGE_TYPES.WARNING,
			_('Remote Device Discovery'),
			_(
				'No remote devices found!\n\n'
				+ 'Please associate this device with a remote device you want to test against, then try again.\n\n'
				+ 'If your device is still not appearing, you can manually enter an IPv4 address into the Remote Device dropdown.',
			),
			{ modal: true },
		);
		return;
	}

	const localDeviceIpAddrs = await getLocalDeviceIpAddrs();
	let deviceInfoRequests = [];
	for (const [hostname, deviceInfo] of Object.entries(browseResults)) {
		const txtRecord = parseTxtRecord(deviceInfo);

		for (const ipv4Address of deviceInfo.ipv4) {
			// Filter all IP addresses which could refer to the local device.
			if (ipv4Address === '10.22.121.111' || localDeviceIpAddrs.has(ipv4Address)) {
				continue;
			}

			knownRemoteDevices[ipv4Address] = { hostname, ipv4Address, deviceInfo };
			knownRemoteDevices[ipv4Address].cached = true;

			// Set the rangetest version from the TXT record if available,
			// which should be overwritten by the remote info() call if possible.
			knownRemoteDevices[ipv4Address].rangetest_api_version = txtRecord?.rangetest_api_version;
			knownRemoteDevices[ipv4Address].compatible = checkVersionCompatibility(localRangetestVersion, txtRecord?.rangetest_api_version);

			// Make an actual request to each device to verify it is online
			// and to get the actual rangetest version where possible (may be outdated).
			const deviceInfoRequest = fetchRemoteDeviceInfo(ipv4Address);
			deviceInfoRequests.push(deviceInfoRequest);
		}
	}
	await Promise.allSettled(deviceInfoRequests);

	if (Object.values(knownRemoteDevices).every(device => !device.compatible)) {
		displayMessageToUser(
			MESSAGE_TYPES.WARNING,
			_('Remote Device Discovery'),
			_(
				'No compatible remote devices found!\n\n'
				+ 'Please ensure that all devices you intend to test with are running compatible versions. Upgrade them to matching versions and try again.\n\n'
				+ 'If your device is still not appearing, you can manually enter an IPv4 address into the Remote Device dropdown.',
			),
			{ modal: true },
		);
	}
}

const deviceLocationGeoJsonTemplate = {
	type: 'Feature',
	properties: {
		name: '',
	},
	geometry: {
		coordinates: [0, 0],
		type: 'Point',
	},
};

const testResultsTemplate = {
	status: '',
	id: 0,
	timestamp: '',
	iperf3: {
		udp: { receive: {}, send: {} },
		tcp: { receive: {}, send: {} },
	},
	local: {
		morseCliChannel: {},
		morseCliStats: {},
		iwStationDump: {},
		ipLink: {},
		iwinfoInfo: {},
		connectedInterface: '',
	},
	remote: {
		morseCliStats: {},
		iwStationDump: {},
		ipLink: {},
		connectedInterface: '',
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
	const latitude = Number(coordinates[0].trim());
	const longitude = Number(coordinates[1].trim());

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
async function runRangetest(cancelPromise, configuration, testProgressBar, updateResultsSummaryRow) {
	const {
		advanced: {
			protocol: protocols,
			direction: directions,
			length: iperf3TestTime,
			omit: iperf3OmitTime,
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
	inProgressTestId = testResults.id;
	testResults.configuration = configuration;
	testResults.timestamp = new Date().toISOString();

	const iperf3PollInterval = 2;
	const nSubtests = protocols.length * directions.length;
	const maxSubtestIncrements = iperf3TestTime / iperf3PollInterval;
	const percentPerIncrement = 100 / (maxSubtestIncrements * nSubtests);
	testProgressBar.show();
	testProgressBar.reset('Beginning...');
	testResults.status = 'Beginning...';
	updateResultsSummaryRow(testResults);

	try {
		await setupStatistics(testResults, remoteRangetestDevice);

		const iperf3RemoteServerResponse = await remoteRangetestDevice.backgroundIperf3Server();
		for (const protocol of protocols) {
			for (const direction of directions) {
				testProgressBar.text = `${protocol.toUpperCase()} ${direction}`;
				testResults.status = `In Progress (${protocol.toUpperCase()} ${direction})`;
				updateResultsSummaryRow(testResults);

				const iperf3LocalResponse = await backgroundIperf3Client(remoteIp, (protocol === 'udp'), (direction === 'receive'), iperf3TestTime, iperf3OmitTime);
				const iperf3LocalResults = await waitForIperf3Results(iperf3LocalResponse.id, iperf3TestTime, iperf3PollInterval, maxSubtestIncrements, percentPerIncrement, testProgressBar, cancelPromise);

				testResults['iperf3'][protocol][direction]['end'] = iperf3LocalResults?.end;
			}
		}
		await remoteRangetestDevice.terminateBackground(iperf3RemoteServerResponse.id);

		await collectStatistics(testResults, remoteRangetestDevice);

		testProgressBar.complete('Test Complete');
		testResults.status = 'Completed';
	} catch (error) {
		console.error(error);
		if (error.cause === 'cancellation') {
			displayMessageToUser(MESSAGE_TYPES.INFO, _('User Action'), error.message, { timeout: 10000 });
			testProgressBar.reset('Cancelled');
			testResults.status = 'Cancelled';
		} else if (error.cause === 'auth') {
			displayMessageToUser(MESSAGE_TYPES.ERROR, _('Authentication Failure'), error.message, { modal: true });
			testProgressBar.reset('Authentication Failure');
			testResults.status = 'Failed (Authentication)';
		} else if (error.cause === 'offline') {
			displayMessageToUser(MESSAGE_TYPES.ERROR, _('Remote Device Unreachable'), error.message, { modal: true });
			testProgressBar.reset('Remote Device Unreachable');
			testResults.status = 'Failed (Remote Device Unreachable)';
		} else {
			displayMessageToUser(MESSAGE_TYPES.ERROR, _('Rangetest Error'), error.message);
			testProgressBar.reset('Rangetest Error');
			testResults.status = 'Failed';
		}
	} finally {
		inProgressTestId = null;
		updateResultsSummaryRow(testResults);
		saveLocalTest(testResults.id, testResults);
	}
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
					return `"${summary[header].replace(/"/g, '""')}"`;
				case 'number':
				case 'boolean':
					return summary[header];
				case 'undefined':
					return '';
				default:
					displayMessageToUser(MESSAGE_TYPES.ERROR, _('CSV Export Error'), _('Unexpected data type in CSV export.'));
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

/**
 * Displays a message to the user, either as a modal or a non-modal message.
 *
 * @param {string} type - The type of message ('error', 'warning', 'info').
 * @param {string} title - The message title.
 * @param {string} message - The message content.
 * @param {Object} options - Additional options.
 * @param {boolean} [options.modal=false] - Whether to display the message as a modal.
 * @param {number} [options.timeout=null] - Timeout in milliseconds to auto-hide the message.
 * @param {boolean} [options.scrollToVisible=true] - Whether to scroll to make the message visible.
 */
function displayMessageToUser(type, title, message, options = {}) {
	const { modal = false, timeout = null, scrollToVisible = true } = options;

	if (modal) {
		ui.showModal(title, [
			E('p', {}, [E('em', { style: 'white-space:pre-wrap' }, [message])]),
			E('div', { class: 'right' }, [
				E('button', { class: 'cbi-button', click: ui.hideModal }, _('Dismiss')),
			]),
		]);
		return;
	}

	const userMessageContainer = document.querySelector('#user-message-container');
	const messageElement = E('div', { class: `alert-message alert-message-fade-in ${type} user-message` }, [
		E('p', {}, [
			E('strong', {}, `${title}: `),
			E('span', { style: 'white-space: pre-wrap; font-weight: normal;' }, message),
		]),
		E('button', {
			class: 'cbi-button cbi-button-action',
			click: function () {
				removeUserMessage(messageElement);
			},
		}, [_('Dismiss')]),
	]);
	userMessageContainer.appendChild(messageElement);
	setTimeout(() => {
		if (scrollToVisible) {
			messageElement.scrollIntoView({ behavior: 'smooth' });
		}
	}, 10);

	// If the message has a timeout, remove it after the timeout.
	if (timeout) {
		setTimeout(() => {
			removeUserMessage(messageElement);
		}, timeout);
	}

	return messageElement;
}

function removeUserMessage(messageElement) {
	messageElement.remove();
}

function clearUserMessages() {
	const userMessageContainer = document.querySelector('#user-message-container');
	const userMessages = userMessageContainer.querySelectorAll('.user-message');
	userMessages.forEach(messageElement => removeUserMessage(messageElement));
}

async function waitForIperf3Results(iperf3ClientId, duration, pollInterval, remainingIncrements, percentPerIncrement, testProgressBar, cancelPromise) {
	// 30% margin of safety
	const timeout = (duration * 1300);
	const startTime = Date.now();
	let clientPollResponse, completed = false;
	let testDelayWarningShown = false;
	let testDelayWarningElement;

	while (!completed) {
		if (Date.now() - startTime > timeout) {
			let testString = testProgressBar.text;
			testProgressBar.setErrorState(`${testString} (Test taking longer than expected)`);
			if (!testDelayWarningShown) {
				testDelayWarningElement = displayMessageToUser(
					MESSAGE_TYPES.WARNING,
					`${testString} Test Delay`,
					`The ${testString} test is taking slightly longer than expected.`
					+ ` This behaviour is normal when network conditions are constrained.`
					+ ` If the test appears completely unresponsive, you can manually cancel it.`,
				);
				testDelayWarningShown = true;
			}
		}

		let timeoutPromise = await Promise.race([cancelPromise, new Promise(resolve => setTimeout(resolve, pollInterval * 1000))]);
		if (timeoutPromise === ui.CANCEL) {
			throw new Error('Test cancelled by user.', { cause: 'cancellation' });
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

	// If the test was delayed, remove the warning message.
	// Ensure it shows for at least 2 seconds.
	if (testDelayWarningShown) {
		setTimeout(removeUserMessage(testDelayWarningElement), 2000);
	}

	return clientPollResponse;
}

function getTestLocationGeoJson(data) {
	const localCoordinates = data.configuration.basic?.localDeviceCoordinates;
	const remoteCoordinates = data.configuration.basic?.remoteDeviceCoordinates;

	if (!localCoordinates || !remoteCoordinates) return undefined;

	const [latitude, longitude] = localCoordinates.split(',').map(Number);
	let localDeviceGeoJson = JSON.parse(JSON.stringify(deviceLocationGeoJsonTemplate));
	localDeviceGeoJson.geometry.coordinates = [longitude, latitude];
	localDeviceGeoJson.properties.name = 'Local Device';

	const [remoteLatitude, remoteLongitude] = remoteCoordinates.split(',').map(Number);
	let remoteDeviceGeoJson = JSON.parse(JSON.stringify(deviceLocationGeoJsonTemplate));
	remoteDeviceGeoJson.geometry.coordinates = [remoteLongitude, remoteLatitude];
	remoteDeviceGeoJson.properties.name = 'Remote Device';

	return JSON.stringify([localDeviceGeoJson, remoteDeviceGeoJson]);
}

function parseResultsSummaryRowData(data) {
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

	// When using -R, the client's --json output will still contain the server's
	// sum_received value, so no need to retrieve the server's iPerf3 --json output.
	const udpThroughputSend = parseThroughputValue(data.iperf3.udp.send.end?.sum_received?.bits_per_second);
	const udpThroughputReceive = parseThroughputValue(data.iperf3.udp.receive.end?.sum_received?.bits_per_second);
	const tcpThroughputSend = parseThroughputValue(data.iperf3.tcp.send.end?.sum_received?.bits_per_second);
	const tcpThroughputReceive = parseThroughputValue(data.iperf3.tcp.receive.end?.sum_received?.bits_per_second);

	const localSignalStrength = data.local.iwinfoInfo?.signal;
	const remoteDeviceIpAddress = data.configuration.basic?.remoteDeviceIpAddress;
	const remoteDeviceHostname = data.configuration.basic?.remoteDeviceInfo?.hostname;

	return {
		status: data.status,
		id: data.id,
		timestamp: new Date(data.timestamp).toLocaleString('en-US'),
		remoteHost: `${remoteDeviceIpAddress} ${remoteDeviceHostname ? `(${remoteDeviceHostname})` : ''}`,
		description: data.configuration.basic?.description,
		distance: data.configuration.basic?.range,
		localDeviceCoordinates: data.configuration.basic?.localDeviceCoordinates,
		remoteDeviceCoordinates: data.configuration.basic?.remoteDeviceCoordinates,
		locationGeoJson: getTestLocationGeoJson(data),
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
				length: 20,
				omit: 5,
			},
		};
		return Promise.all([getLocalTests(), info()]);
	},

	updateResultsSummaryRow(data) {
		// If the test result is not already in the table, add it.
		if (!this.resultsSummaryTable.data.data[data.id]) {
			this.resultsSummaryTable.data.add(null, null, data.id);
		}

		const parsedRowData = parseResultsSummaryRowData(data);
		Object.assign(this.resultsSummaryTable.data.data[data.id], parsedRowData);

		this.resultsSummaryTable.load();
		this.resultsSummaryTable.save();
	},

	async handleStartTest(ev, cancelPromise) {
		// Remove all user messages before starting the test.
		clearUserMessages();
		// This is where most info, warnings, errors will be caught and displayed to the user.
		try {
			await this.basicTestConfigurationForm.parse();
		} catch (error) {
			// Should be a TypeError
			console.error(error);
			displayMessageToUser(MESSAGE_TYPES.ERROR, _('Invalid Test Configuration'), error.message, { modal: true });
			this.testProgressBar.reset('');
			return;
		}

		const remoteHostIp = this.rangetestConfiguration.basic.remoteDeviceIpAddress;
		this.rangetestConfiguration.basic.remoteDeviceInfo = knownRemoteDevices[remoteHostIp];
		await runRangetest(cancelPromise, this.rangetestConfiguration, this.testProgressBar, this.updateResultsSummaryRow.bind(this));
	},

	RemoteDeviceSelect: form.Value.extend({
		__init__: function () {
			this.super('__init__', arguments);
			this.orientation = 'horizontal';
		},

		/**
		 * Define how labels will be rendered in the dropdown list.
		 *
		 * Basic form: <ipv4Address> (<hostname>)   <info>
		 * - If using an incompatible version, show '(incompatible) v<version>' for <info>, and make it unselectable.
		 * - If the device is offline, show '(offline) v<version>' for <info>.
		 * - If the device is online, show 'v<version>' for <info>.
		 */
		renderRemoteDevice: function (sectionId, ipv4Address, deviceInfo) {
			const hostStr = `${ipv4Address} (${deviceInfo.hostname})`;
			const deviceCompatibleStr = deviceInfo.compatible ? '' : _('(🚫 incompatible)');
			const deviceOnlineStr = deviceInfo.online ? '' : _('(⚠️ offline) ');
			const deviceVersionStr = deviceInfo.rangetest_api_version ? `v${deviceInfo.rangetest_api_version}` : 'version unknown';
			const infoStr = [deviceCompatibleStr, deviceOnlineStr, deviceVersionStr].join(' ').trim();

			const remoteDeviceElem = E('span', {
				style: 'display: flex; align-items: center; width: 100%;',
				title: deviceInfo.compatible ? `${hostStr} ${infoStr}` : _('Incompatible rangetest version. Please upgrade.'),
			}, [
				E('span', { style: 'max-width: 65%; overflow: hidden; text-overflow: ellipsis;' }, hostStr),
				E('span', { style: 'flex-grow: 1; min-width: 0.5rem;' }, ''),
				E('span', { style: 'color: darkgrey' }, infoStr),
			]);
			this.value(ipv4Address, remoteDeviceElem);

			// A workaround to wait for the element to be rendered before applying styles
			// so that the incompatible devices are unselectable.
			if (!deviceInfo.compatible) {
				setTimeout(() => {
					const uiElem = this.getUIElement(sectionId);
					if (!uiElem) return;
					const li = uiElem.node.querySelector(`li[data-value="${ipv4Address}"]`);
					if (li) {
						li.setAttribute('unselectable', '');
						li.style.opacity = 0.5;
						li.style.pointerEvents = 'none';
						li.style.cursor = 'default';
					}
				}, 0);
			}
		},

		renderWidget: function (sectionId, optionIndex, cfgvalue) {
			this.clear();

			// If the pre-selected device is not online, clear the selection
			if (cfgvalue && (!knownRemoteDevices[cfgvalue]?.online || !knownRemoteDevices[cfgvalue]?.compatible)) {
				cfgvalue = null;
			}

			// Only render devices which appeared in the most recent umdns
			// browse (`cached: true`), showing the online devices first.
			Object.entries(knownRemoteDevices)
				.filter(([, deviceInfo]) => deviceInfo.cached)
				.sort(([, a], [, b]) => b.online - a.online)
				.forEach(([ipv4Address, deviceInfo]) => {
					this.renderRemoteDevice(sectionId, ipv4Address, deviceInfo);
					// Select the first online and compatible device if no options are pre-selected
					cfgvalue = (!cfgvalue && deviceInfo.online && deviceInfo.compatible) ? ipv4Address : cfgvalue;
				});

			return E('div', { class: 'control-group' }, [
				form.Value.prototype.renderWidget.call(this, sectionId, optionIndex, cfgvalue),
				E('button', {
					'id': 'discover-button',
					'class': 'cbi-button cbi-button-action',
					'title': _('Scan for remote devices'),
					'aria-label': _('Scan for remote devices'),
					'click': ui.createHandlerFn(this, async () => {
						await updateKnownRemoteDevices();
						this.renderUpdate(sectionId);
					}),
				}, '\u{1F50D}'),
			]);
		},
	}),

	CoordinatesInput: form.Value.extend({
		renderWidget: function (sectionId, optionIndex, cfgvalue) {
			this.clear();

			return E('div', { class: 'control-group' }, [
				form.Value.prototype.renderWidget.call(this, sectionId, optionIndex, cfgvalue),
				E('button', {
					'class': 'cbi-button cbi-button-action',
					'title': _('Retrieve the current location of your phone/laptop via the browser'),
					'aria-label': _('Retrieve the current location of your phone/laptop via the browser'),
					'click': ui.createHandlerFn(this, async () => {
						if (window.location.protocol !== 'https:') {
							const secureUrl = `https://${window.location.host}${window.location.pathname}`;
							ui.showModal(_('Secure Connection (HTTPS) Required for Browser Geolocation'), [
								E('p', {},
									'<strong>Important:</strong> This feature retrieves the coordinates of the device you are using to access this page '
									+ '(e.g., your laptop or phone, <strong>not the HaLow device under test</strong>). '
									+ 'Ensure this device is near your selected HaLow target before collecting its position.',
								),
								E('p', {},
									'<strong>Security Notice:</strong> To enable location access, you must reload this page with HTTPS. '
									+ `You will be redirected to <a href=${secureUrl} target='_blank'>${secureUrl}</a>. `
									+ 'On the first reload, your browser may show a security warning due to self-signed SSL certificates. '
									+ 'This is expected and can be bypassed. You will also need to log in again and grant location access when prompted. '
									+ 'After these steps, clicking the button will autofill your coordinates.',
								),
								E('p', {},
									'<em>Note:</em> Location accuracy is significantly higher on mobile devices, as they use GPS and Wi-Fi for better positioning.',
								),
								E('div', { class: 'right' }, [
									E('button', {
										class: 'cbi-button cbi-button-positive',
										click: () => {
											window.location.href = window.location.href.replace(/^http:/, 'https:');
										},
									}, _('Reload with HTTPS')),
									' ',
									E('button', {
										class: 'cbi-button',
										click: ui.hideModal,
									}, _('Cancel')),
								]),
							]);
							return;
						}

						navigator.geolocation.getCurrentPosition((position) => {
							// Warn the user if the provided location has low accuracy
							if (position.coords.accuracy > 5) {
								displayMessageToUser(
									MESSAGE_TYPES.WARNING,
									_('Low Location Accuracy'),
									_('The location provided by your browser has low accuracy (> 5m). This may affect the test results.'),
									{ timeout: 10000 },
								);
							}

							const latitude = position.coords.latitude;
							const longitude = position.coords.longitude;
							const coords = `${latitude}, ${longitude}`;
							this.getUIElement(sectionId).setValue(coords);
							this.getUIElement(sectionId).triggerValidation(sectionId);
							this.onchange();
						}, (error) => {
							console.error('Error getting browser coordinates:', error);
							displayMessageToUser(MESSAGE_TYPES.ERROR, _('Location Retrieval Error'), error.message);
						}, {
							maximumAge: 0,	// Refuse cached locations
							enableHighAccuracy: true,	// Ask the device for the best possible location
						});
					}),
				}, '\u{1F4CD}'),
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

		let localDeviceCoordinatesInput = s.option(this.CoordinatesInput, 'localDeviceCoordinates', _('Local device coordinates'), _('Optional: Must be provided in Decimal Degrees (DD) format, used by Google Maps'));
		localDeviceCoordinatesInput.validate = validateDecimalDegrees;
		localDeviceCoordinatesInput.placeholder = '-33.885553, 151.211138'; // MM Sydney office
		localDeviceCoordinatesInput.optional = true;

		let remoteDeviceCoordinatesInput = s.option(this.CoordinatesInput, 'remoteDeviceCoordinates', _('Remote device coordinates'), _('Optional: Must be provided in Decimal Degrees (DD) format, used by Google Maps'));
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

		return m;
	},

	MapViewButton: form.DummyValue.extend({
		renderMapViewModal: function (cfgvalue) {
			ui.showModal(_('Map View'), [
				E('div', { id: 'map', style: 'height: 400px; width: 100%; margin: 1rem;' }),
				E('div', { class: 'right' }, [
					E('button', {
						class: 'cbi-button',
						click: ui.hideModal,
					}, _('Dismiss')),
				]),
			]);

			const dutIcon = Leaflet.icon({
				iconUrl: L.resource('custom-elements/halowlink1.svg'),
				iconSize: [66, 66],
				iconAnchor: [33, 64],
				tooltipAnchor: [0, -20],
				popupAnchor: [0, -66],
			});

			// Initialize the map after the modal is rendered
			setTimeout(() => {
				const map = Leaflet.map('map');
				const geoJsonData = JSON.parse(cfgvalue);

				Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
					attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
				}).addTo(map);

				let remoteDeviceFeatureLayer;
				Leaflet.geoJSON(geoJsonData, {
					onEachFeature: (feature, layer) => {
						layer.bindPopup(feature.properties.name);
						layer.setIcon(dutIcon);

						if (feature.properties.name === 'Remote Device') {
							remoteDeviceFeatureLayer = layer;
						}
					},
				}).addTo(map);

				if (remoteDeviceFeatureLayer) {
					remoteDeviceFeatureLayer.openPopup();
				}

				// Set the map view to fit the bounds of the geoJSON data
				const bounds = Leaflet.geoJSON(geoJsonData).getBounds();
				map.fitBounds(bounds, { padding: [20, 20] });

				const coordinates = geoJsonData.map(feature => feature.geometry.coordinates.reverse());
				Leaflet.polyline(coordinates, { color: '#571c76' }).addTo(map);
			}, 0);
		},

		renderWidget: function (sectionId, optionIndex, cfgvalue) {
			if (!cfgvalue) return E('em', {}, _('unknown'));

			let mapViewButton = E('button', {
				class: 'cbi-button cbi-button-action',
				click: Leaflet ? ui.createHandlerFn(this, this.renderMapViewModal, cfgvalue) : null,
			}, `Map View${Leaflet ? '' : _(' (offline)')}`);
			mapViewButton.disabled = !Leaflet;
			return E(
				'div',
				{
					'style': 'display: flex; align-items: center; gap: 1em;',
					'data-tooltip': Leaflet ? null : _('The map feature is currently unavailable. This may be due to a lack of internet connectivity or the required resources not being loaded. Please check your connection and try again.'),
				}, mapViewButton);
		},
	}),

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

		o = s.option(form.ListValue, 'length', _('Test Length'), _('Longer tests may yield more accurate results'));
		o.value(10, _('Short (10 seconds per subtest)'));
		o.value(20, _('Medium (20 seconds per subtest)'));
		o.value(30, _('Long (30 seconds per subtest)'));
		o.rmempty = false;
		o.optional = false;

		const updateOmitTime = () => {
			// ListValue option values get automatically converted to strings, convert them back.
			this.rangetestConfiguration.advanced.length = parseInt(this.rangetestConfiguration.advanced.length);
			switch (this.rangetestConfiguration.advanced.length) {
				case 10:
					this.rangetestConfiguration.advanced.omit = 2;
					break;
				case 20:
					this.rangetestConfiguration.advanced.omit = 5;
					break;
				case 30:
					this.rangetestConfiguration.advanced.omit = 10;
					break;
			}
		};

		const save = async () => {
			await m.save(updateOmitTime);
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

		o = s.option(form.DummyValue, 'status', _('Status'));
		o.datatype = 'string';
		o.readonly = true;

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

		o = s.option(this.MapViewButton, 'locationGeoJson', _('Location'));
		o.editable = true;

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

		o = s.option(form.DummyValue, 'bandwidth', _('Bandwidth (MHz)'));
		o.datatype = 'uinteger';
		o.readonly = true;

		o = s.option(form.DummyValue, 'channel', _('Channel'));
		o.datatype = 'uinteger';
		o.readonly = true;

		o = s.option(form.DummyValue, 'signalStrength', _('Signal Strength (dBm)'));
		o.datatype = 'integer';
		o.readonly = true;

		const downloadButton = s.option(form.DummyValue, 'export', _('Raw Data (JSON)'));
		downloadButton.editable = true;
		downloadButton.renderWidget = function (sectionId, _optionIndex, _cfgvalue) {
			if (this.map.data.data[sectionId].id === inProgressTestId) {
				return E('em', { class: 'spinning' });
			} else {
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
			}
		};

		return m;
	},

	async render([localTests, localRangetestInfo]) {
		localRangetestVersion = localRangetestInfo?.rangetest_api_version;

		this.basicTestConfigurationForm = this.basicTestConfigurationForm();
		this.resultsSummaryTable = this.resultsSummaryTable();

		// If the Leaflet library loads late, update the map view buttons
		document.addEventListener('leafletLoaded', () => this.resultsSummaryTable.render(), { once: true });

		this.titleSection = E('section', { class: 'cbi-section' }, [
			E('h2', { style: 'display: flex; align-items: center; justify-content: space-between; width: 100%;' }, [
				E('span', {}, _('Range Test')),
				E('span', { style: 'flex-grow: 1;' }, ''),
				localRangetestVersion ? E('span', { style: 'font-weight: normal; font-size: 1rem;' }, `v${localRangetestVersion}`) : '',
			]),
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
		this.configurationSection = E('section', { class: 'cbi-section', style: 'overflow: visible;' }, [
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
		]);
		this.userMessageContainer = E('div', { id: 'user-message-container' });
		this.resultsSummarySection = E('section', { class: 'cbi-section' }, [
			E('h3', {}, _('Results Summary')),
			await this.resultsSummaryTable.render(),
			E('div', { class: 'cbi-section-create cbi-tblsection-create' }, [
				E('button', { class: 'cbi-button cbi-button-action', click: ui.createHandlerFn(this, async () => {
					const filenameDatetimeString = formatFilenameDatetime(new Date());
					const allTests = await getLocalTests();
					if (allTests.length === 0) {
						displayMessageToUser(MESSAGE_TYPES.INFO, _('No Test Data Available'), 'No test data available to export.', { modal: true });
						return;
					}

					exportResultsSummaryAsCSVFile(allTests, `rangetest_all_data_${filenameDatetimeString}`);
				}) }, [_('Download Results Summary (CSV)')]),
				E('button', { class: 'cbi-button cbi-button-negative', click: ui.createHandlerFn(this, async () => {
					const allTests = await getLocalTests();
					if (allTests.length === 0) {
						displayMessageToUser(MESSAGE_TYPES.INFO, _('No Test Data Available'), 'No test data available to delete.', { modal: true });
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
			this.userMessageContainer,
			this.resultsSummarySection,
		];

		localTests.forEach(test => this.updateResultsSummaryRow(test));
		this.configurationSection.querySelector('#discover-button').click();
		return res;
	},
});
