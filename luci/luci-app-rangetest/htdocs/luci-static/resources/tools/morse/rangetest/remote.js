'use strict';

/* globals baseclass rpc errorUtils */
'require baseclass';
'require rpc';
'require tools.morse.rangetest.errorutils as errorUtils';

var remoteRequest = rpc.declare({
	object: 'rangetest',
	method: 'remote_device_call',
	params: ['target', 'rpc_id', 'session_id', 'method', 'args'],
	nobatch: true,
});

var remoteLogin = rpc.declare({
	object: 'rangetest',
	method: 'remote_device_login',
	params: ['target', 'password'],
	nobatch: true,
});

var RemoteRpcClass = rpc.constructor.extend({
	remoteRpcRequestId: 1,
	remoteRpcBaseUrl: null,
	remoteRpcSessionId: '00000000000000000000000000000000',

	expires: 0,
	message: {
		jsonrpc: '2.0',
		id: 0,
		method: 'call',
		params: [
			'00000000000000000000000000000000',
			'session',
			'login',
			{
				username: 'root',
				password: '',
			},
		],
	},

	__currentTime: () => Math.floor(Date.now() / 1000),

	__login: function () {
		return remoteLogin(this.remoteRpcIpAddress, this.message.params[3].password);
	},

	__checkLogin: function () {
		if (this.__currentTime() > this.expires) {
			return this.__login()
				.then((response) => {
					const result = this.__parseCallReply(response, true);
					this.remoteRpcSessionId = result.ubus_rpc_session;
					this.expires = this.__currentTime() + result.expires;
				});
		}
		return Promise.resolve();
	},

	__call: async function (method, params, requiresLogin = true) {
		if (requiresLogin) {
			await this.__checkLogin();
		}

		const rpcResponse = await remoteRequest(this.remoteRpcIpAddress, 0, this.remoteRpcSessionId, method, params);
		return this.__parseCallReply(rpcResponse);
	},

	__parseCallReply: function (response, isAuthCheck = false) {
		// Internal error: if response is a single number it means that
		// it produced a failure on the internal ubus dispatching object.
		// Fails on bad URLs, bad endpoints
		if (Number.isInteger(response)) {
			const message = rpc.getStatusText(response) || 'Unknown';

			if (isAuthCheck) {
				throw new Error(`Unable to reach ${this.remoteRpcBaseUrl}, please ensure the device is reachable on the network.`, { cause: 'offline' });
			} else {
				throw new Error(`Request to ${this.remoteRpcBaseUrl} failed with: ${message} (${response})`);
			}
		}

		// RPC error
		if (response.error || !response.result) {
			const returnCode = response.error.code || 'Unknown';
			const message = response.error.message || 'Unknown';
			throw new Error(`Request to ${this.remoteRpcBaseUrl} failed with: ${message} (${returnCode})`);
		}

		// UBUS error
		if (response.result && Array.isArray(response.result) && response.result.length === 1) {
			const returnCode = response.result[0];
			// Certain commands use the 'Command OK' (0) status code
			if (returnCode === 0) {
				return response.result[0];
			} else if (isAuthCheck && returnCode === 6) {
				throw new Error(`Login attempt to ${this.remoteRpcBaseUrl} failed, please try again with a different password.`, { cause: 'auth' });
			} else {
				throw new Error(`Request to ${this.remoteRpcBaseUrl} failed with UBUS code: ${returnCode}`);
			}
		}

		return errorUtils.catchRangetestErrors(response.result[1]);
	},

	backgroundIperf3Server: async function () {
		return this.__call('background_iperf3_server', {});
	},

	getBackground: async function (id) {
		return this.__call('get_background', { id: id });
	},

	terminateBackground: async function (id) {
		return this.__call('terminate_background', { id: id });
	},

	iwStationDump: async function () {
		return this.__call('iw_station_dump', {});
	},

	morseCliStatsReset: async function () {
		return this.__call('morse_cli_stats_reset', {});
	},

	morseCliStats: async function () {
		return this.__call('morse_cli_stats', {});
	},

	ipLink: async function () {
		return this.__call('ip_link', {});
	},

	info: async function () {
		return this.__call('info', {}, false);
	},

	/**
	 * Returns the current RPC session id.
	 *
	 * @returns {string}
	 * Returns the 32 byte session ID string used for authenticating remote
	 * requests.
	 */
	getSessionID: function () {
		return this.remoteRpcSessionId;
	},

	/**
	 * Set the RPC session id to use.
	 *
	 * @param {string} sid
	 * Sets the 32 byte session ID string used for authenticating remote
	 * requests.
	 */
	setSessionID: function (sid) {
		this.remoteRpcSessionId = sid;
	},

	/**
	 * Returns the current IP address.
	 *
	 * @returns {string}
	 * Returns the IP address of the remote device.
	 */
	getIpAddress: function () {
		return this.remoteRpcIpAddress;
	},

	/**
	 * Set the IP address to use.
	 *
	 * @param {string} ipAddress
	 * Sets the IP address of the remote device.
	 */
	setIpAddress: function (ipAddress) {
		this.remoteRpcIpAddress = ipAddress;
	},

	/**
	 * Returns the current RPC base URL.
	 *
	 * @returns {string}
	 * Returns the RPC URL endpoint to issue requests against.
	 */
	getBaseURL: function () {
		return this.remoteRpcBaseUrl;
	},

	/**
	 * Set the RPC base URL to use.
	 *
	 * @param {string} sid
	 * Sets the RPC URL endpoint to issue requests against.
	 */
	setBaseURL: function (url) {
		this.remoteRpcBaseUrl = url;
	},

	/**
	 * Set the RPC password to use.
	 *
	 * @param {string} password
	 * Sets the plaintext password to use for session auth, only setting
	 * it if it isn't empty.
	 */
	setPassword: function (password) {
		if (password) {
			this.message.params[3].password = password;
		}
	},
});

var RemoteDeviceFactory = baseclass.extend({
	load: (url, password) => {
		var remoteRpc = new RemoteRpcClass();
		remoteRpc.setIpAddress(url);
		remoteRpc.setBaseURL('http://' + url + '/ubus/');
		remoteRpc.setPassword(password);
		return remoteRpc;
	},
});

return RemoteDeviceFactory;
