'use strict';
/* globals view */
'require view';

// WARNING: Every time the offline user guide is updated, this link must be updated as well.
const S3_BUCKET_USER_GUIDE_URL = 'https://repo.apps.morsemicro.com/openwrt/resources/UG+MM6108_MM8108+Eval+Kit+User+Guide+2.9+-+v25.pdf';

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	render: function () {
		var body = E('section', { class: 'cbi-section' }, [
			E('p', {}, 'Due to system constraints, only the online version of the user guide is available for this device.'),
			E('p', {}, [
				'You can view the ',
				E('a', { href: S3_BUCKET_USER_GUIDE_URL, target: '_blank' }, 'online user guide'),
				' in a new tab (requires an internet connection).',
			]),
		]);

		return body;
	},
});
