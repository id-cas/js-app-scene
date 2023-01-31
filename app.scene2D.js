(function () {

	'use strict';

	var modules = KalkPro.modules;
	var PREV_DRAWING = '__prev';
	var NEXT_DRAWING = '__next';

	/**
	 * @param {MainController|CalculatorApp} scope
	 * */
	function CalcScene2D (scope) {
		this.scope = scope;

		// актуальные чертежи
		this.data = [];
		this.names = {};

		this.currentDrawing = null;

		// DOM-элементы чертжей
		this.scenes = Object.create(null);

		this.images = {};

		this.flipCanvas = null;
		this.exportCanvas = null;

		this.nodes = this.scope.nodes.scene2D = {
			templateFigures: '#js--template-drawingsFigures',
			wrapperFigures: '#js--wrapper-drawingsFigures',
			drawingSelect: '#js--drawingSelectInterface',
			drawingSelectWrapper: '#js--drawingSelectWrapper'
		};

		// Выставляем дефолтные чертежи
		if (!isSet(this.scope.settings['defaultScene2D'])) {
			// Если дефолтных чертежей не нашлось, значит они В РАЗРАБОТКЕ (покажем заглушку)

			var lang = (typeof window.KalkPro !== 'undefined') ? window.KalkPro.globals.lang.code : 'ru';
			this.scope.settings['defaultScene2D'] = [
				{
					w: 1040,
					h: 737,
					a: 'drwStairsUnderDevelopmentAlt',
					t: 'drwStairsUnderDevelopmentTitle',
					src: '/public/calculator/static-drawings/under-development/' + lang + 'DummyDrawing.png',
					name: 'sideView'
				}
			];
		}

		// Устновим чертеж(-и)
		this.prepareData(this.scope.settings['defaultScene2D']);

		// Повесим обработку событий
		this.externalEventsHandler();
	}

	/**
	 * Обаботка внешних событий
	 */
	CalcScene2D.prototype.externalEventsHandler = function () {

		// Обработаем глобальное событие из модуля CalcView об Успешном заврешении расчета
		document.addEventListener("calcViewEvent", function(event) {
			if(typeof event.detail.state !== 'undefined'){
				if(event.detail.state === 'onSuccess'){

					// Отобразим блок вывода информации о платной подписке для Скрытых чертежей и размеров
					// Если у полльзователя нет соответсвующей подписки - покажем ему сообщение
					var drawingPaidAccess = $('#js--drawingPaidAccess');
					if(drawingPaidAccess.length) drawingPaidAccess.show();

				}
			}
		});
	}

	/**
	 * */
	CalcScene2D.prototype.pre = function () {
		var self = this;

		$('.js--onclick-prevDrawing, .js--onclick-nextDrawing').show();

		$(document)
			.on('click', '.js--onclick-prevDrawing', function (event) {
				event.preventDefault();
				self.changeDrawing(PREV_DRAWING);
			})
			.on('click', '.js--onclick-nextDrawing', function (event) {
				event.preventDefault();
				self.changeDrawing(NEXT_DRAWING);
			})
		;
	};

	/**
	 * Старт модуля.
	 *
	 * @return void
	 * */
	CalcScene2D.prototype.start = function () {
		var self = this;

		self.refresh();
	};

	/**
	 * @param {Object|Array} data
	 * */
	CalcScene2D.prototype.prepareData = function (data) {
		let self = this;

		self.data = [];

		if (isSet(data.length)) {
			for (let i = 0; i < data.length; i++) {
				self.data.push({
					alt: getLabel('calcmedia.'+ data[i]['a'], null, true),
					name: data[i].name,
					title: getLabel('calcmedia.'+ data[i]['t'], null, true),
					src: data[i]['src'],
					width: data[i]['w'],
					height: data[i]['h'],
					isActive: (i === 0),
					isPortrait: data[i]['w'] < data[i]['h'],
					isCovered: false
				});
				self.names[data[i].name] = i;
			}
		}
		else {
			let i = 0;

			for (let sSceneName in data) {
				if (data.hasOwnProperty(sSceneName)) {
					self.data.push({
						alt: getLabel('calcmedia.'+ data[sSceneName]['a']),
						name: sSceneName,
						title: getLabel('calcmedia.'+ data[sSceneName]['t']),
						src: data[sSceneName]['b64'],
						width: data[sSceneName]['w'],
						height: data[sSceneName]['h'],
						isActive: (i === 0),
						isPortrait: data[sSceneName]['w'] < data[sSceneName]['h'],
						isCovered: User.hasService('disable_blur') ? false : !!data[sSceneName]['b'],
						discoveryPrice: this.scope['services'] && this.scope['services'].getDiscoveryPrice()
					});
					self.names[sSceneName] = i;
					i++;
				}
			}
		}

		for (let i = 0; i < self.data.length; i++) {
			let oDrawing = self.data[i];

			if (!isSet(self.images[oDrawing.name])) {
				self.images[oDrawing.name] = new Image();
			}

			self.images[oDrawing.name].src = oDrawing.src;
			self.images[oDrawing.name].width = oDrawing.width;
			self.images[oDrawing.name].height = oDrawing.height;
		}

	};

	/**
	 * @param {boolean} withoutReference
	 * @return {Array}
	 * */
	CalcScene2D.prototype.getData = function (withoutReference) {
		if (withoutReference) {
			var data = JSON.parse(JSON.stringify(this.data));

			for (var i = 0; i < data.length; i++) {
				if (!this.isB64(data[i].src)) {
					data[i] = this.toB64(data[i]);
				}
			}
			return data;
		}
		else {
			return this.data;
		}

	};

	CalcScene2D.prototype.nolmalizePortraits = function (aDrawings) {
		for (var i = 0; i < aDrawings.length; i++) {
			if (aDrawings[i].height > aDrawings[i].width) {
				aDrawings[i] = this.flipPortrait(aDrawings[i]);
			}
		}
		return aDrawings;
	};

	/**
	 * @param {String} input
	 * @return {Boolean}
	 * */
	CalcScene2D.prototype.isB64 = function (input) {
		return /^data:|base64/.test(input);
	};

	/**
	 * @param {Object} oDrawing
	 * @return {Object}
	 * */
	CalcScene2D.prototype.toB64 = function (oDrawing) {
		var self = this;

		if (!nodeExists(self.exportCanvas)) {
			self.exportCanvas = document.createElement('canvas');
		}

		self.exportCanvas.setAttribute('width', oDrawing.width +'px');
		self.exportCanvas.setAttribute('height', oDrawing.height +'px');

		var oImage = self.images[oDrawing.name];
		var oContext = self.exportCanvas.getContext('2d');

		oContext.drawImage(oImage, 0, 0);
		oDrawing.src = self.exportCanvas.toDataURL('image/png');

		return oDrawing;
	};

	/**
	 * @param {Object} oDrawing
	 * @return {Object}
	 * */
	CalcScene2D.prototype.flipPortrait = function (oDrawing) {
		var self = this;

		if (!nodeExists(self.flipCanvas)) {
			self.flipCanvas = document.createElement('canvas');
		}

		var oImage = self.images[oDrawing.name];

		self.flipCanvas.setAttribute('width', oDrawing.height +'px');
		self.flipCanvas.setAttribute('height', oDrawing.width +'px');

		var oContext = self.flipCanvas.getContext('2d');

		oContext.rotate(1.5 * Math.PI);
		oContext.translate(-oDrawing.width, 0);

		oContext.drawImage(oImage, 0, 0);

		oDrawing.src = self.flipCanvas.toDataURL('image/png');
		oContext.clearRect(0, 0, self.flipCanvas.width, self.flipCanvas.height);

		return oDrawing;
	};

	/**
	 * Обновление чертежей.
	 *
	 * @return void
	 * */
	CalcScene2D.prototype.refresh = function () {
		var self = this;
		var data = { drawings: self.data };



		var selectItems = [];

		for (var i = 0; i < data.drawings.length; i++) {
			selectItems.push({ value: data.drawings[i].name, title: data.drawings[i].title });
		}

		if (!isSet(self.drawingSelect)) {
			self.initSelect(selectItems);
		}
		else {
			self.drawingSelect.refresh(selectItems);
		}

		this.nodes.wrapperFigures.html(Mustache.render(this.nodes.templateFigures.html(), data));
	};

	/**
	 * @param {Array} selectItems
	 * @return void
	 * */
	CalcScene2D.prototype.initSelect = function (selectItems) {
		var self = this;

		this.nodes.drawingSelect.empty();

		self.drawingSelect = new CustomSelect({
			wrapper: this.nodes.drawingSelect,
			value: selectItems[0] ? selectItems[0].value : '',
			name: 'js--drawingSelect',
			items: selectItems,
			mods: { root: ['medium'] }
		});
		self.drawingSelect.change(function (data) {
			self.changeDrawing(data.value);
		});
	};

	/**
	 * @var {Object|String} drawing
	 * @return void
	 * */
	CalcScene2D.prototype.changeDrawing = function (drawing) {
		var self = this;

		if (drawing === PREV_DRAWING) {
			drawing = self.currentDrawing-1;
		}

		if (drawing === NEXT_DRAWING) {
			drawing = self.currentDrawing+1;
		}

		if ('string' === typeof drawing) {
			drawing = self.names[drawing];
		}

		if ('number' === typeof drawing) {
			if (drawing < 0) {
				drawing = self.data.length-1;
			}

			if (isSet(self.data[drawing])) {
				drawing = self.data[drawing];
			} else {
				drawing = self.data[0];
			}
		}

		if (!isSet(drawing) || !isSet(drawing.src) || !isSet(drawing.width) || !isSet(drawing.height)) {
			return;
		}

		self.currentDrawing = self.names[drawing.name];
		self.drawingSelect.setValue(drawing.name);

		$('#js--drawing-'+ drawing.name).activate(null, true);
	};

	modules.Scene2D = CalcScene2D;
})();