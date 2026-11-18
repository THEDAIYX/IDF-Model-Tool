/* global Cesium */
(() => {
  const $ = (id) => document.getElementById(id);
  const ui = {
    fileInput: $('fileInput'), dropzone: $('dropzone'), fileList: $('fileList'), typeList: $('typeList'),
    fileCount: $('fileCount'), elementCount: $('elementCount'), statusText: $('statusText'), sceneSummary: $('sceneSummary'),
    coordinateSummary: $('coordinateSummary'), loading: $('loading'), loadingTitle: $('loadingTitle'), loadingHint: $('loadingHint'),
    toast: $('toast'), hoverCard: $('hoverCard'), hoverTitle: $('hoverTitle'), hoverBody: $('hoverBody'), selectionEmpty: $('selectionEmpty'), selectionContent: $('selectionContent'), selectionType: $('selectionType'),
    selectionName: $('selectionName'), selectionFile: $('selectionFile'), propertyList: $('propertyList'), clock: $('clock'), helpDialog: $('helpDialog')
  };

  const TYPE_MAP = new Map([
    [30, ['BEND', '弯管']], [31, ['BEND', '弯管']], [35, ['ELBOW', '弯头']], [36, ['ELBOW', '弯头']],
    [40, ['OLET', '支管台']], [41, ['OLET', '支管台']], [42, ['OLET', '支管台']], [45, ['TEE', '三通']], [46, ['TEE', '三通']], [47, ['TEE', '三通']],
    [50, ['CROSS', '四通']], [51, ['CROSS', '四通']], [52, ['CROSS', '四通']], [53, ['CROSS', '四通']], [55, ['REDUCER', '异径管']],
    [60, ['REDUCER-TEED', '带三通异径管']], [61, ['REDUCER-TEED', '带三通异径管']], [62, ['REDUCER-TEED', '带三通异径管']],
    [65, ['FLANGE', '异径法兰']], [70, ['BEND-TEE', '三通弯']], [71, ['ELBOW-TEED', '三通弯头']], [72, ['ELBOW-TEED', '三通弯头']],
    [75, ['VALVE-ANGLE', '角阀']], [76, ['VALVE-ANGLE', '角阀']], [80, ['VALVE-3WAY', '三通阀']], [81, ['VALVE-3WAY', '三通阀']], [82, ['VALVE-3WAY', '三通阀']],
    [85, ['VALVE-4WAY', '四通阀']], [86, ['VALVE-4WAY', '四通阀']], [87, ['VALVE-4WAY', '四通阀']], [88, ['VALVE-4WAY', '四通阀']],
    [90, ['INSTRUMENT', '仪表']], [93, ['INSTRUMENT', '仪表']], [95, ['MISC-COMPONENT', '杂项元件']], [96, ['MULTI-PORT', '多端口元件']],
    [100, ['PIPE', '管子']], [101, ['PIPE-FIXED', '定长管']], [102, ['PIPE-BLOCK', '定长管块']], [103, ['PIPE-BLOCK', '变长管块']], [104, ['GAP', '间隙元件']],
    [105, ['FLANGE', '法兰']], [106, ['LAPJOINT', '翻边短节']], [107, ['FLANGE-BLIND', '盲法兰']], [110, ['GASKET', '垫片']],
    [111, ['CONNECTOR', '卫生级接头']], [112, ['NUT', '螺母']], [113, ['CLAMP', '卡箍']], [114, ['MISC-HYGIENIC', '卫生级杂项']], [115, ['BOLT', '螺栓']],
    [120, ['WELD', '焊缝']], [125, ['CAP', '管帽']], [126, ['COUPLING', '管接头']], [127, ['UNION', '活接头']], [130, ['VALVE', '阀门']],
    [132, ['TRAP', '疏水器']], [133, ['TRAP', '疏水器']], [134, ['SAFETY-DISC', '安全膜片']], [136, ['FILTER', '过滤器']], [137, ['FILTER', '过滤器']],
    [140, ['INSTRUMENT-BALLOON', '仪表气球']], [150, ['SUPPORT', '管道支吊架']]
  ]);
  const COLORS = ['#61a8ff', '#60e0bc', '#f6a85b', '#bd8cff', '#f47a9b', '#76d7e8', '#e6d067', '#9ab7ff'];
  const state = { files: [], elements: [], entities: new Map(), markers: new Map(), selectedId: null, activeFileIndex: null, labels: false, pipesOnly: false, dark: true, fileColor: new Map(), typeFilter: null, modelBounds: null, center: [0, 0, 0] };

  const viewer = new Cesium.Viewer('viewport', { animation: false, baseLayer: false, baseLayerPicker: false, fullscreenButton: false, geocoder: false, homeButton: false, infoBox: false, navigationHelpButton: false, sceneModePicker: false, selectionIndicator: false, timeline: false, vrButton: false, scene3DOnly: true, useBrowserRecommendedResolution: false, terrainProvider: new Cesium.EllipsoidTerrainProvider() });
  viewer.scene.globe.show = false; viewer.scene.skyBox.show = false; viewer.scene.skyAtmosphere.show = false; viewer.scene.sun.show = false; viewer.scene.moon.show = false; viewer.scene.fog.enabled = false;
  viewer.resolutionScale = Math.min(Math.max(window.devicePixelRatio || 1, 1.35), 2); viewer.scene.msaaSamples = 4; viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#102638'); viewer.scene.light = new Cesium.DirectionalLight({ direction: new Cesium.Cartesian3(.4, .5, -.8), intensity: 1.6 }); viewer.scene.postProcessStages.fxaa.enabled = false;
  // Use low-level collections instead of Entity polylines.  Entity geometry
  // updaters subdivide local Cartesian lines and can overflow an internal
  // array for some IDF coordinate combinations; collections draw the two
  // supplied endpoints directly and avoid that path entirely.
  const polylineCollection = viewer.scene.primitives.add(new Cesium.PolylineCollection());
  const pointCollection = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
  const camera = viewer.scene.screenSpaceCameraController; camera.enableInputs = false; camera.enableTranslate = false;
  const viewTarget = new Cesium.Cartesian3(); let dragMode = null; let lastPointerPosition = null; let suppressClick = false;
  const navigationHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  function rotateVector(vector, axis, angle, result = new Cesium.Cartesian3()) { const cosine = Math.cos(angle); const sine = Math.sin(angle); const cross = Cesium.Cartesian3.cross(axis, vector, new Cesium.Cartesian3()); const projection = Cesium.Cartesian3.multiplyByScalar(axis, Cesium.Cartesian3.dot(axis, vector) * (1 - cosine), new Cesium.Cartesian3()); Cesium.Cartesian3.multiplyByScalar(vector, cosine, result); Cesium.Cartesian3.add(result, Cesium.Cartesian3.multiplyByScalar(cross, sine, cross), result); return Cesium.Cartesian3.add(result, projection, result); }
  function pointCameraAt(position, target) { const direction = Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(target, position, new Cesium.Cartesian3()), new Cesium.Cartesian3()); let right = Cesium.Cartesian3.cross(direction, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3()); if (Cesium.Cartesian3.magnitudeSquared(right) < 1e-8) right = Cesium.Cartesian3.clone(viewer.camera.right, right); Cesium.Cartesian3.normalize(right, right); const up = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3()), new Cesium.Cartesian3()); viewer.camera.setView({ destination: position, orientation: { direction, up } }); }
  function orbitCamera(deltaX, deltaY = 0) { let relative = Cesium.Cartesian3.subtract(viewer.camera.position, viewTarget, new Cesium.Cartesian3()); relative = rotateVector(relative, Cesium.Cartesian3.UNIT_Z, -deltaX * .004, relative); if (deltaY) { const pitchAxis = Cesium.Cartesian3.normalize(Cesium.Cartesian3.clone(viewer.camera.right, new Cesium.Cartesian3()), new Cesium.Cartesian3()); relative = rotateVector(relative, pitchAxis, -deltaY * .003, relative); } pointCameraAt(Cesium.Cartesian3.add(viewTarget, relative, new Cesium.Cartesian3()), viewTarget); }
  function panCamera(deltaX, deltaY) { const distance = Cesium.Cartesian3.distance(viewer.camera.position, viewTarget); const scale = Math.max(distance, 1) / Math.max(viewer.canvas.clientHeight, 1); const horizontal = Cesium.Cartesian3.multiplyByScalar(viewer.camera.right, -deltaX * scale, new Cesium.Cartesian3()); const vertical = Cesium.Cartesian3.multiplyByScalar(viewer.camera.up, deltaY * scale, new Cesium.Cartesian3()); const offset = Cesium.Cartesian3.add(horizontal, vertical, new Cesium.Cartesian3()); Cesium.Cartesian3.add(viewTarget, offset, viewTarget); pointCameraAt(Cesium.Cartesian3.add(viewer.camera.position, offset, new Cesium.Cartesian3()), viewTarget); }
  function zoomCamera(zoomIn, intensity = 1) { if (!state.modelBounds) return; const radius = Math.max(state.modelBounds.radius, 1); const relative = Cesium.Cartesian3.subtract(viewer.camera.position, viewTarget, new Cesium.Cartesian3()); const distance = Cesium.Cartesian3.magnitude(relative); const maximumDistance = radius * 6; const safeIntensity = Math.min(Math.max(intensity, .04), 1.5); const factor = Math.pow(zoomIn ? .92 : 1.08, safeIntensity); const nextDistance = zoomIn ? distance * factor : Math.min(maximumDistance, distance * factor); if (!Number.isFinite(nextDistance) || nextDistance <= 0) return; viewer.camera.frustum.near = Math.min(.05, Math.max(.00001, nextDistance * .001)); Cesium.Cartesian3.normalize(relative, relative); pointCameraAt(Cesium.Cartesian3.add(viewTarget, Cesium.Cartesian3.multiplyByScalar(relative, nextDistance, relative), new Cesium.Cartesian3()), viewTarget); }
  const beginDrag = (mode, event) => { dragMode = mode; lastPointerPosition = Cesium.Cartesian2.clone(event.position); };
  navigationHandler.setInputAction((event) => beginDrag('rotate', event), Cesium.ScreenSpaceEventType.LEFT_DOWN);
  navigationHandler.setInputAction((event) => beginDrag('pan', event), Cesium.ScreenSpaceEventType.MIDDLE_DOWN);
  navigationHandler.setInputAction((event) => beginDrag('pan', event), Cesium.ScreenSpaceEventType.RIGHT_DOWN);
  navigationHandler.setInputAction((movement) => { if (!dragMode || !lastPointerPosition) return; const deltaX = movement.endPosition.x - lastPointerPosition.x; const deltaY = movement.endPosition.y - lastPointerPosition.y; if (Math.abs(deltaX) + Math.abs(deltaY) > 2) suppressClick = true; if (dragMode === 'rotate') orbitCamera(deltaX, deltaY); else panCamera(deltaX, deltaY); lastPointerPosition = Cesium.Cartesian2.clone(movement.endPosition, lastPointerPosition); }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  const endDrag = () => { dragMode = null; lastPointerPosition = null; if (suppressClick) setTimeout(() => { suppressClick = false; }, 120); };
  navigationHandler.setInputAction(endDrag, Cesium.ScreenSpaceEventType.LEFT_UP); navigationHandler.setInputAction(endDrag, Cesium.ScreenSpaceEventType.MIDDLE_UP); navigationHandler.setInputAction(endDrag, Cesium.ScreenSpaceEventType.RIGHT_UP);
  viewer.scene.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  viewer.scene.canvas.addEventListener('wheel', (event) => { event.preventDefault(); const intensity = Math.min(Math.abs(event.deltaY), 140) / 120; zoomCamera(event.deltaY < 0, intensity); }, { passive: false });

  function toast(message) { ui.toast.textContent = message; ui.toast.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { ui.toast.hidden = true; }, 4200); }
  function status(message) { ui.statusText.textContent = message; }
  function typeOf(typeId, skey = '') { const known = TYPE_MAP.get(typeId); if (known) return { code: known[0], name: known[1] }; const upper = skey.toUpperCase(); if (/^ELB/.test(upper)) return { code: 'ELBOW', name: '弯头' }; if (/^FL/.test(upper)) return { code: 'FLANGE', name: '法兰' }; if (/^VT/.test(upper)) return { code: 'VALVE', name: '阀门' }; if (/^TEE/.test(upper)) return { code: 'TEE', name: '三通' }; return { code: `TYPE-${typeId}`, name: '未分类元件' }; }
  function parseNumber(value) { const n = Number(String(value || '').replace(/[,;]/g, '')); return Number.isFinite(n) ? n : null; }
  function isOrigin(raw) { return raw[0] === 0 && raw[1] === 0 && raw[2] === 0; }
  function parseIdf(text, fileName, fileIndex) {
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/); const records = []; const materials = new Map(); let materialIndex = 0; let materialContinuation = false; let currentTag = ''; let currentMeta = ''; let units = 'MM'; const specs = { pipingSpec: '', pressureClass: '', lineType: '', insulationSpec: '', tracingSpec: '', paintingSpec: '' };
    lines.forEach((raw, lineIndex) => {
      const line = raw.trim(); if (!line) return; const tokens = line.split(/\s+/); const record = parseNumber(tokens[0]);
      if (record === -20 && tokens[1]) { materialIndex += 1; materials.set(materialIndex, { code: tokens.slice(1).join(' ').replace(/[,;]/g, '').trim(), description: '' }); materialContinuation = false; return; }
      if (record === -21 && materialIndex) { materials.get(materialIndex).description = tokens.slice(1).join(' ').trim(); materialContinuation = true; return; }
      if (record === -1 && materialContinuation && materialIndex) { const material = materials.get(materialIndex); material.description = `${material.description} ${tokens.slice(1).join(' ')}`.trim(); return; }
      materialContinuation = false;
      if (record === -207 && tokens[1]) units = tokens.slice(1).join(' ').toUpperCase();
      if (record === -11) specs.pipingSpec = tokens.slice(1).join(' ').trim();
      if (record === -12) specs.pressureClass = tokens.slice(1).join(' ').trim();
      if (record === -13) specs.lineType = tokens.slice(1).join(' ').trim();
      if (record === -15) specs.insulationSpec = tokens.slice(1).join(' ').trim();
      if (record === -16) specs.tracingSpec = tokens.slice(1).join(' ').trim();
      if (record === -17) specs.paintingSpec = tokens.slice(1).join(' ').trim();
      if (record === -39 || record === -31 || record === -600 || record === -601 || record === -602 || record === -603 || record === -604 || record === -605 || record === -606 || record === -607 || record === -608 || record === -609 || record === -610 || record === -612 || record === -613 || record === -614) { const value = tokens.slice(1).join(' ').trim(); if (record === -39 || record === -31) currentTag = currentTag ? `${currentTag} · ${value}` : value; else currentMeta = currentMeta ? `${currentMeta} · ${value}` : value; }
      if (!line.includes(',') || record === null || record < 1 || record > 199) return;
      const nums = tokens.slice(1, 8).map(parseNumber); if (nums.some((n) => n === null)) return;
      const skeyMatch = line.match(/,\s*([A-Za-z0-9_-]{2,12})\s*,/); const skey = skeyMatch ? skeyMatch[1].toUpperCase() : '';
      // 149/FLOW is an Isogen flow-direction marker, not a physical component.
      if (record === 149 || skey === 'FLOW') return;
      const bore = parseNumber(tokens[7]); const component = typeOf(record, skey); const itemRef = tokens[8] ? tokens[8].replace(/[,;]/g, '') : ''; const materialPointer = parseNumber(itemRef);
      records.push({ id: `${fileIndex}-${lineIndex}-${record}`, fileIndex, fileName, line: lineIndex + 1, typeId: record, code: component.code, name: component.name, skey, itemRef, materialPointer, tag: currentTag, meta: currentMeta, pipingSpec: specs.pipingSpec, pressureClass: specs.pressureClass, lineType: specs.lineType, insulationSpec: specs.insulationSpec, tracingSpec: specs.tracingSpec, paintingSpec: specs.paintingSpec, units, startRaw: nums.slice(0, 3), endRaw: nums.slice(3, 6), boreRaw: bore, raw: line });
    });
    records.forEach((item) => { const material = materials.get(item.materialPointer); item.materialCode = material?.code || ''; item.materialDescription = material?.description || ''; });
    return { fileName, fileIndex, units, lines: lines.length, records };
  }
  function makeSample() {
    const rows = [
      [100, 0, 0, 0, 5200, 0, 0, 200, 'PIPE'], [35, 5200, 0, 0, 6500, 1300, 0, 200, 'ELBW'], [100, 6500, 1300, 0, 6500, 6300, 0, 200, 'PIPE'],
      [130, 6500, 6300, 0, 6500, 6300, 1800, 200, 'VTFL'], [105, 6500, 1300, 0, 6900, 1300, 0, 200, 'FLSW'], [100, 6900, 1300, 0, 10400, 1300, 0, 200, 'PIPE'],
      [45, 10400, 1300, 0, 10400, 2600, 0, 200, 'TEE'], [100, 10400, 2600, 0, 14500, 2600, 0, 200, 'PIPE'], [120, 14500, 2600, 0, 14500, 2600, 0, 200, 'WELD'],
      [100, 10400, 2600, 0, 10400, 2600, 2200, 200, 'PIPE'], [150, 10400, 2600, 2200, 10400, 2600, 3000, 150, 'SUPP']
    ];
    const text = ['   -207 MM', ...rows.map((row, i) => `   ${row[0]} ${row[1]} ${row[2]} ${row[3]} ${row[4]} ${row[5]} ${row[6]} ${row[7]} ${i + 1}, , 0 ,${row[8]}, 0 1`)].join('\n');
    return parseIdf(text, '示例-航煤管线.idf', 0);
  }
  function makeMaterial(color) { return Cesium.Material.fromType('Color', { color }); }
  function clearModel() { polylineCollection.removeAll(); pointCollection.removeAll(); state.entities.clear(); state.markers.clear(); state.elements = []; state.files = []; state.modelBounds = null; state.selectedId = null; state.activeFileIndex = null; state.typeFilter = null; ui.selectionEmpty.hidden = false; ui.selectionContent.hidden = true; }
  function normalizeFiles(parsedFiles) {
    const all = parsedFiles.flatMap((file) => file.records); if (!all.length) return;
    const points = all.flatMap((item) => { const startOrigin = isOrigin(item.startRaw); const endOrigin = isOrigin(item.endRaw); if (startOrigin && endOrigin) return []; if (startOrigin) return [item.endRaw]; if (endOrigin) return [item.startRaw]; return [item.startRaw, item.endRaw]; }); if (!points.length) return; const min = [0, 1, 2].map((axis) => Math.min(...points.map((p) => p[axis]))); const max = [0, 1, 2].map((axis) => Math.max(...points.map((p) => p[axis]))); state.center = min.map((v, i) => (v + max[i]) / 2); state.modelBounds = { min, max, center: new Cesium.Cartesian3(0, 0, 0) };
    // IDF coordinates are stored in 1/100 mm.  Convert them to metres before
    // handing them to Cesium; using 0.001 here would enlarge a plant by 100x
    // and can push the camera frustum into invalid values.
    const scale = 0.00001; const point = (raw) => new Cesium.Cartesian3((raw[0] - state.center[0]) * scale, (raw[1] - state.center[1]) * scale, (raw[2] - state.center[2]) * scale); const validLocalPoint = (p) => Boolean(p) && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) && Math.abs(p.x) <= 1e6 && Math.abs(p.y) <= 1e6 && Math.abs(p.z) <= 1e6;
    let minLocal = [Infinity, Infinity, Infinity]; let maxLocal = [-Infinity, -Infinity, -Infinity];
    all.forEach((item) => { item.start = point(item.startRaw); item.end = point(item.endRaw); item.validGeometry = validLocalPoint(item.start) && validLocalPoint(item.end); const candidates = []; if (item.validGeometry && !isOrigin(item.startRaw)) candidates.push(item.start); if (item.validGeometry && !isOrigin(item.endRaw)) candidates.push(item.end); candidates.forEach((p) => { const values = [p.x, p.y, p.z]; minLocal = minLocal.map((v, i) => Math.min(v, values[i])); maxLocal = maxLocal.map((v, i) => Math.max(v, values[i])); }); });
    const safeMin = minLocal.every(Number.isFinite) ? minLocal : [-1, -1, -1]; const safeMax = maxLocal.every(Number.isFinite) ? maxLocal : [1, 1, 1]; const safeCenter = safeMin.map((v, i) => (v + safeMax[i]) / 2); const safeRadius = Math.max(Math.hypot(safeMax[0] - safeMin[0], safeMax[1] - safeMin[1], safeMax[2] - safeMin[2]) / 2, 2);
    state.modelBounds = { center: new Cesium.Cartesian3(safeCenter[0], safeCenter[1], safeCenter[2]), radius: Number.isFinite(safeRadius) ? Math.min(safeRadius, 1e6) : 2 };
    state.elements = all; parsedFiles.forEach((file) => file.records.forEach((item) => { const startOrigin = isOrigin(item.startRaw); const endOrigin = isOrigin(item.endRaw); if ((startOrigin && endOrigin) || !item.validGeometry) return; item.color = state.fileColor.get(file.fileIndex) || COLORS[file.fileIndex % COLORS.length]; const diameter = item.boreRaw && item.boreRaw > 0 ? (item.units.includes('IN') ? item.boreRaw * 25.4 / 16 : item.boreRaw) : 40; item.radius = Math.max(diameter * scale / 2, .012); const isPipe = item.code.startsWith('PIPE'); const materialColor = Cesium.Color.fromCssColorString(item.color).withAlpha(isPipe ? .9 : .98); const segmentLength = Cesium.Cartesian3.distance(item.start, item.end); const hasSegment = !startOrigin && !endOrigin && Number.isFinite(segmentLength) && segmentLength > 1e-6; const pointPosition = endOrigin && !startOrigin ? item.start : startOrigin && !endOrigin ? item.end : null; if (!hasSegment && !pointPosition) return; const width = Math.max(isPipe ? 3.5 : 5.5, Math.min(12, item.radius * 130)); const primitive = hasSegment ? polylineCollection.add({ id: item.id, positions: [item.start, item.end], width, material: makeMaterial(materialColor) }) : pointCollection.add({ id: item.id, position: pointPosition, pixelSize: isPipe ? 5 : 8, color: materialColor, outlineColor: Cesium.Color.fromCssColorString('#10202d'), outlineWidth: 1 }); state.entities.set(item.id, primitive); if (!isPipe && hasSegment) { const marker = pointCollection.add({ id: `${item.id}-marker`, position: item.start, pixelSize: 7, color: Cesium.Color.fromCssColorString('#f6a85b'), outlineColor: Cesium.Color.fromCssColorString('#2b1c0e'), outlineWidth: 1, show: false }); state.markers.set(item.id, marker); } }));
  }
  function setSafeCamera(sphere, top = false) { if (!sphere?.center || !Number.isFinite(sphere.radius)) return; const radius = Math.min(Math.max(sphere.radius, 2), 1e6); const selected = !top && state.selectedId ? state.elements.find((entry) => entry.id === state.selectedId) : null; const target = selected ? (isOrigin(selected.endRaw) && !isOrigin(selected.startRaw) ? selected.start : isOrigin(selected.startRaw) && !isOrigin(selected.endRaw) ? selected.end : Cesium.Cartesian3.midpoint(selected.start, selected.end, new Cesium.Cartesian3())) : sphere.center; const near = Math.min(0.05, Math.max(0.00001, radius * 0.001)); const far = Math.min(1e9, Math.max(radius * 100, near * 1000, 100)); viewer.camera.frustum.near = near; viewer.camera.frustum.far = far; Cesium.Cartesian3.clone(target, viewTarget); if (top) { pointCameraAt(new Cesium.Cartesian3(target.x, target.y, target.z + radius * 2.4), target); return; } if (selected) { const relative = Cesium.Cartesian3.subtract(viewer.camera.position, viewTarget, new Cesium.Cartesian3()); const distance = Math.max(Cesium.Cartesian3.magnitude(relative), radius * 2.2, 8); Cesium.Cartesian3.normalize(relative, relative); pointCameraAt(Cesium.Cartesian3.add(viewTarget, Cesium.Cartesian3.multiplyByScalar(relative, distance, relative), new Cesium.Cartesian3()), viewTarget); return; } pointCameraAt(new Cesium.Cartesian3(target.x + radius * 1.1, target.y - radius * 1.6, target.z + radius * .8), target); }
  function fit() { if (!state.modelBounds) return; setSafeCamera(new Cesium.BoundingSphere(state.modelBounds.center, state.modelBounds.radius)); }
  function boundsForItems(items) {
    const points = items.flatMap((item) => {
      if (item.validGeometry === false) return [];
      const result = [];
      if (item.start && !isOrigin(item.startRaw)) result.push(item.start);
      if (item.end && !isOrigin(item.endRaw)) result.push(item.end);
      return result;
    });
    if (!points.length) return null;
    const min = [0, 1, 2].map((axis) => Math.min(...points.map((point) => [point.x, point.y, point.z][axis])));
    const max = [0, 1, 2].map((axis) => Math.max(...points.map((point) => [point.x, point.y, point.z][axis])));
    const center = new Cesium.Cartesian3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    const radius = Math.max(Cesium.Cartesian3.distance(center, new Cesium.Cartesian3(max[0], max[1], max[2])), 0.05);
    return { center, radius };
  }
  function focusFile(fileIndex) {
    const items = state.elements.filter((item) => item.fileIndex === fileIndex);
    const bounds = boundsForItems(items);
    if (!bounds) return;
    state.selectedId = null;
    ui.selectionEmpty.hidden = false;
    ui.selectionContent.hidden = true;
    const safeRadius = Math.min(Math.max(Number.isFinite(bounds.radius) ? bounds.radius : 2, 2), 1e6);
    setSafeCamera(new Cesium.BoundingSphere(bounds.center, safeRadius));
  }
  function renderLists() {
    ui.fileCount.textContent = `${state.files.length} 文件`; ui.elementCount.textContent = `${state.elements.length} 元件`;
    ui.fileList.innerHTML = state.files.length ? state.files.map((file) => `<div class="file-item ${state.activeFileIndex === file.fileIndex ? 'active' : ''}" data-file-index="${file.fileIndex}" style="--file-color:${state.fileColor.get(file.fileIndex)}"><span class="file-name" title="${file.fileName}">${file.fileName}</span><span class="file-meta"><span>${file.records.length} 元件</span><span>${file.units || 'MM'}</span></span></div>`).join('') : '<p class="empty-state">导入后，文件和元件统计会显示在这里。</p>';
    const types = [...new Map(state.elements.map((item) => [item.code, item])).values()].sort((a, b) => a.code.localeCompare(b.code)); const counts = new Map(); state.elements.forEach((item) => counts.set(item.code, (counts.get(item.code) || 0) + 1));
    ui.typeList.innerHTML = types.length ? types.map((item) => `<div class="type-item ${state.typeFilter === item.code ? 'active' : ''}" data-type="${item.code}"><span class="type-swatch" style="--type-color:${item.code.startsWith('PIPE') ? '#61a8ff' : '#f6a85b'}"></span><span>${item.name}<small class="type-code"> · ${item.code}</small></span><span class="type-count">${counts.get(item.code)}</span></div>`).join('') : '<p class="empty-state">暂无分类</p>';
    ui.fileList.querySelectorAll('.file-item').forEach((el) => el.addEventListener('click', () => { const index = Number(el.dataset.fileIndex); state.activeFileIndex = index; state.typeFilter = null; resetColors(); state.entities.forEach((entity, id) => { const item = state.elements.find((entry) => entry.id === id); entity.show = item?.fileIndex === index; }); state.markers.forEach((entity, id) => { const item = state.elements.find((entry) => entry.id === id); entity.show = item?.fileIndex === index && !state.pipesOnly; }); focusFile(index); renderLists(); }));
    ui.typeList.querySelectorAll('.type-item').forEach((el) => el.addEventListener('click', () => { state.typeFilter = state.typeFilter === el.dataset.type ? null : el.dataset.type; state.entities.forEach((entity, id) => { const item = state.elements.find((entry) => entry.id === id); entity.show = !state.typeFilter || item?.code === state.typeFilter; }); state.markers.forEach((entity, id) => { const item = state.elements.find((entry) => entry.id === id); entity.show = !state.typeFilter || item?.code === state.typeFilter; }); renderLists(); }));
  }
  function escapeHtml(value) { return String(value ?? '—').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
  function propertyRow(label, value) { return `<div class="property-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value ?? '—')}</dd></div>`; }
  function pickedId(picked) { const rawId = picked?.id ?? picked?.primitive?.id; return typeof rawId === 'string' ? rawId : rawId?.properties?.elementId?.getValue?.(Cesium.JulianDate.now()) || rawId?.elementId; }
  function hideHover() { ui.hoverCard.hidden = true; }
  function showHover(item, position) { if (!item) { hideHover(); return; } const bore = item.boreRaw ? `${item.boreRaw} (${item.units})` : '—'; const specification = [item.pipingSpec, item.pressureClass].filter(Boolean).join(' / ') || '—'; ui.hoverTitle.textContent = `${item.name} · ${item.skey || '无 SKEY'}`; ui.hoverBody.innerHTML = `<div class="hover-row"><span>IDF 行号</span><span>${escapeHtml(`${item.fileName} · 第 ${item.line} 行`)}</span></div><div class="hover-row"><span>规格</span><span>${escapeHtml(specification)}</span></div><div class="hover-row"><span>管径</span><span>${escapeHtml(bore)}</span></div><div class="hover-row"><span>材料代码</span><span>${escapeHtml(item.materialCode || '—')}</span></div><div class="hover-row"><span>材料描述</span><span>${escapeHtml(item.materialDescription || '—')}</span></div>`; const left = Math.min(position.x + 18, Math.max(12, window.innerWidth - 270)); const top = Math.min(position.y + 18, Math.max(12, window.innerHeight - 150)); ui.hoverCard.style.left = `${left}px`; ui.hoverCard.style.top = `${top}px`; ui.hoverCard.hidden = false; }
  function focusItem(item) { const startOrigin = isOrigin(item.startRaw); const endOrigin = isOrigin(item.endRaw); const target = endOrigin && !startOrigin ? item.start : startOrigin && !endOrigin ? item.end : Cesium.Cartesian3.midpoint(item.start, item.end, new Cesium.Cartesian3()); const length = Cesium.Cartesian3.distance(item.start, item.end); const range = Math.max(Number.isFinite(length) ? length * 2.5 : 2, 2); Cesium.Cartesian3.clone(target, viewTarget); const destination = Cesium.Cartesian3.subtract(viewTarget, Cesium.Cartesian3.multiplyByScalar(viewer.camera.direction, range, new Cesium.Cartesian3()), new Cesium.Cartesian3()); pointCameraAt(destination, viewTarget); }
  function selectItem(item) { if (!item) return; state.selectedId = item.id; state.activeFileIndex = item.fileIndex; focusItem(item); const entity = state.entities.get(item.id); const highlight = Cesium.Color.fromCssColorString('#62f4d1').withAlpha(.86); if (entity?.positions) { entity.material = makeMaterial(highlight); entity.width = 8; } else if (entity?.position) { entity.color = highlight; entity.pixelSize = 11; } state.entities.forEach((other, id) => { if (id !== item.id) { const candidate = state.elements.find((entry) => entry.id === id); if (!candidate) return; const color = Cesium.Color.fromCssColorString(candidate.color); if (other?.positions) other.material = makeMaterial(color.withAlpha(.28)); if (other?.position) other.color = color.withAlpha(.45); } }); ui.selectionEmpty.hidden = true; ui.selectionContent.hidden = false; ui.selectionType.textContent = item.code; ui.selectionName.textContent = `${item.name} · ${item.skey || '无 SKEY'}`; ui.selectionFile.textContent = `${item.fileName} · 第 ${item.line} 行`; ui.propertyList.innerHTML = [propertyRow('IDF 记录号', item.typeId), propertyRow('IDF 行号', `${item.fileName} · 第 ${item.line} 行`), propertyRow('SKEY 符号键', item.skey || '—'), propertyRow('规格名称', item.pipingSpec || '—'), propertyRow('压力等级', item.pressureClass || '—'), propertyRow('材料代码', item.materialCode || '—'), propertyRow('材料描述', item.materialDescription || '—'), propertyRow('项目 / 标签', item.tag || item.itemRef || '—'), propertyRow('起点 E / N / Z', item.startRaw.map((v) => (v / 100).toFixed(2)).join(' / ') + ' mm'), propertyRow('终点 E / N / Z', item.endRaw.map((v) => (v / 100).toFixed(2)).join(' / ') + ' mm'), propertyRow('管径字段', item.boreRaw ? `${item.boreRaw} (${item.units})` : '—'), propertyRow('原始行', item.raw)].join(''); }
  function resetColors() { state.entities.forEach((entity, id) => { const item = state.elements.find((entry) => entry.id === id); if (!item) return; const visibleByFilter = !state.typeFilter || item.code === state.typeFilter; const isPipe = item.code.startsWith('PIPE'); const color = Cesium.Color.fromCssColorString(item.color).withAlpha(isPipe ? .9 : .98); entity.show = visibleByFilter && (!state.pipesOnly || isPipe); if (entity?.positions) { entity.material = makeMaterial(color); entity.width = Math.max(isPipe ? 3.5 : 5.5, Math.min(12, item.radius * 130)); } if (entity?.position) { entity.color = color; entity.pixelSize = isPipe ? 5 : 8; } }); state.markers.forEach((entity, id) => { const item = state.elements.find((entry) => entry.id === id); entity.show = Boolean(state.labels && item && (!state.typeFilter || item.code === state.typeFilter) && !state.pipesOnly); }); }
  function clearSelection() { state.selectedId = null; state.activeFileIndex = null; resetColors(); if (state.modelBounds?.center) Cesium.Cartesian3.clone(state.modelBounds.center, viewTarget); ui.selectionEmpty.hidden = false; ui.selectionContent.hidden = true; hideHover(); renderLists(); }
  function showLoading(title, hint) { ui.loadingTitle.textContent = title; ui.loadingHint.textContent = hint; ui.loading.hidden = false; }
  async function loadFiles(fileList) { const files = [...fileList]; if (!files.length) return; showLoading('正在解析 IDF', `读取 ${files.length} 个文件…`); clearModel(); state.files = []; files.forEach((file, index) => { state.fileColor.set(index, COLORS[index % COLORS.length]); }); try { const parsed = []; for (let i = 0; i < files.length; i += 1) { ui.loadingHint.textContent = `解析 ${files[i].name}（${i + 1}/${files.length}）…`; parsed.push(parseIdf(await files[i].text(), files[i].name, i)); } state.files = parsed; normalizeFiles(parsed); renderLists(); resetColors(); fit(); status(`模型已就绪 · ${state.elements.length} 个元件`); ui.sceneSummary.textContent = `本地解析 · ${state.files.length} 个文件 · ${state.elements.length} 个元件`; ui.coordinateSummary.textContent = `坐标中心：${state.center.map((v) => (v / 100).toFixed(0)).join(' / ')} mm`; if (!state.elements.length) toast('没有找到带坐标的 IDF 元件记录，请确认文件是 Isogen IDF 格式。'); } catch (error) { console.error(error); toast(`IDF 解析失败：${error.message}`); status('解析失败'); } finally { ui.loading.hidden = true; } }
  function resetView() { state.selectedId = null; state.typeFilter = null; state.pipesOnly = false; $('pipesButton')?.classList.remove('active'); resetColors(); fit(); renderLists(); }

  ui.fileInput.addEventListener('change', (event) => loadFiles(event.target.files)); ['dragenter', 'dragover'].forEach((name) => ui.dropzone.addEventListener(name, (event) => { event.preventDefault(); ui.dropzone.classList.add('dragover'); })); ['dragleave', 'drop'].forEach((name) => ui.dropzone.addEventListener(name, (event) => { event.preventDefault(); ui.dropzone.classList.remove('dragover'); })); ui.dropzone.addEventListener('drop', (event) => loadFiles(event.dataTransfer.files)); $('sampleButton').addEventListener('click', () => { const sample = makeSample(); state.fileColor.set(0, COLORS[0]); clearModel(); state.files = [sample]; normalizeFiles(state.files); renderLists(); resetColors(); fit(); status(`示例模型已就绪 · ${state.elements.length} 个元件`); ui.sceneSummary.textContent = `示例模型 · ${state.elements.length} 个元件`; ui.coordinateSummary.textContent = '坐标单位：mm · 原点已自动居中'; }); $('clearButton').addEventListener('click', () => { clearModel(); renderLists(); status('等待导入 IDF 文件'); ui.sceneSummary.textContent = '本地浏览器解析 · 尚未载入模型'; ui.coordinateSummary.textContent = '坐标系：IDF 本地坐标'; });
  document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => { const action = button.dataset.action; if (action === 'fit' || action === 'reset') fit(); if (action === 'top' && state.modelBounds) setSafeCamera(new Cesium.BoundingSphere(state.modelBounds.center, state.modelBounds.radius), true); if (action === 'labels') { state.labels = !state.labels; button.classList.toggle('active', state.labels); resetColors(); } if (action === 'pipes') { state.pipesOnly = !state.pipesOnly; button.classList.toggle('active', state.pipesOnly); resetColors(); } if (action === 'background') { state.dark = !state.dark; viewer.scene.backgroundColor = Cesium.Color.fromCssColorString(state.dark ? '#102638' : '#cddce0'); button.classList.toggle('active', state.dark); } if (action === 'clear-selection') clearSelection(); }));
  viewer.screenSpaceEventHandler.setInputAction((click) => { if (suppressClick) return; const picked = viewer.scene.pick(click.position); const id = pickedId(picked); const item = state.elements.find((entry) => entry.id === id); if (item) selectItem(item); }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  viewer.screenSpaceEventHandler.setInputAction((movement) => { if (dragMode || suppressClick) { hideHover(); return; } const picked = viewer.scene.pick(movement.endPosition); const id = pickedId(picked); const item = state.elements.find((entry) => entry.id === id); showHover(item, movement.endPosition); }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  ui.helpDialog.addEventListener('click', (event) => { if (event.target === ui.helpDialog) ui.helpDialog.close(); }); $('helpButton').addEventListener('click', () => ui.helpDialog.showModal());
  const shell = document.querySelector('.shell');
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.repeat) return;
    const target = event.target;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || target?.isContentEditable) return;
    event.preventDefault();
    shell?.classList.toggle('panels-collapsed');
  });
  const tick = () => { ui.clock.textContent = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date()); }; tick(); setInterval(tick, 1000); renderLists();
})();
