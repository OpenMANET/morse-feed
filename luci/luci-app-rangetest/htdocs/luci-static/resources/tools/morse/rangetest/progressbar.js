`use strict`;

/* globals baseclass */
'require baseclass';

var ProgressBar = baseclass.extend({
	__init__: function (progressBarContainer, progressBarElement) {
		this.progressBarElement = progressBarElement;
		this.progressBarContainer = progressBarContainer;
		this.percentage = 0;
		this.text = '';
	},

	__update() {
		this.progressBarElement.style.width = `${this.percentage}%`;
		this.progressBarContainer.title = `${this.text}  (${this.percentage}%)`;
	},

	show() {
		this.progressBarContainer.style.visibility = 'unset';
	},

	hide() {
		this.progressBarContainer.style.visibility = 'hidden';
	},

	increment(percent) {
		if (this.percentage + percent > 100) {
			console.warn('Progress bar incremented past 100%');
			return;
		}
		this.percentage += percent;
		this.__update();
	},

	reset(newText) {
		this.percentage = 0;
		this.text = newText;
		this.__update();
	},

	complete(newText) {
		this.percentage = 100;
		this.text = newText;
		this.__update();
	},

	set text(newText) {
		this.__update();
	},
});

var ProgressBarFactory = baseclass.extend({
	new: (progressBarContainer, progressBarElement) => new ProgressBar(progressBarContainer, progressBarElement),
});

return ProgressBarFactory;
