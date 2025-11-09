'use strict';
/* globals view ui */
'require view';
'require ui';

// WARNING: Every time the offline user guide is updated, this link must be updated as well.
const S3_BUCKET_USER_GUIDE_URL = 'https://repo.apps.morsemicro.com/openwrt/resources/HaLowLink+1+-+User+Guide+-+2.7.6.pdf';
const OFFLINE_USER_GUIDE_URL = '/halowlink1-userguide-2.7.6.pdf';

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	render: function () {
		var body = E([]);

		var offlineBanner = ui.addNotification(null, [
			'The offline user guide is compressed and some images may appear blurry.',
			' Open this',
			E('a', { href: OFFLINE_USER_GUIDE_URL, target: '_blank' }, ' offline guide'),
			' in a new tab or view the uncompressed ',
			E('a', { href: S3_BUCKET_USER_GUIDE_URL, target: '_blank' }, 'online guide'),
			' (requires internet connection).',
		], 'warning');
		offlineBanner.style.zIndex = 100;

		var ifrm = document.createElement('iframe');
		ifrm.setAttribute('src', OFFLINE_USER_GUIDE_URL);
		ifrm.style.overflow = 'hidden';
		ifrm.style.margin = '0px';
		ifrm.style.padding = '0px';
		ifrm.style.height = '100%';
		ifrm.style.width = '100%';
		ifrm.style.position = 'absolute';
		ifrm.style.top = '0px';
		ifrm.style.left = '0px';
		ifrm.style.right = '0px';
		ifrm.style.bottom = '0px';
		ifrm.height = '100%';
		ifrm.width = '100%';
		body.appendChild(ifrm);
		return body;
	},
});
