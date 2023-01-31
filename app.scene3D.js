(function () {

	'use strict';

	var modules = KalkPro.modules;

	/**
	 * @param {MainController|CalculatorApp} scope
	 * */
	function CalcScene3D(scope) {
		var self = this;

		this.isDebug = !!globals.isDebug;

		self.scope = scope;
		self.data = {};
		self.groupsToggle = {};
		self.groups = {};
		self.supported = false;
		self.nodes = self.scope.nodes.scene3D = {
			canvas: '#js--scene3DCanvas',
			wrapperToggleObjects: '#js--wrapper-objectsToggle',
			templateToggleObjects: '#js--template-objectsToggle',
			zoomInButton: '.js--scene3DZoomIn',
			zoomOutButton: '.js--scene3DZoomOut',
			distance: '#js--distance3D'
		};


		/** Выставляем дефолтную 3D-сцену **/
		// 2019-12-25 Чугайнов А. С.
		// Синхронная AJAX реализация
		$.ajax({
			url: '/calculators/defaults/' + self.scope.settings['modelName'] + '/0/result/.json',
			dataType: 'json',
			data: '',
			async: false,
			success: function(res){
				if(res['code'] == 200 && res['status'] == 'ok'){
					// Выставляем дефолтную 3D-сцену
					self.data = JSON.parse(res.data['scene3D']['json']);

					// Выставляем дефолтный вектор-корректор
					self.c3d = res.data['c3d'];
				}
				else {
					console.warn('Warning: Default 3D model data unavailable');
				}
			},
			error: function(res){
				console.warn('Error: Default 3D model data unavailable');
			}
		});



		if (JSM.IsWebGLEnabled()) {
			self.supported = true;
		}
		else {
			self.supported = false;
			log('WebGL is not enabled.');
		}

	}

	/**
	 * @return void
	 * */
	CalcScene3D.prototype.pre = function () {
		var self = this;

		// Переключатели сцены 3д
		self.nodes.wrapperToggleObjects.on('click', 'a, button', function (event) {
			event.preventDefault();

			var $this = $(this);
			var target = $this.data('target');

			if (!target) {
				target = $this.attr('target');
			}

			target = target.replace(/#/, '');

			if (!isEmpty(target)) {
				$this.toggleBEMMod('active');
				self.switchGroup(target);
			}
		});

		// Зум 3д
		self.nodes.zoomInButton.on('click', function () {
			self.zoomIn();
		});

		// Зум 3д
		self.nodes.zoomOutButton.on('click', function () {
			self.zoomOut();
		});
	};

	/**
	 * @return void
	 * */
	CalcScene3D.prototype.start = function () {
		var self = this;

		if (isSet(self.data)) {
			self.refresh(self.data, self.c3d);
		}
	};

	/**
	 * @param {Object} data
	 * @param {Object} c3d
	 * @return {Boolean}
	 * */
	CalcScene3D.prototype.refresh = function (data, c3d) {
		if (!data || isEmpty(data) || !c3d || isEmpty(c3d)) {
			return false;
		}

		this.c3d = c3d;
		this.data = data;

		if (!nodeExists(this.nodes.canvas.get(0))) {
			log('Canvas element for Scene3D not found.');
			return false;
		}

		if(!isSet(this.canvas)){
			this.canvas = this.nodes.canvas.get(0);
		}

		if (!isSet(this.viewer)) {
			this.viewer = new JSM.ThreeViewer();

			this.viewerSettings = {
				cameraEyePosition : [0.0, 0.0, 0.0],
				cameraCenterPosition : [0.0, 0.0, 0.0],
				cameraUpVector : [0, -1, 0]
			};

			if (!this.canvas.getAttribute('width')) {
				var iCanvasWidth = data.sizes.w,
					iCanvasHeight = data.sizes.h;

				this.canvas.setAttribute('width', iCanvasWidth);
				this.canvas.setAttribute('height', iCanvasHeight);
			}

			this.viewer.Start(this.canvas, this.viewerSettings);

			// TODO: перейти на работу без аппаратного ускорения https://kovacsv.github.io/JSModeler/documentation/examples/solids.html
			// viewer = new JSM.SoftwareViewer ();
			// viewer.drawMode = 'Wireframe'; // HiddenLinePainter/Wireframe
		}
		else {
			// Очистить сцену от объектов, если сцена уже была и объекы на ней были (изменение параметров)
			if (this.viewer.MeshCount() > 0) {
				this.viewer.RemoveMeshes();
			}
		}


		/** Перейдем в контекст Three.JS **/
		if (!isSet(this.scene)) {
			this.scene = this.viewer.scene;
		}

		if (!isSet(this.threeCamera)) {
			this.threeCamera = this.viewer.camera;
		}

		if (!isSet(this.threeRaycaster)) {
			this.threeRaycaster = new THREE.Raycaster();
		}


		/** Иницализация линейки-измерителя на 3D сцене */
		this.rulerInit();


		/*** Объекты сцены (Создание 3D-объектов на основе Data из Response) ***/
		this.viewer.SetClearColor(data.background);

		var dataGroups = [], dataBody = {};

		var bodyName = '', body = {}, bodyMesh = {}, bodies = [];

		var materialIndex = 0,
			materials = new JSM.Materials();


		/** ОЧИСТИМ СЦЕНУ ОТ СТАРЫХ ОБЪЕКТОВ */
		var sceneGroupNames = Object.keys(this.groups);
		for (var i = 0; i < sceneGroupNames.length; i++) {
			this.removeGroup(this.groups[sceneGroupNames[i]]);
		}

		// Группы элементов сцены
		this.groups = [];


		/** НОВАЯ КОМПОЗИЦИЯ */
		for (var i = 0; i < data.sc.gr.length; i++) {
			dataGroups = data.sc.gr[i];	        // Отдельная группа объектов сцены

			// Выставим "галочки" отображения
			if(typeof this.groupsToggle[dataGroups.t] !== 'undefined' && this.groupsToggle[dataGroups.t] === 0){
				this.groupsToggle[dataGroups.t] = 0;    // не показывать
			}
			else {
				// Отметим активной "галочкой"
				this.groupsToggle[dataGroups.t] = 1;    // показать
			}

			// Добавим материал, который используется в объектах группы
			materials.AddMaterial(
				new JSM.Material ({
					ambient: dataGroups.mat.amb || '#00df00',
					diffuse: dataGroups.mat.dif || '#00df00',
					opacity: dataGroups.mat.op || 1,
					texture: dataGroups.mat.tx || null,
					textureWidth: dataGroups.mat.txW || 1,
					textureHeight: dataGroups.mat.txH || 1
				})
			);


			// Соберем объекты в группы
			bodies = [];
			for (var j = 0; j < dataGroups['shp'].length; j++) {
				// Одно тело из группы
				bodyName = dataGroups.t + '_' + j;
				dataBody = dataGroups['shp'][j];


				// Создадим объект из полигонов и вертексов отдельного тела группы сцены
				bodyMesh = this.getBodyMesh(
					materials,
					materialIndex,
					{
						vertices: dataBody.vertices,
						polygons: dataBody.polygons
					},
					bodyName
				);

				// Добавим в групп тело в виде сеток поверхностей
				body = {};
				body[bodyName] =  bodyMesh;
				bodies.push(body);
			}

			/**
			 * Группа форм
			 * {grp1: [{bn1: mesh1}, {bn2: mesh2}, ... {bnN: meshN}], grp2: ....}}
			 */
			this.groups[dataGroups.t] = bodies;


			// Индекс материалов по очереди создания объектов
			materialIndex++;
		}



		/** Добавим на сцену все группы объектов */
		var names = Object.keys(this.groups);
		for (var i = 0; i < names.length; i++) {
			this.addGroup3D(this.groups[names[i]], false);
		}

		/** Заданы операции твердотельной геометрии */
		if(typeof data.sc.csg !== 'undefined' && data.sc.csg.length > 0){
			// Чтобы работать проводить такие операции, геометрии всех групп тел должны быть добавлены на сцену
			// и только на следующем шаге, можно скрыть или показать ненужные элементы сцены (сцена - как буффер)

			// Последовательно выполним операции твердотельной геометрии
			var operItem = {}, oper = '', a = {}, b = {};

			for (var i = 0; i < data.sc.csg.length; i++){
				operItem = data.sc.csg[i];

				// 1. Определим участников
				oper = operItem.op;
				a = operItem.a;
				b = operItem.b;


				// 2. Возьмем группы элементов "a"
				var aObjectsTitles = [];
				var aIndexes = a.inx;

				if(aIndexes.length > 0){
					// Если перечислены индексы элементов с которыми будет проводится операция

					for (var ai = 0; ai < aIndexes.length; ai++){
						aObjectsTitles.push(a.nm + '_' + aIndexes[ai]);
					}
				}
				else{
					// Индексы не указаны явно - нужно найти все объекты группы

					var groupBodies = this.groups[a.nm];
					for (var bi = 0; bi < groupBodies.length; bi++){
						aObjectsTitles.push(Object.keys(groupBodies[bi])[0]);
					}
				}


				// 3. Возьмем группы элементов "b"
				var bObjectsTitles = [];
				var bIndexes = b.inx;

				if(bIndexes.length > 0){
					// Если перечислены индексы элементов с которыми будет проводится операция

					for (var bi = 0; bi < bIndexes.length; bi++){
						bObjectsTitles.push(b.nm + '_' + bIndexes[bi]);
					}
				}
				else{
					// Индексы не указаны явно - нужно найти все объекты группы

					var groupBodies = this.groups[b.nm];
					for (var bi = 0; bi < groupBodies.length; bi++){
						bObjectsTitles.push(Object.keys(groupBodies[bi])[0]);
					}
				}


				// 4. Проведем действия над выбранными объектами
				var aBody = null, bBody = null;
				var aBspBody = null, bBspBody = null;
				var aMesh = null, aMaterials = null;

				if(oper === 'subtract'){
					/** Вычетание **/

					for (var m = 0; m < aObjectsTitles.length; m++){
						// Найдем тело на сцене и переведем его в твердотельную геометрию

						aBody = this.scene.getObjectByName(aObjectsTitles[m]);
						aBspBody = new ThreeBSP(aBody);

						for (var n = 0; n < bObjectsTitles.length; n++){
							// Найдем тело на сцене и переведем его в твердотельную геометрию
							bBody = this.scene.getObjectByName(bObjectsTitles[n]);
							bBspBody = new ThreeBSP(bBody);

							aBspBody = aBspBody.subtract(bBspBody);
						}

						// Преобразуем результат вычисления в сетку
						aMaterials = aBody.material;
						aMesh = aBspBody.toMesh(aMaterials);
						aMesh.name = aObjectsTitles[m];

						// Удалим старый объект со сцены
						aBody.geometry.dispose();
						aBody.material.dispose();
						this.scene.remove(aBody);

						// Заменим новым элементом
						this.scene.add(aMesh);
					}

				}
				if(oper === 'union'){}
				if(oper === 'intersect'){}
			}
		}

		/** Создадим композицию сцены из элементов */
		// Группы, которые следует показать на сцене
		var groupNames = Object.keys(this.groups);

		// Отрисуем в шаблоне чек-боксы для всех элементов сцены в соответсвии с расставленными галочками
		this.refreshSwitchers(groupNames);

		// Включим отображение групп объектов сцены, которые были отмечены для отображения
		this.switchScene();



		/*** Позиционирование сцены ***/
		var boundingBox = this.viewer.GetBoundingBox();
		var lX = (boundingBox.max.x - boundingBox.min.x),
			lY = (boundingBox.max.y - boundingBox.min.y),
			lZ = (boundingBox.max.z - boundingBox.min.z);
		var cX = boundingBox.min.x + 0.5 * lX,
			cY = boundingBox.min.y + 0.5 * lY,
			cZ = boundingBox.min.z + 0.5 * lZ;

		if(!isSet(this.cameraWasSet)){

			this.cameraSettings = {
				cameraEyePosition: new JSM.CoordFromArray([2 * Math.abs(lX), - 2 * Math.abs(lY), 2 * Math.abs(lZ)]),
				cameraCenterPosition: new JSM.CoordFromArray([cX, cY, cZ]),
				cameraUpVector: new JSM.CoordFromArray([0, -1, 0])
			};

			this.viewer.SetCamera(
				// Старый вариант до 2020-01-06
				// Расположение сцены будем корректировать непосредственно в момент експорта.
				this.cameraSettings['cameraEyePosition'],
				this.cameraSettings['cameraCenterPosition'],
				this.cameraSettings['cameraUpVector']

				//// Стандартное расположение координат для компьютерной графики:
				//// вертикально расположена ось oY, остальные ортогональны к ней.
				//// Для CAD-ов вертикальное расположение принято для оси oZ (наши файлы они могут и отразить в своей программе).
				//new JSM.CoordFromArray([2 * Math.abs(lX), 2 * Math.abs(lY), 2 * Math.abs(lZ)]),     // cameraEyePosition
				//new JSM.CoordFromArray([cX, cY, cZ]),                                               // cameraCenterPosition
				//new JSM.CoordFromArray([0, 1, 0])                                                   // cameraUpVector
			);


			this.cameraWasSet = true;
		}
		else {
			// Пересчитаем ЦЕНТР камеры, чтобы после любого расчета Вращение проходило через центр сцены
			this.cameraSettings['cameraCenterPosition'] = new JSM.CoordFromArray([cX, cY, cZ]);

			this.viewer.SetCamera(
				this.cameraSettings['cameraEyePosition'],
				this.cameraSettings['cameraCenterPosition'],
				this.cameraSettings['cameraUpVector']
			);

		}



		/** Подсветка реальных осей координат **/
//		if(this.isDebug){
//			var axesHelper = new THREE.AxesHelper(2);
//			this.scene.add(axesHelper);
//		}


		//
		//this.viewer.Draw();
		//
		// 2019-02-17 "Костыль": при наличии текстуры на сцене, сцена не отображается до того как не возникнет
		// взаимодействие со сценой. Этот "костыль" эмулирует взаимодействие.
		// var self = this;
		// setTimeout(function(){self.viewer.Draw()}, 500);


		// При отрисовке сцены с текстурой лучше использовать этот метод
		// TODO: проверить нагрузку на процессор
		if(!this.drawStarted){
			this.viewer.StartDrawLoop();
			this.drawStarted = true;
		}


		return true;
	};

	/**
	 * @return void
	 * */
	CalcScene3D.prototype.zoomIn = function () {
		if (!isSet(this.viewer)) return;
		this.zoomIn(this.viewer);
	};

	/**
	 * @return void
	 * */
	CalcScene3D.prototype.zoomOut = function () {
		if (!isSet(this.viewer)) return;
		this.zoomOut(this.viewer);
	};

	/**
	 * Переключатели объектов в 3D
	 * Используется шаблон для Mustache
	 * @param {Array} groupNames
	 * @return void
	 */
	CalcScene3D.prototype.refreshSwitchers = function (groupNames) {

		var i,
			data = { items: [] };

		for (i = 0; i < groupNames.length; i++) {
			data.items.push({
				name: groupNames[i],
				title: getLabel('calcmedia.'+ groupNames[i]),
				checked: this.groupsToggle[groupNames[i]]
			});
		}

		try {
			this.nodes.wrapperToggleObjects.html(Mustache.render(this.nodes.templateToggleObjects.html(), data));
		}
		catch (e) {
			log('Mustache rendering error', e);
		}
	};

	/**
	 * Переключатели группы объектов в 3D
	 * Используется шаблон для Mustache
	 * @param {String} name
	 * @return void
	 */
	CalcScene3D.prototype.switchGroup = function (name) {
		if (!isSet(this.viewer) || !isSet(this.groups[name])) {
			return;
		}

		var groupsToggle = this.groupsToggle,
			groups = this.groups;

		if (groupsToggle[name] === 1) {
			this.hideGroup3D(groups[name]);
			groupsToggle[name] = 0;
		}
		else if (groupsToggle[name] === 0) {
			this.showGroup3D(groups[name]);
			groupsToggle[name] = 1;
		}
	};

	/**
	 * Отобразить "включенны" элементы сцены
	 */
	CalcScene3D.prototype.switchScene = function () {
		var groupsNames = Object.keys(this.groups);

		for(var i = 0; i < groupsNames.length; i++){
			if (this.groupsToggle[groupsNames[i]] === 1) {
				this.showGroup3D(this.groups[groupsNames[i]]);
			}
		}
	};

	/**
	 * @return {String}
	 */
	CalcScene3D.prototype.capture = function () {
		if (this.nodes.canvas.length) {
			this.viewer.navigation.DrawCallback();
			return this.viewer.canvas.toDataURL('image/png');
		}
		else {
			return null;
		}
	};

	/**
	 * Получение OBJ-кода сцены
	 * @return {Object}
	 * */
	CalcScene3D.prototype.getDataForOBJ = function () {
		// TODO: From example https://threejs.org/examples/#misc_exporter_gltf
		// TODO: "main/assets/js/app/three.GLTFExporter.js",


		/** Сохранение видимых частей сцены в GLTF **/
		function save( blob, filename ) {
			var link = document.createElement( 'a' );
			link.style.display = 'none';
			document.body.appendChild( link ); // Firefox workaround, see #6594

			link.href = URL.createObjectURL( blob );
			link.download = filename;
			link.click();
			URL.revokeObjectURL(link.href); // breaks Firefox...
		}

		function saveString( text, filename ) {
			save( new Blob( [ text ], { type: 'text/plain' } ), filename );
		}

		function saveArrayBuffer( buffer, filename ) {
			save( new Blob( [ buffer ], { type: 'application/octet-stream' } ), filename );
		}

		// FLIP отражение по Y
		var flipY = function(scene){
			var child = {};
			for (var i = 0; i < scene.children.length; i++){
				child = scene.children[i];

				if(typeof child.geometry !== 'undefined'){
					// transformation, set -1 to the corresponding axis
					var mS = (new THREE.Matrix4()).identity();
					// mS.elements[0] = -1;     // X - ???
					mS.elements[5] = -1;        // Y - проверено
					mS.elements[10] = -1;       // Z - ???

					child.applyMatrix(mS);

					// updates
					child.geometry.verticesNeedUpdate = true;
					child.geometry.normalsNeedUpdate = true;
					//child.geometry.computeBoundingSphere();
					//child.geometry.computeFaceNormals();
					//child.geometry.computeVertexNormals();
				}
			}
		};

		var fileTimestamp = function(){
			var date = new Date();
			var dateStr =
				date.getFullYear() + '' +
				('00' + (date.getMonth() + 1)).slice(-2) + '' +
				('00' + date.getDate()).slice(-2) + '' +
				'-' +
				('00' + date.getHours()).slice(-2) + '' +
				('00' + date.getMinutes()).slice(-2) + '' +
				('00' + date.getSeconds()).slice(-2);

			return dateStr;
		};


		var self = this;
		var fileName = 'kalk.pro-GLTF-' + fileTimestamp();

		flipY(self.scene);


		try {
			// TODO: Почему-то не работает для https://kalk-pro.ru/beams/wooden-trimmed-cylinder-beam/#BFL=4&BLN=3.6&LID=2&NLD=300&STP=100&WCL=2&WLN=20

			/** GLTF **/
			var gltfExporter = new GLTFExporter();
			var options = {
				trs: false,
				onlyVisible: true,
				truncateDrawRange: false,
				binary: true,
				forceIndices: false,
				forcePowerOfTwoTextures: false,
				maxTextureSize: 40 * 1024 * 1024 // To prevent NaN value
			};
			gltfExporter.parse(this.viewer.scene, function(result){
				if (result instanceof ArrayBuffer) {

					saveArrayBuffer(result, fileName + '.glb');

					flipY(self.scene);
					return result;

				} else {

					var output = JSON.stringify(result, null, 2);
					// console.log(output);
					saveString(output, fileName + '.gltf');

					flipY(self.scene);
					return output;

				}
			}, options);
		}
		catch (e) {
			// flipY(self.scene);
			console.log(e);
		}



		try {
			// TODO: Почему-то не работает для https://kalk-pro.ru/beams/wooden-trimmed-cylinder-beam/#BFL=4&BLN=3.6&LID=2&NLD=300&STP=100&WCL=2&WLN=20

			/** Collada **/
			var colladaExporter = new THREE.ColladaExporter();
			colladaExporter.parse(this.viewer.scene, function(res){
				saveString(res.data,  'kalk.pro-COLLADA-' + fileTimestamp() + '.dae');
			}, {});
		}
		catch (e) {
			// flipY(self.scene);
			console.log(e);
		}


		/** Позволить сохранить OBJ файл **/
		var objExporter = new THREE.OBJExporter();
		return objExporter.parse(this.viewer.scene, this.c3d, true);
	};

	/**
	 * @return {Object}
	 * */
	CalcScene3D.prototype.getBodyMesh = function (materials, materialIndex, body, name) {
		var jsmBody = new JSM.Body();

		// Добавим все вертексы
		var i,
			vertex = [];

		for (i = 0; i < body.vertices.length; i++) {
			vertex = body.vertices[i];

			jsmBody.AddVertex(
				new JSM.BodyVertex(
					new JSM.Coord(
						vertex[0],
						vertex[1],
						vertex[2]
					)
				)
			);
		}

		// Добавим полигон
		for (i = 0; i < body.polygons.length; i++) {
			jsmBody.AddPolygon(
				new JSM.BodyPolygon(body.polygons[i])
			);

			// Добавим материал полигону
			jsmBody.GetPolygon(i).SetMaterialIndex(materialIndex);
		}

		// Сетка поверхности
		var mesh = JSM.ConvertBodyToThreeMeshes(jsmBody, materials);

		// Добавляет "тени" и "сглаживание"
		// mesh[0].geometry.computeVertexNormals();

		if(typeof name !== 'undefined' && mesh.length){
			mesh[0].name = name;
		}


		return mesh;
	};

	/**
	 * Добавить объект на сцену
	 *
	 * @return false
	 * */
	CalcScene3D.prototype.addBody = function (body, visible) {
		// Объект в формате {objectName: objectMesh}

		if(typeof visible === 'undefined'){
			visible = true;
		}

		// Поверхность объекта
		var objectName = Object.keys(body)[0];
		this.viewer.AddMeshes(body[objectName]);

		if(visible === false){
			this.scene.getObjectByName(objectName).visible = false;
		}
	};

	/**
	 * Добавить группу объектов на сцену
	 *
	 * @return false
	 * */
	CalcScene3D.prototype.addGroup3D = function (bodies, visible) {
		if(typeof visible === 'undefined'){
			visible = true;
		}

		// Добавляем по одному объекту {objectName: objectMesh}
		for (var i = 0; i < bodies.length; i++) {
			this.addBody(bodies[i], visible);
		}
	};

	/**
	 * Удалить со сцены объект
	 *
	 * @return false
	 * */
	CalcScene3D.prototype.removeBody = function (body) {
		// Объект в формате {objectName: objectMesh}

		var objectName = Object.keys(body)[0];
		this.viewer.RemoveMesh(body[objectName][0]);
	};

	/**
	 * Удалить группу объектов со сцены
	 *
	 * @return false
	 * */
	CalcScene3D.prototype.removeGroup = function (bodies) {
		// Удалить со сцены группу объектов
		for (var i = 0; i < bodies.length; i++) {
			this.removeBody(bodies[i]);
		}
	};

	/**
	 * Скрыть объект на сцене
	 *
	 * @return false
	 * */
	CalcScene3D.prototype.hideBody = function (body) {
		// Объект в формате {objectName: objectMesh}

		var objectName = Object.keys(body)[0];
		this.scene.getObjectByName(objectName).visible = false;
	};

	/**
	 * Скрыть группу объектов на сцене
	 *
	 * @return false
	 * */
	CalcScene3D.prototype.hideGroup3D = function (bodies) {
		// Удалить со сцены группу объектов
		for (var i = 0; i < bodies.length; i++) {
			this.hideBody(bodies[i]);
		}
	};

	/**
	 * Показать объект на сцене
	 *
	 * @return false
	 * */
	CalcScene3D.prototype.showBody = function (body) {
		// Объект в формате {objectName: objectMesh}

		var objectName = Object.keys(body)[0];
		this.scene.getObjectByName(objectName).visible = true;
	};

	/**
	 * Показать группу объектов на сцене
	 *
	 * @return false
	 * */
	CalcScene3D.prototype.showGroup3D = function (bodies) {
		// Удалить со сцены группу объектов
		for (var i = 0; i < bodies.length; i++) {
			this.showBody(bodies[i]);
		}
	};


	/**
	 * @return false
	 * */
	CalcScene3D.prototype.zoomIn = function () {
		this.viewer.navigation.Zoom(0.1);
		this.viewer.navigation.DrawCallback();
	};

	/**
	 * @return false
	 * */
	CalcScene3D.prototype.zoomOut = function () {
		this.viewer.navigation.Zoom(-0.1);
		this.viewer.navigation.DrawCallback();
	};



	/**
	 * Начальные установки линейки
	 */
	CalcScene3D.prototype.rulerInit = function () {
		if(!isSet(this.ruler)){
			this.ruler =  {};

			// Значения для начальной установки
			this.ruler.viewer = this.viewer;
			this.ruler.canvas = this.canvas;

			this.ruler.scene = this.scene;
			this.ruler.camera = this.threeCamera;

			this.ruler.raycaster = this.threeRaycaster;

			this.ruler.minInterDist = 0.02; // 2 cm

			// Обработчики событий
			document.addEventListener('keydown', this.hdrRulerKeyDown(this));
			document.addEventListener('keyup', this.hdrRulerKeyUp(this));
			this.canvas.addEventListener('mousemove', this.hdrRulerMouseMove(this));
			this.canvas.addEventListener('mousedown', this.hdrRulerMouseDown(this));
		}


		// Значения для сброса
		this.ruler.line = null;
		this.ruler.markers = [];

		this.ruler.clicks = 0;
		this.ruler.points = [new THREE.Vector3(), new THREE.Vector3()];

		this.ruler.pointer = null;
		this.ruler.pointerRemoved = false;
		this.ruler.firstPointerPlaced = false;

		this.ruler.shiftPressed = false;


		this.removeMesh(this.ruler.pointer);
		this.removeMesh(this.ruler.markers);
		this.removeMesh(this.ruler.line);

		this.showDistance(0);

		return this.ruler;
	}


	/**
	 * Устанавливает начальный и конечный маркер на линейке
	 *
	 * @param point
	 * @param radius
	 * @param material
	 * @param name
	 * @returns {*[]}
	 */
	CalcScene3D.prototype.rulerSetMarker = function(point, radius, material, name){
		var dot = new THREE.Mesh(
			new THREE.SphereGeometry(radius, 8, 8),
			new THREE.MeshBasicMaterial(material)
		);

		dot.position.copy(point);
		this.ruler.scene.add(dot);


		var cloud = new THREE.Mesh(
			new THREE.SphereGeometry(radius * 4, 8, 8),
			new THREE.MeshBasicMaterial({
				color: material.color,
				transparent: true,
				opacity: 0.4
			})
		);
		cloud.position.copy(point);
		this.ruler.scene.add(cloud);

		if(typeof name !== 'undefined'){
			dot.name = name;
			cloud.name = name;
		}

		return [dot, cloud];
	}


	/**
	 * Соединяет маркеры линейки линией
	 *
	 * @param pointA
	 * @param pointB
	 * @param radius
	 * @param material
	 * @param name
	 * @returns {THREE.Mesh}
	 */
	CalcScene3D.prototype.rulerSetLine = function (pointA, pointB, radius, material, name){
		var HALF_PI = Math.PI * .5;
		var distance = pointA.distanceTo(pointB);
		var position  = pointB.clone().add(pointA).divideScalar(2);

		var material = new THREE.MeshLambertMaterial(material);
		var cylinder = new THREE.CylinderGeometry(radius, radius, distance, 10, 10, false);

		var orientation = new THREE.Matrix4();          //a new orientation matrix to offset pivot
		var offsetRotation = new THREE.Matrix4();       //a matrix to fix pivot rotation
		var offsetPosition = new THREE.Matrix4();       //a matrix to fix pivot position
		orientation.lookAt(pointA,pointB,new THREE.Vector3(0, 1, 0));   //look at destination
		offsetRotation.makeRotationX(HALF_PI);  //rotate 90 degs on X
		orientation.multiply(offsetRotation);   //combine orientation with rotation transformations
		cylinder.applyMatrix(orientation)

		var cylinderMesh = new THREE.Mesh(cylinder, material);
		cylinderMesh.position.set(position.x, position.y, position.z);

		this.ruler.scene.add(cylinderMesh);

		if(typeof name !== 'undefined'){
			cylinderMesh.name = name;
		}

		return cylinderMesh;
	};


	/**
	 * Удаляет объект или группу объектов на сцене в контексте работы линейки
	 *
	 * @param mesh
	 */
	CalcScene3D.prototype.removeMesh = function(mesh){
		if(mesh === null){
			return;
		}

		if(!(mesh instanceof Array)){
			mesh = [mesh];
		}

		for(var i = 0; i < mesh.length; i++){
			if(mesh[i] === null){
				continue;
			}

			if(mesh[i] instanceof Array){
				this.removeMesh(mesh[i]);
				continue;
			}

			mesh[i].geometry.dispose();
			mesh[i].material.dispose();
			this.ruler.scene.remove(mesh[i]);
		}
	}


	/**
	 * Возвращает координаты мыши в контексте размера окна Canvas
	 *
	 * @param event
	 * @param self
	 * @returns {{x: number, y: number}}
	 */
	CalcScene3D.prototype.getMouseCoordinates = function(event){
		var canvasWidth = this.nodes.canvas.width();
		var canvasHeight = this.nodes.canvas.height();
		var rect = event.target.getBoundingClientRect();

		// Рассчитаем координаты клика
		return {
			x: 1 * ((event.clientX - rect.left) / canvasWidth) * 2 - 1,
			y: -1 * ((event.clientY - rect.top) / canvasHeight) * 2 + 1
		};
	}


	/**
	 * Отобразить измеренные размеры
	 *
	 * @param val
	 */
	CalcScene3D.prototype.showDistance = function (val) {
		var self = this;

		var units = this.scope.settings.units;
		var subs = [];
		var toVal = 0;

		var formatVal = function(num){
			return self.scope.converter.get(num, 'm', units, true).toFixed(2) + ' ' + getLabel(units)
		};

		if(typeof val !== 'undefined' && val > 0){
			toVal = '<a href="#" class="js--onclick-useService" data-type="service" data-name="handyman">' +
				getLabel('calc.show') +
				'</a>';
		}
		else{
			toVal = formatVal(0);
		}


		if(isSet(this.scope.services)){
			if(isSet(this.scope.services.pool)){
				if(isSet(this.scope.services.pool.plansSubsByPlans)){
					subs = Object.keys(this.scope.services.pool.plansSubsByPlans);

					if(arrayIntersect(subs, ['handyman', 'handyman_year', 'professional', 'professional_year']).length > 0){
						// Если есть подписка, и это не Новичок - показываем значение
						toVal = formatVal(val);
					}
				}
			}
		}


		this.nodes.distance.html(toVal);
	};


	/**
	 * Обработчик нажатой клавиши на клавиатуре
	 *
	 * @param self: контекст CalcScene3D
	 * @returns {Function}
	 */
	CalcScene3D.prototype.hdrRulerKeyDown = function(self) {
		return function(event) {
			var ruler = self.ruler;

			if (!(event.shiftKey && ruler.shiftPressed === false)) {
				return false;
			}

			ruler.shiftPressed = true;

			if(ruler.clicks === 0){
				// Удалим линейку
				self.removeMesh(ruler.markers);
				self.removeMesh(ruler.line);
			}
		};
	}

	/**
	 * Обработчик отжатой клавиши на клавиатуре
	 *
	 * @param self: контекст CalcScene3D
	 * @returns {Function}
	 */
	CalcScene3D.prototype.hdrRulerKeyUp = function(self) {
		return function(event) {
			if (event && event.key && event.key.toLowerCase() !== 'shift') {
				return false;
			}

			var ruler = self.ruler;

			ruler.shiftPressed = false;
			self.removeMesh(ruler.pointer);
		};
	}


	/**
	 * Обработчик движения мыши в контексте canvas
	 *
	 * @param self: контекст CalcScene3D
	 * @returns {Function}
	 */
	CalcScene3D.prototype.hdrRulerMouseMove = function(self) {
		return function(event) {
			var ruler = self.ruler;

			if(ruler.shiftPressed === false){
				return false;
			}

			// Рассчитаем координаты мыши
			var vector2D = self.getMouseCoordinates(event);

			var colorRed = 0xff5555,
				colorGreen = 0x55ff55;
			var pointerColor = colorRed; // по умолчанию красный


			// Определелим пересечение клика с поверхностью 3D объекта
			ruler.raycaster.setFromCamera(vector2D, ruler.camera);
			var intersects = ruler.raycaster.intersectObjects(ruler.scene.children);

			// Если позиция курсора была на поверхности тела 3D
			if (intersects.length > 0) {
				if(['ruler-pointer', 'ruler-dot', 'ruler-line'].indexOf(intersects[0].object.name) !== -1){
					return false;
				}

				ruler.intersectsPoint = intersects[0].point;

				// TODO: показывать имя объекта с которым происходит пересечение и его подсвечивать
				console.log(intersects[0].object.name + ' (' + getLabel(intersects[0].object.name) + ')');

				var objectVertices = intersects[0].object.geometry.vertices;

				for(var i = 0; i < objectVertices.length; i++){
					if(intersects[0].point.distanceTo(objectVertices[i]) <= ruler.minInterDist){
						// Если расстояние от курсора до ТОЧКИ (размеров) объекта меньше 2 см
						// показывыем курсор зеленым цветом и включаем залипание

						pointerColor = colorGreen;
						ruler.intersectsPoint = JSON.parse(JSON.stringify(objectVertices[i]));

						console.log('%cpoint: ' + JSON.stringify(objectVertices[i]), 'color: green');
						console.log('%cindex: ' + i, 'color: green');

						break;
					}
				}

				if(ruler.pointerRemoved === false){
					self.removeMesh(ruler.pointer);
				}

				if(ruler.firstPointerPlaced === true){
					self.showDistance(ruler.points[0].distanceTo(ruler.intersectsPoint));
				}

				ruler.pointer = self.rulerSetMarker(ruler.intersectsPoint, 0.005, {color: pointerColor}, 'ruler-pointer');
				ruler.pointerRemoved = false;
			}
			else{
				self.removeMesh(ruler.pointer);
				ruler.pointerRemoved = true;

				//ruler.intersectsPoint = null;
			}

//			console.log({move: ruler.intersectsPoint});
		};

	}


	/**
	 * Обработчик нажатой левой кнопки мыши в canvas
	 *
	 * @param self: контекст CalcScene3D
	 * @returns {Function}
	 */
	CalcScene3D.prototype.hdrRulerMouseDown = function(self) {
		return function(event) {
			// Обрабатываем только при наличии зажатой кнопки SHIFT
			if (!event.shiftKey) {
				return false;
			}

			var ruler = self.ruler;

			// Рассчитаем координаты клика
			var vector2D = self.getMouseCoordinates(event);


			// Определелим пересечение клика с поверхностью 3D объекта
			ruler.raycaster.setFromCamera(vector2D, ruler.camera);
			var intersects = ruler.raycaster.intersectObjects(ruler.scene.children);

			self.removeMesh(ruler.pointer);

			// Если клик был по поверхности тела 3D
			if (intersects.length > 0) {
				if(['ruler-dot', 'ruler-line'].indexOf(intersects[0].object.name) !== -1){
					return false;
				}


				// Устанавливаем указатель в контрольную ТОЧКУ объекта, если она была совстем от нее рядом
//				console.log({click: ruler.intersectsPoint});
				if(ruler.intersectsPoint !== null && intersects[0].point.distanceTo(ruler.intersectsPoint) <= ruler.minInterDist){
					ruler.points[ruler.clicks].copy(ruler.intersectsPoint);
				}
				else {
					ruler.points[ruler.clicks].copy(intersects[0].point);
				}


				if(ruler.clicks === 0){
					// Сброс (удаление) линейки
					self.removeMesh(ruler.markers);
					self.removeMesh(ruler.line);

					// Установим маркер #1
					ruler.markers[0] = self.rulerSetMarker(ruler.points[0], 0.005, {color:0xff5555}, 'ruler-dot');

					ruler.clicks++;
					ruler.firstPointerPlaced = true;
				}
				else if(ruler.clicks === 1){
					// Установим маркер #2 и линеку
					ruler.markers[1] = self.rulerSetMarker(ruler.points[1], 0.005, {color:0xff5555}, 'ruler-dot');
					ruler.line = self.rulerSetLine(ruler.points[0], ruler.points[1], 0.001, {color:0xff5555}, 'ruler-line');

					var distance = ruler.points[0].distanceTo(ruler.points[1]);
					self.showDistance(distance);

					ruler.clicks = 0;
					ruler.firstPointerPlaced = false;
				}

				// // Перерисуем сцену
				// self.viewer.DrawIfNeeded();
			}

		};
	}


	modules.Scene3D = CalcScene3D;

})();