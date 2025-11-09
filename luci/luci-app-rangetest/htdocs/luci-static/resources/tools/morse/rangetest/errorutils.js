`use strict`;

/* globals baseclass rpc */
'require baseclass';
'require rpc';

/**
 * A filterFn for RPC calls that checks for range test errors
 * where the response is a JSON object with an 'error' top-level
 * key.
 *
 * An object representing an error may also contain a 'details'
 * nested object which is captured in the developer console.
 */
function catchRangetestErrors(data, _args = null, _extraArgs = null) {
	if (data && data.error) {
		// Translate integer error codes to human-readable messages
		if (Number.isInteger(Number(data.error))) {
			data.error = rpc.getStatusText(data.error);
		}

		console.error(data);
		throw new Error(data.message || data.error, { cause: 'rangetest' });
	}
	return data;
}

return baseclass.extend({
	catchRangetestErrors,
});
