'use strict';
/* globals fs rpc ui view */
'require view';
'require rpc';
'require ui';
'require fs';

// this is a standard list propagated around LuCI to poll the device
// after an action which would have lost connection. Used by the handleSysupgrade
// 10.42.0.1/192.168.12.1 added by morse to attempt to reach out to our default configuration
const hrefs = [window.location.host, '10.42.0.1', '192.168.12.1', '192.168.1.1', 'openwrt.lan'];

var callUpgradeQuery = rpc.declare({
	object: 'morseupgrade',
	method: 'query',
	params: [],
});

var callUpgradeSearch = rpc.declare({
	object: 'morseupgrade',
	method: 'search',
	params: [],
});

var callUpgradeStat = rpc.declare({
	object: 'morseupgrade',
	method: 'stat',
	params: [],
});

var callUpgradeDownload = rpc.declare({
	object: 'morseupgrade',
	method: 'download',
	params: ['name', 'sum'],
});

var callUpgradeVerify = rpc.declare({
	object: 'morseupgrade',
	method: 'verify',
	params: ['sum'],
});

var callSystemValidateFirmwareImage = rpc.declare({
	object: 'system',
	method: 'validate_firmware_image',
	params: ['path'],
	expect: { '': { valid: false, forcable: true } },
});

var callFileStat = rpc.declare({
	object: 'file',
	method: 'stat',
	params: ['path'],
});

document.querySelector('head').appendChild(E('link', {
	rel: 'stylesheet',
	type: 'text/css',
	href: L.resourceCacheBusted('view/morse/css/upgrade.css'),
}));

/*
 * LuCI  doesn't expose this through any library, so I've copied it verbatim from
 * flash.js
 */
function findStorageSize(procmtd, procpart) {
	var kernsize = 0, rootsize = 0, wholesize = 0;

	procmtd.split(/\n/).forEach(function (ln) {
		var match = ln.match(/^mtd\d+: ([0-9a-f]+) [0-9a-f]+ "(.+)"$/),
		    size = match ? parseInt(match[1], 16) : 0;

		switch (match ? match[2] : '') {
			case 'linux':
			case 'firmware':
				if (size > wholesize)
					wholesize = size;
				break;

			case 'kernel':
			case 'kernel0':
				kernsize = size;
				break;

			case 'rootfs':
			case 'rootfs0':
			case 'ubi':
			case 'ubi0':
				rootsize = size;
				break;
		}
	});

	if (wholesize > 0)
		return wholesize;
	else if (kernsize > 0 && rootsize > kernsize)
		return kernsize + rootsize;

	procpart.split(/\n/).forEach(function (ln) {
		var match = ln.match(/^\s*\d+\s+\d+\s+(\d+)\s+(\S+)$/);
		if (match) {
			var size = parseInt(match[1], 10);

			if (!match[2].match(/\d/) && size > 2048 && wholesize == 0)
				wholesize = size * 1024;
		}
	});

	return wholesize;
}

const states = {
	LOADING: 'loading',
	DOWNLOADING: 'downloading',
	UPGRADEREADY: 'upgrade-ready',
	DOWNLOADREADY: 'download-ready',
	ERROR: 'error',
	UPDATED: 'updated',
};

const ubusStatus = {
	ArgumentError: 'ArgumentError',
	BoardNotFoundError: 'BoardNotFoundError',
	DownloadError: 'DownloadError',
	HTTPError: 'HTTPError',
	SHAMismatchError: 'SHAMismatchError',
	UpdateImageNotFoundError: 'UpdateImageNotFoundError',
	DownloadStartedOK: 'DownloadStartedOK',
	DownloadInProgressOK: 'DownloadInProgressOK',
	DownloadFinishOK: 'DownloadFinishOK',
	NoUpdateNeededOK: 'NoUpdateNeededOK',
	ReadyForDownloadOK: 'ReadyForDownloadOK',
	UpdateImageFoundOK: 'UpdateImageFoundOK',
	VerifyOK: 'VerifyOK',
};

// just providing some default messages for the status codes coming from ubus.
// An alternative string may be used throughout the UI to provide more context.
// For errors, these are provided as additional context to the backend error message.
const defaultMessages = {
	ArgumentError: _('This is an internal error and may be due to configuration modifications. Please reset your device to factory defaults and try again or upgrade manually. If the problem persists, consider contacting Morse Micro support.'),
	BoardNotFoundError: _('This may happen if the device is not recognized by the server. Please verify that your device is supported and try again.'),
	DownloadError: _('Firmware failures can occur when there your device has intermittent internet connection or the upgrade server is experiencing failures. Please ensure that your Morse Micro device is connected to stable internet and try again.'),
	HTTPError: _('This could be due to a network issue or server unavailability. Please check your internet connection and/or try again later.'),
	SHAMismatchError: _('sha256sum does not match'),
	UpdateImageNotFoundError: _('No image found'),
	DownloadStartedOK: _('Download started'),
	DownloadInProgressOK: _('Previous download in progress'),
	DownloadFinishOK: _('Download completed successfully'),
	NoUpdateNeededOK: _('Already up to date'),
	ReadyForDownloadOK: _('Waiting for download'),
	UpdateImageFoundOK: _('File available on MorseMicro image server'),
	VerifyOK: _('SHA256 OK'),
};

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	handleManualUpload: function (storage_size, has_rootfs_data, ev) {
		return ui.uploadFile('/tmp/sysupgrade.bin', ev.target.firstChild)
			.then(L.bind(this.handleSysupgrade, this, storage_size, has_rootfs_data));
	},

	handleSysupgradeAuto: function (storage_size, has_rootfs_data) {
		return callFileStat('/tmp/sysupgrade.bin')
			.then((res) => {
				res['sha256sum'] = this.search.sum;
				return res;
			}).then(L.bind(this.handleSysupgrade, this, storage_size, has_rootfs_data));
	},

	// this, and handleSysupgradeConfirm are practically a direct copy paste from the flash.js.
	//  some massaging was required to replace the ui.uploadFile which started this function.
	handleSysupgrade: function (storage_size, has_rootfs_data, file_stat) {
		ui.showModal(_('Checking image…'), [
			E('span', { class: 'spinning' }, _('Verifying the uploaded image file.')),
		]);

		return callSystemValidateFirmwareImage('/tmp/sysupgrade.bin')
			.then(function (res) { return [file_stat, res]; })
			.then((reply) => {
				return fs.exec('/sbin/sysupgrade', ['--test', '/tmp/sysupgrade.bin'])
					.then(function (res) {
						reply.push(res);
						return reply;
					});
			})
			.then((res) => {
				/* sysupgrade opts table  [0]:checkbox element [1]:check condition [2]:args to pass */
				var opts = {
				    keep: [E('input', { type: 'checkbox' }), false, '-n'],
				    force: [E('input', { type: 'checkbox' }), true, '--force'],
				    skip_orig: [E('input', { type: 'checkbox' }), true, '-u'],
				    backup_pkgs: [E('input', { type: 'checkbox' }), true, '-k'],
				    },
				    is_valid = res[1].valid,
				    is_forceable = res[1].forceable,
				    allow_backup = res[1].allow_backup,
				    is_too_big = (storage_size > 0 && res[0].size > storage_size),
				    body = [];

				body.push(E('p', _('The flash image was uploaded. Below is the checksum and file size listed, compare them with the original file to ensure data integrity. <br /> Click \'Continue\' below to start the flash procedure.')));
				body.push(E('ul', {}, [
					res[0].size ? E('li', {}, '%s: %1024.2mB'.format(_('Size'), res[0].size)) : '',
					res[0].sha256sum ? E('li', {}, '%s: %s'.format(_('SHA256'), res[0].sha256sum)) : '',
				]));

				body.push(E('p', {}, E('label', { class: 'btn' }, [
					opts.keep[0], ' ', _('Keep settings and retain the current configuration'),
				])));

				if (!is_valid || is_too_big)
					body.push(E('hr'));

				if (is_too_big)
					body.push(E('p', { class: 'alert-message' }, [
						_('It appears that you are trying to flash an image that does not fit into the flash memory, please verify the image file!'),
					]));

				var error_detail = E('p', { class: 'alert-message' }, [
					E('br'),
					_('Error details:'),
					E('br'),
					E('pre', res[2].stderr),
				]);

				if (!is_valid)
					body.push(E('p', { class: 'alert-message' }, [
						E('b', _('The uploaded image file does not contain a supported format. If you are using EKH01 make sure that you HAVEN\'T decompressed the image before uploading.')),
						res[2].stderr ? error_detail : '',
					]));

				if (!allow_backup) {
					if (is_valid) {
						body.push(E('p', { class: 'alert-message' }, [
							_('The uploaded firmware does not allow keeping current configuration.'),
						]));
					}
					opts.keep[0].disabled = true;
				} else {
					opts.keep[0].checked = true;

					if (has_rootfs_data) {
						body.push(E('p', {}, E('label', { class: 'btn' }, [
							opts.skip_orig[0], ' ', _('Skip from backup files that are equal to those in /rom'),
						])));
					}

					body.push(E('p', {}, E('label', { class: 'btn' }, [
						opts.backup_pkgs[0], ' ', _('Include in backup a list of current installed packages at /etc/backup/installed_packages.txt'),
					])));
				}

				var cntbtn = E('button', {
					class: 'btn cbi-button-action important',
					click: ui.createHandlerFn(this, 'handleSysupgradeConfirm', opts),
				}, [_('Continue')]);

				if (res[2].code != 0) {
					body.push(E('p', { class: 'alert-message danger' }, E('label', {}, [
						_('Image check failed.'),
						!is_valid ? ' ' : E('br'),
						!is_valid ? ' ' : E('br'),
						!is_valid ? ' ' : res[2].stderr,
					])));
				}

				if ((!is_valid || is_too_big || res[2].code != 0) && is_forceable) {
					body.push(E('p', {}, E('label', { class: 'btn alert-message danger' }, [
						opts.force[0], ' ', _('Force upgrade'),
						E('br'), E('br'),
						_('Select \'Force upgrade\' to flash the image even if the image format check fails. Use only if you are sure that the firmware is correct and meant for your device!'),
					])));
					cntbtn.disabled = true;
				}

				// this has been modified to not remove the downloaded binary. Just hides the modal.
				body.push(E('div', { class: 'right' }, [
					E('button', {
						class: 'btn',
						click: ui.hideModal,
					}, [_('Cancel')]), ' ', cntbtn,
				]));

				opts.force[0].addEventListener('change', function (ev) {
					cntbtn.disabled = !ev.target.checked;
				});

				opts.keep[0].addEventListener('change', function (ev) {
					opts.skip_orig[0].disabled = !ev.target.checked;
					opts.backup_pkgs[0].disabled = !ev.target.checked;
				});

				ui.showModal(_('Flash image?'), body);
			})
			.catch(function (e) {
				ui.addNotification(null, E('p', e.message));
			});
	},

	handleSysupgradeConfirm: function (opts) {
		ui.showModal(_('Flashing…'), [
			E('p', { class: 'spinning' }, _('The system is flashing now.<br /> DO NOT POWER OFF THE DEVICE!<br /> Wait a few minutes before you try to reconnect. It might be necessary to renew the address of your computer to reach the device again, depending on your settings.')),
		]);

		var args = [];

		for (var key in opts)
			/* if checkbox == condition add args to sysupgrade */
			if (opts[key][0].checked == opts[key][1])
				args.push(opts[key][2]);

		args.push('/tmp/sysupgrade.bin');

		/* Currently the sysupgrade rpc call will not return, hence no promise handling */
		fs.exec('/sbin/sysupgrade', args);

		if (opts['keep'][0].checked)
			ui.awaitReconnect(window.location.host);
		else
			ui.awaitReconnect(...hrefs);
	},

	// start with stat to determine initial state - dont do in load as sha256sum may take some time to calc
	// if stat shows download in progress --> show downloading progress
	// if stat shows download complete, search and verify, then show ready to upgrade. Flag in page to stop repeated stats. enable upgrade button
	// if stat shows no file, search. stop poll when done
	// ---> if up to date, show success
	// ---> if file found, enable download button
	// ---> if error, show error

	// download button restarts stat poll
	// upgrade button pops sysupgrade modal
	upgradeSearch: async function () {
		let search = await callUpgradeSearch();

		switch (search.status) {
			case ubusStatus.HTTPError:
				this.setState(states.ERROR, `${search.error}. ${defaultMessages[ubusStatus.HTTPError]} (${search.code})`);
				return null;
			case ubusStatus.UpdateImageNotFoundError:
				this.setState(states.ERROR, `${search.error}. ${defaultMessages[ubusStatus.UpdateImageNotFoundError]}`);
				return null;
			case ubusStatus.NoUpdateNeededOK:
				this.setState(states.UPDATED, defaultMessages[ubusStatus.NoUpdateNeededOK]);
				return null;
			default:
				break;
		}

		if (search.status != ubusStatus.UpdateImageFoundOK) {
			console.error(search);
			throw new Error('Something has gone horribly wrong in search');
		}

		return search;
	},

	setState: function (state, message) {
		if (!Object.values(states).includes(state))
			throw new Error(`Attempting to set unknown state: ${state}`);

		this.stateElement.classList.remove(...Object.values(states));
		this.stateElement.classList.add(state);
		this.stateElement.classList.remove('hidden');
		this.messageBox.innerHTML = message;
		this.messageBox.classList.remove('hidden');

		switch (state) {
			case states.UPGRADEREADY:
				this.sysupgradeButton.classList.remove('hidden');
				this.upgradeButton.classList.add('hidden');
				break;
			case states.DOWNLOADREADY:
				this.sysupgradeButton.classList.add('hidden');
				this.upgradeButton.classList.remove('hidden');
				break;
			default:
				this.sysupgradeButton.classList.add('hidden');
				this.upgradeButton.classList.add('hidden');
				break;
		}
	},

	pollState: async function () {
		// high speed, low impact query call to test rpcd plugin present
		// now that the rpcd plugin depends on user config, it's existence
		// should be checked. Maybe this can be done on load...
		let query = {};
		try {
			query = await callUpgradeQuery();
		} catch (e) {
			console.error(e);
			this.setState(states.ERROR, _(
				'Configuration error detected. The upgrade service could'
				+ ' not be started due to a missing or invalid system setting.'
				+ ' Please check your device configuration or perform a factory reset before re-trying.'),
			);
		}

		let stat = await callUpgradeStat();
		let rootfs_warn = '';

		switch (stat.status) {
			case ubusStatus.DownloadInProgressOK:
				this.setState(states.DOWNLOADING, _('Data received: ') + stat.bytes);
				this.stateTimeout = window.setTimeout(L.bind(this.pollState, this), 2000);
				return;
			case ubusStatus.ReadyForDownloadOK:
				this.search = await this.upgradeSearch();
				if (this.search == null)
					return;
				this.foundUpgrade = true;
				if (query.rootfs_type != this.search.filesystem)
					rootfs_warn = _('<br> New image is of format: ') + this.search.filesystem;
				this.setState(states.DOWNLOADREADY, _('New firmware version available: %s').format(this.search.version) + rootfs_warn);
				return;
			case ubusStatus.DownloadError:
				this.setState(states.ERROR, `${stat.error}. ${defaultMessages[ubusStatus.DownloadError]} (${stat.code})`);
				return;
			default:
				break;
		}

		if (stat.status != ubusStatus.DownloadFinishOK) {
			console.error(stat);
			throw new Error('Something has gone horribly wrong in stat');
		}

		if (!this.foundUpgrade) {
			this.search = await this.upgradeSearch();
			if (this.search == null)
				return;
		}

		let verify = await callUpgradeVerify(this.search.sum);
		switch (verify.status) {
			case ubusStatus.ArgumentError:
				console.error(this.search);
				throw new Error('Something has gone horribly wrong in verify');
			case ubusStatus.SHAMismatchError:
			// this one is a bit confusing. The status was designed around passing the wrong shasum into the verify
			// but we don't want to transition to an error state. We know there's an upstream file avaiable, so
			// indicate something is available.
				if (query.rootfs_type != this.search.filesystem)
					rootfs_warn = _('<br> New image is of format: ') + this.search.filesystem;
				this.setState(states.DOWNLOADREADY, _('New firmware version available: %s').format(this.search.version) + rootfs_warn);
				return;
			default:
				break;
		}

		this.setState(states.UPGRADEREADY, _('Ready to upgrade!'));
		this.sysupgradeButton.click();
		return;
	},

	start: async function () {
		this.stateTimeout = window.setTimeout(L.bind(this.pollState, this), 2000);
		this.startButton.classList.add('hidden');
		// Hide the manual button to prevent user confusion and avoid the
		// possibility of that process writing to the same file as the automatic
		// process.
		this.manualUploadButton.classList.add('hidden');
		this.setState(states.LOADING, _('Checking for upgrades'));
	},

	startDownloadAndUpgrade: async function () {
		if (!this.foundUpgrade) {
			this.setState(states.LOADING);

			this.search = await this.upgradeSearch();
			if (this.search == null)
				return;
		}

		await callUpgradeDownload(this.search.name, this.search.sum);
		this.setState(states.DOWNLOADING, '');

		this.stateTimeout = window.setTimeout(L.bind(this.pollState, this), 2000);
	},

	load: function () {
		var tasks = [
			fs.trimmed('/proc/mtd'),
			fs.trimmed('/proc/partitions'),
			fs.trimmed('/proc/mounts'),
		];

		return Promise.all(tasks);
	},

	render: function (data) {
		var procmtd = data[0],
		    procpart = data[1],
		    procmounts = data[2],
		    has_rootfs_data = (procmtd.match(/"rootfs_data"/) != null) || (procmounts.match('overlayfs:/overlay / ') != null),
		    storage_size = findStorageSize(procmtd, procpart);

		this.startButton = E('button', {
			class: 'cbi-button cbi-button-action',
			style: 'margin: auto; margin-left: 50%; transform: translateX(-50%);',
			click: ui.createHandlerFn(this, () => this.start()),
		}, [_('Check for automatic upgrade')]);

		this.upgradeButton = E('button', {
			class: 'cbi-button cbi-button-action hidden',
			style: 'margin: auto; margin-top: 40px; margin-left: 50%; transform: translateX(-50%);',
			click: ui.createHandlerFn(this, () => this.startDownloadAndUpgrade()),
		}, [_('Download and Upgrade')]);

		this.sysupgradeButton = E('button', {
			class: 'cbi-button cbi-button-action hidden',
			style: 'margin: auto; margin-top: 40px; margin-left: 50%; transform: translateX(-50%);',
			click: ui.createHandlerFn(this, () => this.handleSysupgradeAuto(storage_size, has_rootfs_data)),
		}, [_('Upgrade')]);

		this.manualUploadButton = E('button', {
			class: 'cbi-button cbi-button-action',
			style: 'margin: auto; margin-top: 40px; margin-left: 50%; transform: translateX(-50%);',
			click: L.bind(this.handleManualUpload, this, storage_size, has_rootfs_data),
		}, [_('Manually upload firmware file')]);

		this.stateElement = E('div', { class: 'upgrade-state hidden' });

		this.messageBox = E('div', { id: 'message', class: 'hidden', style: 'margin-top: 40px; text-align: center; display: block;' });

		this.foundUpgrade = false;

		return [
			E('h2', {}, _('Morse Upgrade')),
			E('p', [
				_('Additional firmware controls can be found on the '),
				E('a', { href: L.url('admin', 'system', 'flash') }, _('Backup/Flash Firmware page')),
				'.',
			]),
			this.stateElement,
			this.messageBox,
			this.startButton,
			this.upgradeButton,
			this.sysupgradeButton,
			this.manualUploadButton,
		];
	},
});
