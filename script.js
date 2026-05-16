let map, markers = [], currentName = '默认行程';
let searchMarkers = [], markerIdCounter = 0;
let dataStore = { current: '默认行程', itineraries: [{ name: '默认行程', markers: [] }] };
let routePath = null;
let previewMode = 'line';
const TYPES = [
    { value: 'default', label: '默认', color: '#e74c3c' },
    { value: 'hotel',  label: '酒店', color: '#8e44ad' },
    { value: 'scenic', label: '景点', color: '#27ae60' },
    { value: 'food',   label: '美食', color: '#e67e22' },
    { value: 'photo',  label: '拍照点', color: '#2980b9' },
];
function getType(type) { return TYPES.find(t => t.value === type) || TYPES[0]; }
function markerContent(title, type, seq) {
    const c = getType(type);
    if (seq !== undefined) {
        return `<div style="background:${c.color};color:#fff;width:26px;height:26px;border-radius:50%;font-size:13px;font-weight:bold;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${seq}</div>`;
    }
    return `<div style="background:${c.color};color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;white-space:nowrap;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${title}</div>`;
}
function editFormHTML(markerId, d) {
    const safe = (d._title || '').replace(/'/g, "\\'");
    const typeOpts = TYPES.map(t =>
        `<option value="${t.value}" ${(d.type||'default')===t.value?'selected':''}>${t.label}</option>`
    ).join('');
    return `
        <div class="info-form">
            <strong>编辑点位</strong><br><br>
            <input class="e_title" placeholder="名称" value="${safe}">
            <textarea class="e_desc" placeholder="行程/美食/酒店">${d.desc || ''}</textarea>
            <input class="e_stay" placeholder="逗留时间" value="${d.stay || ''}">
            <input class="e_date" type="date" style="width:100%;padding:6px;margin-bottom:10px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box" value="${d.date || ''}">
            <select class="e_type" style="width:100%;padding:6px;margin-bottom:10px;border:1px solid #ddd;border-radius:4px">
                ${typeOpts}
            </select>
            <div style="display:flex;gap:6px">
                <button onclick="updateMarker(${markerId}, this)" style="flex:1;background:#e74c3c">保存</button>
                <button onclick="deleteMarker(${markerId})" style="background:#666;padding:8px 10px">🗑</button>
            </div>
        </div>
    `;
}
function attachMarkerEdit(marker) {
    marker.on('click', () => {
        try {
            new AMap.InfoWindow({
                content: editFormHTML(marker._id, marker.getExtData()),
                offset: new AMap.Pixel(0, -30)
            }).open(map, marker.getPosition());
        } catch(e) {
            showError('打开点位详情失败：' + e.message);
        }
    });
}

async function autoSave() {
  const itinerary = dataStore.itineraries.find(i => i.name === currentName);
  if (itinerary) {
    itinerary.markers = markers.map(m => {
      const ext = m.getExtData();
      return {
        pos: [m.getPosition().lng, m.getPosition().lat],
        title: ext._title || '',
        ext
      };
    });
  }
  dataStore.current = currentName;
  localStorage.setItem('traveltool_data', JSON.stringify(dataStore));
  // 已关联数据文件时同步写入磁盘
  if (currentFileHandle) {
    await saveData(dataStore).catch(() => {});
  }
}

function showError(msg) {
    const div = document.createElement('div');
    div.textContent = msg;
    Object.assign(div.style, {
        position: 'fixed', top: '80px', right: '20px', zIndex: 9999,
        background: '#e74c3c', color: '#fff', padding: '12px 20px',
        borderRadius: '6px', fontSize: '14px', maxWidth: '350px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
    });
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 5000);
}

// 1. 初始化地图
map = new AMap.Map('container', {
    zoom: 11,
    center: [116.397428, 39.90923],
    mapStyle: 'amap://styles/light'
});

// 2. 搜索功能
const auto = new AMap.Autocomplete({ input: "searchInput" });
const placeSearch = new AMap.PlaceSearch();

function doSearch(query) {
    const val = query || document.getElementById('searchInput').value.trim();
    if (!val) return;
    placeSearch.search(val, (status, result) => {
        if (status !== 'complete' || !result.poiList) {
            showError('搜索目的地失败，请检查网络或安全密钥配置');
            return;
        }
        showSearchResults(result.poiList.pois);
    });
}

auto.on("select", (e) => {
    doSearch(e.poi.name);
});

document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
});

function showSearchResults(pois) {
    searchMarkers.forEach(m => m.setMap(null));
    searchMarkers = [];

    const list = document.getElementById('searchResultList');
    list.innerHTML = pois.map((p, i) =>
        `<div class="item" data-index="${i}">
            <div class="name">${i + 1}. ${p.name}</div>
            <div class="addr">${p.address || '暂无地址'}</div>
        </div>`
    ).join('');

    pois.forEach(p => {
        const marker = new AMap.Marker({
            position: p.location,
            title: p.name,
            content: `<div style="background:#27ae60;color:#fff;padding:2px 10px;border-radius:12px;font-size:12px;white-space:nowrap;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${p.name}</div>`,
            offset: new AMap.Pixel(-18, -18),
            map: map
        });
        marker.on('mouseover', () => {
            const safe = p.name.replace(/'/g, "\\'");
            new AMap.InfoWindow({
                content: `<div style="min-width:160px">
                    <b>${p.name}</b><br>
                    ${p.address || ''}<br>
                    <button onclick="openAddForm([${p.location.lng}, ${p.location.lat}], '${safe}')"
                        style="margin-top:6px;padding:4px 12px;background:#27ae60;color:#fff;border:none;border-radius:3px;cursor:pointer">
                        + 添加到行程
                    </button>
                </div>`,
                offset: new AMap.Pixel(0, -30)
            }).open(map, p.location);
        });
        searchMarkers.push(marker);
    });

    list.querySelectorAll('.item').forEach(el => {
        el.addEventListener('click', () => {
            const poi = pois[parseInt(el.dataset.index)];
            map.setCenter(poi.location);
            map.setZoom(15);
            closeSearchResults();
        });
    });
    document.getElementById('searchResults').style.display = 'block';
}

function closeSearchResults() {
    document.getElementById('searchResults').style.display = 'none';
}

let formIdCounter = 0;

function openAddForm(lnglat, name) {
    const fid = ++formIdCounter;
    map.clearInfoWindow();
    const content = `
        <div class="info-form" data-fid="${fid}">
            <strong>添加攻略点位</strong><br><br>
            <input id="p_title_${fid}" placeholder="名称(如：故宫)" value="${name || ''}">
            <textarea id="p_desc_${fid}" placeholder="行程/美食/酒店"></textarea>
            <input id="p_stay_${fid}" placeholder="逗留时间(如: 3小时)">
            <input id="p_date_${fid}" type="date" style="width:100%;padding:6px;margin-bottom:10px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box">
            <select id="p_type_${fid}" style="width:100%;padding:6px;margin-bottom:10px;border:1px solid #ddd;border-radius:4px">
                ${TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
            </select>
            <button onclick="confirmAdd([${lnglat[0]}, ${lnglat[1]}], ${fid})">保存到此点</button>
        </div>
    `;
    const infoWindow = new AMap.InfoWindow({ content, offset: new AMap.Pixel(0, -30) });
    infoWindow.open(map, lnglat);
}

// 4. 确认添加并标记
async function confirmAdd(lnglat, fid) {
    const title = document.getElementById(`p_title_${fid}`).value.trim();
    const desc = document.getElementById(`p_desc_${fid}`).value.trim();
    const stay = document.getElementById(`p_stay_${fid}`).value.trim();
    const type = document.getElementById(`p_type_${fid}`).value;
    const date = document.getElementById(`p_date_${fid}`).value;
    
    if(!title) return alert('起码给个名字吧');

    // 获取实时天气（通过坐标反查城市）
    let weather = '未知';
    try {
        weather = await fetchWeather(lnglat);
    } catch(e) {
        showError('天气获取异常：' + e.message);
    }
    
    const marker = new AMap.Marker({
        position: lnglat,
        title: title,
        extData: { _title: title, desc, stay, weather, type, date },
        content: markerContent(title, type),
        offset: new AMap.Pixel(-18, -18),
        map: map
    });
    marker._id = markerIdCounter++;
    attachMarkerEdit(marker);

    markers.push(marker);
    map.clearInfoWindow();
    updateRoute();
    autoSave();
}

function updateMarker(id, btn) {
    const form = btn.closest('.info-form');
    if (!form) return showError('未找到编辑表单');
    const title = form.querySelector('.e_title').value.trim();
    const desc = form.querySelector('.e_desc').value.trim();
    const stay = form.querySelector('.e_stay').value.trim();
    const type = form.querySelector('.e_type').value;
    const date = form.querySelector('.e_date').value;
    if (!title) return alert('名称不能为空');

    const idx = markers.findIndex(m => m._id === id);
    if (idx === -1) return showError('未找到该点位');
    const old = markers[idx];
    const ext = old.getExtData();
    const pos = old.getPosition();
    old.setMap(null);

    const marker = new AMap.Marker({
        position: pos,
        title: title,
        extData: { ...ext, _title: title, desc, stay, type, date },
        content: markerContent(title, type),
        offset: new AMap.Pixel(-18, -18),
        map: map
    });
    marker._id = id;
    attachMarkerEdit(marker);

    markers[idx] = marker;
    map.clearInfoWindow();
    updateRoute();
    autoSave();
}

function deleteMarker(id) {
    if (!confirm('确定删除该点位？')) return;
    const idx = markers.findIndex(m => m._id === id);
    if (idx === -1) return;
    markers[idx].setMap(null);
    markers.splice(idx, 1);
    map.clearInfoWindow();
    updateRoute();
    autoSave();
}

// 5. 天气接口（先逆地理编码获取城市名）
async function fetchWeather(lnglat) {
    return new Promise(resolve => {
        const geocoder = new AMap.Geocoder();
        geocoder.getAddress(lnglat, (status, result) => {
            if (status !== 'complete' || !result.regeocode) {
                showError('逆地理编码失败，无法获取城市天气');
                return resolve('未知');
            }
            const city = result.regeocode.addressComponent.city || result.regeocode.addressComponent.province;
            if (!city) {
                showError('无法识别所在城市');
                return resolve('未知');
            }
            const weather = new AMap.Weather();
            weather.getLive(city, (err, data) => {
                if (err) showError('天气查询失败：' + city);
                resolve(err ? '未知' : `${data.weather} ${data.temperature}℃`);
            });
        });
    });
}

// 6. 自动连线规划
let driving;
function refreshMarkerLabels() {
    markers.forEach((m, i) => {
        const ext = m.getExtData();
        const isStart = i === 0;
        const isEnd = i === markers.length - 1;
        const seq = (!isStart && !isEnd) ? i : undefined;
        // Use ext._title as the authoritative source, fall back to marker title
        const displayName = (ext && ext._title) ? ext._title : (m.getTitle() || '');
        m.setContent(markerContent(displayName, ext ? ext.type : 'default', seq));
    });
}
function updateRoute() {
    if (!driving) driving = new AMap.Driving({ map: map, panel: 'routeList' });
    driving.clear();
    routePath = null;
    if (markers.length < 2) { renderPointList(); refreshMarkerLabels(); return; }
    const path = markers.map(m => m.getPosition());
    driving.search(path[0], path[path.length - 1], { waypoints: path.slice(1, -1) }, (status, result) => {
        if (status !== 'error' && status !== 'no_data' && result.routes && result.routes[0]) {
            routePath = result.routes[0].steps.map(s => s.path).flat();
        }
    });
    refreshMarkerLabels();
    renderPointList();
}

// 7. 点位列表拖拽排序
function renderPointList() {
    const container = document.getElementById('pointList');
    if (!container) return;
    if (markers.length === 0) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:#999;font-size:13px">暂无点位</div>';
        return;
    }
    container.innerHTML = markers.map((m, i) => {
        const d = m.getExtData();
        const name = d._title || m.getTitle() || '';
        const c = getType(d.type);
        const dateStr = d.date ? `<span style="font-size:11px;color:#888;margin-left:6px">${d.date}</span>` : '';
        return `<div class="point-item" draggable="true" data-index="${i}">
            <span class="p-idx">${i + 1}</span>
            <span class="p-name" style="display:flex;flex-wrap:wrap;align-items:center">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c.color};margin-right:4px;vertical-align:middle"></span>
                ${name}${dateStr}
            </span>
            <span class="p-del" onclick="event.stopPropagation();deleteFromList(${m._id})">✕</span>
        </div>`;
    }).join('');

    let dragSrcIdx = null;
    container.querySelectorAll('.point-item').forEach(el => {
        el.addEventListener('dragstart', e => {
            dragSrcIdx = parseInt(el.dataset.index);
            el.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        el.addEventListener('dragend', () => {
            el.classList.remove('dragging');
            container.querySelectorAll('.point-item').forEach(c => c.classList.remove('drag-over'));
        });
        el.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            container.querySelectorAll('.point-item').forEach(c => c.classList.remove('drag-over'));
            el.classList.add('drag-over');
        });
        el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
        el.addEventListener('drop', e => {
            e.preventDefault();
            el.classList.remove('drag-over');
            const toIdx = parseInt(el.dataset.index);
            if (dragSrcIdx !== null && dragSrcIdx !== toIdx) {
                reorderMarkers(dragSrcIdx, toIdx);
            }
            dragSrcIdx = null;
        });
    });
}

function reorderMarkers(from, to) {
    const [moved] = markers.splice(from, 1);
    markers.splice(to, 0, moved);
    updateRoute();
    autoSave();
}

function deleteFromList(id) {
    if (!confirm('确定删除该点位？')) return;
    const idx = markers.findIndex(m => m._id === id);
    if (idx === -1) return;
    markers[idx].setMap(null);
    markers.splice(idx, 1);
    map.clearInfoWindow();
    updateRoute();
    autoSave();
}

function togglePointPanel() {
    const p = document.getElementById('pointPanel');
    p.style.display = p.style.display === 'none' ? 'block' : 'none';
    if (p.style.display === 'block') renderPointList();
}

// 8. 预览功能
function togglePreview() {
    if (markers.length < 2) return alert('至少需要2个点位才能预览');
    const overlay = document.getElementById('previewOverlay');
    overlay.style.display = 'flex';
    previewMode = 'line';
    renderPreview(previewMode);
}

function closePreview() {
    document.getElementById('previewOverlay').style.display = 'none';
}

function renderPreview(mode) {
    previewMode = mode;
    document.querySelectorAll('.preview-bar button').forEach(b => b.classList.remove('active'));
    document.querySelector(`.preview-bar button[onclick*="${mode}"]`).classList.add('active');

    const canvas = document.getElementById('previewCanvas');
    const W = 1200, H = 800;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, W, H);

    const positions = markers.map(m => m.getPosition());
    const lngs = positions.map(p => p.lng);
    const lats = positions.map(p => p.lat);
    let minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    let minLat = Math.min(...lats), maxLat = Math.max(...lats);
    if (minLng === maxLng) { minLng -= 0.01; maxLng += 0.01; }
    if (minLat === maxLat) { minLat -= 0.01; maxLat += 0.01; }
    const padLng = (maxLng - minLng) * 0.15;
    const padLat = (maxLat - minLat) * 0.15;
    minLng -= padLng; maxLng += padLng;
    minLat -= padLat; maxLat += padLat;

    const PAD = 60;
    const mapW = W - PAD * 2;
    const mapH = H - PAD * 2;

    function toCanvas(lng, lat) {
        return [PAD + (lng - minLng) / (maxLng - minLng) * mapW,
                PAD + (maxLat - lat) / (maxLat - minLat) * mapH];
    }

    // Draw route
    if (mode === 'road' && routePath && routePath.length > 0) {
        ctx.beginPath();
        const [sx, sy] = toCanvas(routePath[0].lng, routePath[0].lat);
        ctx.moveTo(sx, sy);
        for (let i = 1; i < routePath.length; i++) {
            const [x, y] = toCanvas(routePath[i].lng, routePath[i].lat);
            ctx.lineTo(x, y);
        }
        ctx.strokeStyle = '#3498db';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
    } else {
        ctx.beginPath();
        const [sx, sy] = toCanvas(positions[0].lng, positions[0].lat);
        ctx.moveTo(sx, sy);
        for (let i = 1; i < positions.length; i++) {
            const [x, y] = toCanvas(positions[i].lng, positions[i].lat);
            ctx.lineTo(x, y);
        }
        ctx.strokeStyle = '#e74c3c';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Draw markers and collect dialog info
    const dialogs = markers.map((m, i) => {
        const d = m.getExtData();
        const [x, y] = toCanvas(m.getPosition().lng, m.getPosition().lat);

        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.fillStyle = '#e74c3c';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(i + 1, x, y);

        const name = d._title || m.getTitle() || '';
        const desc = d.desc || '';
        const stay = d.stay || '';
        const weather = d.weather || '';
        const type = d.type || 'default';
        const date = d.date || '';
        const typeName = getType(type).label;

        const lines = [];
        lines.push(name);
        if (desc) lines.push(desc);
        if (stay) lines.push(`逗留：${stay}`);
        if (weather) lines.push(`天气：${weather}`);
        if (typeName) lines.push(`类型：${typeName}`);
        if (date) lines.push(`日期：${date}`);

        const dialogPadX = 12;
        const dialogPadY = 8;
        const lineHeight = 18;
        const dialogWidth = 160;
        const dialogHeight = lines.length * lineHeight + dialogPadY * 2;

        let dialogX = x + 24;
        if (dialogX + dialogWidth > W - PAD) dialogX = x - dialogWidth - 24;
        let dialogY = y - dialogHeight / 2;

        return { x: dialogX, y: dialogY, w: dialogWidth, h: dialogHeight, lines, dialogPadX, dialogPadY, lineHeight };
    });

    // Resolve dialog overlaps
    let stable = false;
    let iter = 0;
    while (!stable && iter < 30) {
        stable = true;
        iter++;
        for (let a = 0; a < dialogs.length; a++) {
            for (let b = a + 1; b < dialogs.length; b++) {
                const da = dialogs[a];
                const db = dialogs[b];
                const overlapX = Math.min(da.x + da.w, db.x + db.w) - Math.max(da.x, db.x);
                const overlapY = Math.min(da.y + da.h, db.y + db.h) - Math.max(da.y, db.y);
                if (overlapX > 0 && overlapY > 0) {
                    const gap = 8;
                    if (da.y <= db.y) {
                        db.y = da.y + da.h + gap;
                    } else {
                        da.y = db.y + db.h + gap;
                    }
                    stable = false;
                }
            }
        }
    }

    // Clamp to bounds
    dialogs.forEach(d => {
        if (d.y < PAD) d.y = PAD;
        if (d.y + d.h > H - PAD) d.y = H - PAD - d.h;
    });

    // Draw dialogs
    dialogs.forEach(d => {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = '#3498db';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const radius = 6;
        ctx.moveTo(d.x + radius, d.y);
        ctx.lineTo(d.x + d.w - radius, d.y);
        ctx.quadraticCurveTo(d.x + d.w, d.y, d.x + d.w, d.y + radius);
        ctx.lineTo(d.x + d.w, d.y + d.h - radius);
        ctx.quadraticCurveTo(d.x + d.w, d.y + d.h, d.x + d.w - radius, d.y + d.h);
        ctx.lineTo(d.x + radius, d.y + d.h);
        ctx.quadraticCurveTo(d.x, d.y + d.h, d.x, d.y + d.h - radius);
        ctx.lineTo(d.x, d.y + radius);
        ctx.quadraticCurveTo(d.x, d.y, d.x + radius, d.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        let textY = d.y + d.dialogPadY;

        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 13px "Microsoft YaHei", sans-serif';
        ctx.fillText(d.lines[0], d.x + d.dialogPadX, textY, d.w - d.dialogPadX * 2);
        textY += d.lineHeight;

        ctx.fillStyle = '#555';
        ctx.font = '11px "Microsoft YaHei", sans-serif';
        for (let j = 1; j < d.lines.length; j++) {
            ctx.fillText(d.lines[j], d.x + d.dialogPadX, textY, d.w - d.dialogPadX * 2);
            textY += d.lineHeight;
        }
    });
}

function downloadPreview() {
    const canvas = document.getElementById('previewCanvas');
    const link = document.createElement('a');
    link.download = '路线预览.png';
    link.href = canvas.toDataURL();
    link.click();
}

// 9. 加载指定攻略
function loadItinerary(name) {
    if (!name) return;
    currentName = name;
    markers.forEach(m => m.setMap(null));
    markers = [];
    const itinerary = dataStore.itineraries.find(i => i.name === name);
    if (!itinerary) return;
    itinerary.markers.forEach(item => {
        const itemTitle = item.ext._title || item.title || '';
        const itemType = item.ext.type || 'default';
        const marker = new AMap.Marker({
            position: item.pos,
            title: itemTitle,
            extData: item.ext,
            content: markerContent(itemTitle, itemType),
            offset: new AMap.Pixel(-18, -18),
            map: map
        });
        marker._id = markerIdCounter++;
        attachMarkerEdit(marker);
        markers.push(marker);
    });
    refreshMarkerLabels();
    if (markers.length >= 2) updateRoute();
    else renderPointList();
}

// 8. 本地保存
async function saveAll() {
    await autoSave();
    alert('保存成功！');
    refreshList();
}

function createNew() {
    const name = prompt('攻略名称:');
    if(name) {
        if (dataStore.itineraries.find(i => i.name === name)) {
            return alert('攻略名称已存在');
        }
        currentName = name;
        markers.forEach(m => m.setMap(null));
        markers = [];
        dataStore.itineraries.push({ name, markers: [] });
        dataStore.current = name;
        refreshList();
        autoSave();
    }
}

function refreshList() {
    const list = document.getElementById('itineraryList');
    list.innerHTML = '';
    dataStore.itineraries.forEach(i => {
        list.innerHTML += `<option value="${i.name}" ${i.name===currentName?'selected':''}>${i.name}</option>`;
    });
    loadItinerary(currentName);
}

function togglePanel() {
    const p = document.getElementById('panel');
    p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

async function loadDataStore() {
    // 优先从关联的本地数据文件加载
    try {
        const fsStatus = await initFileSystem();
        if (fsStatus === 'loaded' && currentFileHandle) {
            try {
                const data = await loadFromHandle(currentFileHandle);
                dataStore = data;
                currentName = dataStore.current || '默认行程';
                updateFileStatus();
                refreshList();
                return;
            } catch(e) {
                showError('从数据文件加载失败，切换为本地存储');
            }
        }
    } catch(e) {}

    // 降级到 localStorage
    try {
        const saved = localStorage.getItem('traveltool_data');
        if (saved) {
            dataStore = JSON.parse(saved);
            currentName = dataStore.current || '默认行程';
        } else {
            const oldKeys = Object.keys(localStorage).filter(k => k.startsWith('itinerary_'));
            if (oldKeys.length > 0) {
                dataStore.itineraries = oldKeys.map(k => ({
                    name: k.replace('itinerary_', ''),
                    markers: JSON.parse(localStorage.getItem(k)) || []
                }));
                dataStore.current = dataStore.itineraries[0].name;
                currentName = dataStore.current;
                localStorage.setItem('traveltool_data', JSON.stringify(dataStore));
                oldKeys.forEach(k => localStorage.removeItem(k));
            }
        }
    } catch(e) {}
    updateFileStatus();
    refreshList();
}

function updateFileStatus() {
    const el = document.getElementById('fileStatus');
    if (!el) return;
    if (currentFileHandle) {
        el.textContent = '📁 ' + currentFileName;
        el.style.color = '#2ecc71';
        el.title = '点击切换数据文件';
    } else {
        el.textContent = '⚠️ 未关联文件';
        el.style.color = '#e67e22';
        el.title = '点击关联数据文件，实现自动持久化';
    }
}

async function linkDataFile() {
    const handle = await pickDataFile();
    if (!handle) return;
    try {
        const data = await loadFromHandle(handle);
        dataStore = data;
        currentName = dataStore.current || '默认行程';
        localStorage.setItem('traveltool_data', JSON.stringify(dataStore));
        markers.forEach(m => m.setMap(null));
        markers = [];
        refreshList();
        updateFileStatus();
        showError('已关联数据文件: ' + currentFileName);
    } catch(e) {
        showError('文件格式错误，无法加载');
    }
}

async function createNewDataFile() {
    const handle = await createDataFile();
    if (!handle) return;
    const data = await loadFromHandle(handle);
    dataStore = data;
    currentName = dataStore.current || '默认行程';
    localStorage.setItem('traveltool_data', JSON.stringify(dataStore));
    markers.forEach(m => m.setMap(null));
    markers = [];
    refreshList();
    updateFileStatus();
    showError('已创建并关联数据文件: ' + currentFileName);
}

async function exportToFile() {
    await autoSave();
    try {
        const handle = await window.showSaveFilePicker({
            suggestedName: 'travel_data.json',
            types: [{ description: '数据文件', accept: { 'application/json': ['.json'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(dataStore, null, 2));
        await writable.close();
        alert('导出成功！');
    } catch(e) {
        if (e.name !== 'AbortError') showError('导出失败：' + e.message);
    }
}

async function importFromFile() {
    try {
        const [handle] = await window.showOpenFilePicker({
            types: [{ description: '数据文件', accept: { 'application/json': ['.json'] } }],
            multiple: false
        });
        const file = await handle.getFile();
        const data = JSON.parse(await file.text());
        dataStore = data;
        currentName = dataStore.current || '默认行程';
        localStorage.setItem('traveltool_data', JSON.stringify(dataStore));
        refreshList();
        alert('导入成功！');
    } catch(e) {
        if (e.name !== 'AbortError') showError('导入失败：' + e.message);
    }
}

loadDataStore();