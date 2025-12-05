// =================================================================
// CONFIGURACIÓN GLOBAL
// =================================================================
const SUPABASE_URL = "https://psigeyjvvmzdiidtoypq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzaWdleWp2dm16ZGlpZHRveXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMzE4MTEsImV4cCI6MjA3NjgwNzgxMX0.bwlxcwO4Yun78QpEMHDHl9ovqwl_a5d0-EKalOArBSs";
const OPENWEATHER_API_KEY = "78bb833c2b996c4c4d5918990f711c17";
const WEATHER_LAT = -34.1683; 
const WEATHER_LON = -58.9567; 

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let isAuthenticated = false;
let currentUserId = null;
let isDataLoaded = false;
let hivesMeta = [];
let latestSensorData = {};
let weatherData = null;
let activeCharts = {};
let selectedGraphs = []; // Para filtros en detalle

// Configuración de Alertas por Defecto
let alertsConfig = {
    id: 1, min_weight: 5.0, max_temp: 35.0, min_temp: 15.0, max_audio: 2500.0
};

// =================================================================
// ENRUTAMIENTO
// =================================================================

// Definimos las rutas y funciones asociadas
const routes = {
    'dashboard': renderPublicDashboard,
    'detail': renderHiveDetail,
    'admin': renderAdminPanel,
    'edit': renderEditHiveForm
};

function navigate(path, id = null) {
    let hash = path;
    if (id !== null) hash += `/${id}`;
    window.location.hash = hash;
}

function handleRoute() {
    destroyAllCharts(); // Limpiar gráficos viejos
    const hash = window.location.hash.replace('#', '');
    let [path, id] = hash.split('/');
    
    const content = document.getElementById('content');
    
    if (!isDataLoaded) {
         if (!document.getElementById('loading-spinner')) {
             content.innerHTML = `<div id="loading-spinner" class="flex justify-center items-center h-64"><div class="loader mr-3"></div><p class="text-secondary font-medium">Cargando datos...</p></div>`;
         }
         return;
    }

    content.innerHTML = ''; 
    if (!path) path = 'dashboard';

    // Mostrar barra de clima en dashboard y admin
    if (path === 'dashboard' || path === 'admin') {
        content.innerHTML += renderWeatherBar();
    }

    if (routes[path]) {
        routes[path](id); // Ejecutar la función de renderizado correspondiente
    } else {
        content.innerHTML = '<div class="text-center p-12 text-red-500">Ruta no encontrada (404)</div>';
    }
    
    updateAdminButton();
    initializeIcons();
}

window.addEventListener('hashchange', handleRoute);

// =================================================================
// UTILIDADES UI
// =================================================================

function showModal(title, message) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').textContent = message;
    document.getElementById('modal-container').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal-container').classList.add('hidden');
}

function closeLoginModal() {
    document.getElementById('login-modal').classList.add('hidden');
}

function initializeIcons() {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

function destroyAllCharts() {
    Object.values(activeCharts).forEach(chart => {
        if (chart) chart.destroy();
    });
    activeCharts = {};
}

function isReportStale(lastReport) {
    if (!lastReport) return true;
    // Consideramos obsoleto si tiene más de 60 minutos
    return (new Date().getTime() - new Date(lastReport).getTime()) > (60 * 60 * 1000);
}

function mapWeatherIcon(iconCode) {
    if (!iconCode) return 'cloud';
    const map = {
        '01d': 'sun', '01n': 'moon', '02d': 'cloud-sun', '02n': 'cloud-moon',
        '03d': 'cloud', '03n': 'cloud', '04d': 'cloudy', '04n': 'cloudy',
        '09d': 'cloud-rain', '10d': 'cloud-drizzle', '11d': 'cloud-lightning'
    };
    return map[iconCode] || 'cloud';
}

function updateAdminButton() {
    const btn = document.getElementById('admin-toggle');
    if (!btn) return;
    const hash = window.location.hash;

    if (isAuthenticated) {
        if (hash.includes('#admin') || hash.includes('#edit')) {
            btn.textContent = 'Cerrar Sesión';
            btn.onclick = handleLogout;
        } else {
            btn.textContent = 'Panel de Admin';
            btn.onclick = () => navigate('admin');
        }
    } else {
        btn.textContent = 'Acceso Admin';
        btn.onclick = () => {
            document.getElementById('login-modal').classList.remove('hidden');
            document.getElementById('login-error').classList.add('hidden');
            initializeIcons();
        };
    }
}

// =================================================================
// AUTENTICACIÓN
// =================================================================

supabaseClient.auth.onAuthStateChange((event, session) => {
    isAuthenticated = !!session;
    currentUserId = session ? session.user.id : null;
    updateAdminButton();
    
    const hash = window.location.hash;
    if (isAuthenticated && event === 'SIGNED_IN' && !hash.includes('#admin')) {
        navigate('admin');
    }
});

async function handleLogin() {
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;
    const errEl = document.getElementById('login-error');
    
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
        errEl.textContent = "Error: " + error.message;
        errEl.classList.remove('hidden');
    } else {
        closeLoginModal();
    }
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    showModal("Sesión Cerrada", "Has cerrado sesión correctamente.");
    navigate('dashboard');
}

// =================================================================
// DATOS Y API
// =================================================================

async function fetchWeatherData() {
    try {
        const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${WEATHER_LAT}&lon=${WEATHER_LON}&units=metric&lang=es&appid=${OPENWEATHER_API_KEY}`;
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${WEATHER_LAT}&lon=${WEATHER_LON}&units=metric&lang=es&appid=${OPENWEATHER_API_KEY}`;
        
        const [currRes, foreRes] = await Promise.all([fetch(currentUrl), fetch(forecastUrl)]);
        if (!currRes.ok || !foreRes.ok) throw new Error("Error API Clima");
        
        const currData = await currRes.json();
        const foreData = await foreRes.json();

        const forecast = [];
        const days = new Set();
        const today = new Date().toDateString();

        for (const item of foreData.list) {
            const d = new Date(item.dt * 1000);
            if (d.toDateString() !== today && !days.has(d.toDateString())) {
                forecast.push({
                    day: d.toLocaleDateString('es-ES', { weekday: 'short' }),
                    temp: Math.round(item.main.temp_max),
                    icon: mapWeatherIcon(item.weather[0].icon)
                });
                days.add(d.toDateString());
                if (forecast.length >= 3) break;
            }
        }

        return {
            location: currData.name,
            current: {
                temp: Math.round(currData.main.temp),
                description: currData.weather[0].description,
                icon: mapWeatherIcon(currData.weather[0].icon)
            },
            forecast
        };
    } catch (e) {
        console.error(e);
        return { location: 'Offline', current: { temp: '-', description: 'Sin datos', icon: 'cloud-off' }, forecast: [] };
    }
}

async function fetchData() {
    // 1. Configuración de Alertas
    const { data: conf } = await supabaseClient.from('alerts_config').select('*').single();
    if (conf) alertsConfig = conf;

    // 2. Clima
    weatherData = await fetchWeatherData();

    // 3. Metadatos
    const { data: meta, error } = await supabaseClient
        .from('hives_meta')
        .select('*')
        .order('hive_id', { ascending: true });
    
    if (error) {
        console.error("Error Supabase:", error);
        hivesMeta = [];
    } else {
        hivesMeta = meta;
    }

    // 4. Últimos Sensores
    latestSensorData = {};
    const promises = hivesMeta.map(h => 
        supabaseClient.from('sensor_data')
            .select('*')
            .eq('hive_id', h.hive_id)
            .order('created_at', { ascending: false })
            .limit(1)
    );
    
    const results = await Promise.all(promises);
    results.forEach((res, i) => {
        if (res.data && res.data.length > 0) {
            latestSensorData[res.data[0].hive_id] = res.data[0];
        }
    });

    isDataLoaded = true;
    document.getElementById('loading-spinner')?.classList.add('hidden');
    handleRoute();
}

async function fetchHiveHistory(hiveId, filters = {}) {
    let query = supabaseClient.from('sensor_data')
        .select('*')
        .eq('hive_id', hiveId)
        .order('created_at', { ascending: false }); // Descendente para obtener los más recientes primero

    if (filters.startDate) query = query.gte('created_at', filters.startDate.toISOString());
    if (filters.endDate) query = query.lte('created_at', filters.endDate.toISOString());

    // Si hay filtro de fecha, traemos más puntos, si no, solo 50
    const limit = (filters.startDate || filters.endDate) ? 2000 : 50;
    query = query.limit(limit);

    const { data, error } = await query;
    if (error) return [];
    return data.reverse(); // Invertir para Chart.js (cronológico)
}

// =================================================================
// RENDERIZADO DE VISTAS
// =================================================================

function renderPublicDashboard() {
    const content = document.getElementById('content');
    
    // Alertas
    const alerts = hivesMeta.filter(h => {
        const d = latestSensorData[h.hive_id];
        if (!d) return isReportStale(null);
        return d.temperature_c > alertsConfig.max_temp || 
               d.weight_kg < alertsConfig.min_weight || 
               isReportStale(d.created_at);
    });

    let alertsHtml = '';
    if (alerts.length > 0) {
        alertsHtml = alerts.map(h => `
            <div class="flex justify-between items-center bg-white p-3 rounded border-l-4 border-red-500 mb-2 shadow-sm">
                <div class="flex items-center text-red-700">
                    <i data-lucide="alert-triangle" class="mr-2 w-5 h-5"></i>
                    <span class="font-bold">Colmena ${h.hive_id}: Atención Requerida</span>
                </div>
                <button onclick="navigate('detail', ${h.hive_id})" class="text-blue-600 text-sm hover:underline">Ver</button>
            </div>
        `).join('');
    } else {
        alertsHtml = '<p class="text-gray-500 italic">No hay alertas activas.</p>';
    }

    const alertsSection = `
        <div class="mb-8">
            <h2 class="text-xl font-bold text-secondary mb-4 flex items-center"><i data-lucide="siren" class="mr-2 text-red-500"></i> Alertas (${alerts.length})</h2>
            ${alertsHtml}
        </div>
    `;

    // Tarjetas
    const cards = hivesMeta.map(h => {
        const d = latestSensorData[h.hive_id];
        let statusColor = 'bg-gray-400', statusText = 'Sin Datos';
        
        if (d) {
            if (isReportStale(d.created_at)) { statusColor = 'bg-orange-400'; statusText = 'Antiguo'; }
            else if (d.temperature_c > alertsConfig.max_temp) { statusColor = 'bg-red-500'; statusText = 'Alerta'; }
            else { statusColor = 'bg-green-500'; statusText = 'Normal'; }
        }

        const icons = d ? `
            <div class="flex justify-center gap-3 mt-4">
                <div class="text-center"><i data-lucide="thermometer" class="mx-auto text-red-500 w-5 h-5"></i><span class="text-xs font-bold">${d.temperature_c.toFixed(1)}</span></div>
                <div class="text-center"><i data-lucide="scale" class="mx-auto text-green-500 w-5 h-5"></i><span class="text-xs font-bold">${d.weight_kg.toFixed(1)}</span></div>
                <div class="text-center"><i data-lucide="droplet" class="mx-auto text-blue-500 w-5 h-5"></i><span class="text-xs font-bold">${d.humidity_pct.toFixed(0)}</span></div>
            </div>
        ` : '<p class="text-center text-xs text-gray-400 mt-4">Esperando datos...</p>';

        const svgHive = `<svg viewBox="0 0 100 120" class="w-full h-full" fill="none"><g stroke="#3C2F2F" stroke-width="2"><rect x="5" y="5" width="90" height="15" fill="#3C2F2F" rx="3"/><rect x="10" y="22" width="80" height="30" fill="#FFC300" rx="2"/><rect x="10" y="55" width="80" height="40" fill="#FFC300" rx="2"/><rect x="35" y="85" width="30" height="5" fill="#3C2F2F" rx="1"/><rect x="8" y="98" width="84" height="10" fill="#3C2F2F" rx="2"/><rect x="15" y="108" width="10" height="7" fill="#3C2F2F"/><rect x="75" y="108" width="10" height="7" fill="#3C2F2F"/></g></svg>`;

        return `
            <div onclick="navigate('detail', ${h.hive_id})" class="bg-white p-4 rounded-xl shadow-lg hover:shadow-xl cursor-pointer border-t-8 border-primary transition-transform hover:-translate-y-1">
                <div class="w-24 h-24 mx-auto mb-2">${svgHive}</div>
                <h3 class="text-lg font-bold text-center text-secondary">${h.name}</h3>
                <p class="text-xs text-center text-gray-500 mb-2">${h.location}</p>
                <div class="flex justify-center items-center mb-2"><div class="w-2 h-2 rounded-full ${statusColor} mr-2"></div><span class="text-xs font-bold text-gray-600">${statusText}</span></div>
                ${icons}
            </div>
        `;
    }).join('');

    content.innerHTML += `
        ${alertsSection}
        <h2 class="text-xl font-bold text-secondary mb-4 mt-6"><i data-lucide="grid" class="mr-2"></i> Vista General</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">${cards}</div>
    `;
    initializeIcons();
}

// =================================================================
// VISTA DETALLE (Gráficos y Filtros)
// =================================================================

async function renderHiveDetail(hiveIdStr) {
    const content = document.getElementById('content');
    const hiveId = parseInt(hiveIdStr);
    const hive = hivesMeta.find(h => h.hive_id === hiveId);
    const data = latestSensorData[hiveId];
    selectedGraphs = []; // Reset

    if (!hive) { content.innerHTML = '<p class="text-red-500">No encontrada</p>'; return; }

    content.innerHTML = `<div class="text-center py-10"><div class="loader mx-auto"></div><p>Cargando historial...</p></div>`;

    const history = await fetchHiveHistory(hiveId);
    
    // Diagnóstico
    const diag = [];
    if (!data || isReportStale(data.created_at)) diag.push({ icon: 'wifi-off', color: 'text-red-500', text: 'Desconectado o sin datos recientes.' });
    else diag.push({ icon: 'wifi', color: 'text-green-500', text: 'Conexión estable.' });
    
    if (data && data.temperature_c > alertsConfig.max_temp) diag.push({ icon: 'thermometer', color: 'text-red-500', text: `Temperatura Alta (${data.temperature_c}°C)` });
    
    const diagHtml = diag.map(d => `<li class="flex items-center gap-2 text-sm"><i data-lucide="${d.icon}" class="${d.color} w-4 h-4"></i> ${d.text}</li>`).join('');

    // Tarjetas 2x2 en móvil
    const cardsHtml = data ? `
        <div class="grid grid-cols-2 md:grid-cols-2 gap-3 sm:gap-6 mb-6">
            <div id="sensor-card-temp" onclick="toggleGraph('temp')" class="bg-red-50 p-3 rounded-lg border-l-4 border-red-500 cursor-pointer transition-opacity duration-300">
                <h4 class="text-red-800 text-xs font-bold uppercase">Temp</h4>
                <p class="text-2xl font-bold text-red-900">${data.temperature_c.toFixed(1)}°C</p>
            </div>
            <div id="sensor-card-weight" onclick="toggleGraph('weight')" class="bg-green-50 p-3 rounded-lg border-l-4 border-green-500 cursor-pointer transition-opacity duration-300">
                <h4 class="text-green-800 text-xs font-bold uppercase">Peso</h4>
                <p class="text-2xl font-bold text-green-900">${data.weight_kg.toFixed(2)}kg</p>
            </div>
            <div id="sensor-card-humid" onclick="toggleGraph('humid')" class="bg-blue-50 p-3 rounded-lg border-l-4 border-blue-500 cursor-pointer transition-opacity duration-300">
                <h4 class="text-blue-800 text-xs font-bold uppercase">Humedad</h4>
                <p class="text-2xl font-bold text-blue-900">${data.humidity_pct.toFixed(0)}%</p>
            </div>
            <div id="sensor-card-audio" onclick="toggleGraph('audio')" class="bg-yellow-50 p-3 rounded-lg border-l-4 border-yellow-500 cursor-pointer transition-opacity duration-300">
                <h4 class="text-yellow-800 text-xs font-bold uppercase">Audio</h4>
                <p class="text-2xl font-bold text-yellow-900">${data.audio_freq_avg.toFixed(0)}</p>
            </div>
        </div>
    ` : '';

    // Twitch
    const twitchHtml = hive.twitch_channel_name ? `
        <div class="mb-6 rounded-xl overflow-hidden shadow-lg bg-black aspect-video">
            <iframe src="https://player.twitch.tv/?channel=${hive.twitch_channel_name}&parent=${window.location.hostname}&autoplay=false&muted=true" class="w-full h-full border-none"></iframe>
        </div>
    ` : '';

    // HTML Final
    content.innerHTML = `
        <div class="mb-6">
            <button onclick="navigate('dashboard')" class="text-blue-600 hover:underline mb-4 flex items-center gap-1"><i data-lucide="arrow-left" class="w-4 h-4"></i> Volver</button>
            <h2 class="text-2xl font-bold text-secondary">${hive.name}</h2>
            <p class="text-sm text-gray-500 mb-4">${hive.location} (ID: ${hive.hive_id})</p>
            
            ${dataHtml}
            
            <div class="bg-white p-4 rounded-xl shadow mb-6">
                <h3 class="font-bold text-secondary mb-2">Diagnóstico</h3>
                <ul class="space-y-1">${diagHtml}</ul>
            </div>

            ${twitchHtml}

            <div class="bg-white p-4 rounded-xl shadow mb-6">
                <h3 class="font-bold text-secondary mb-4">Historial y Filtros</h3>
                <!-- Filtros -->
                <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4 items-end">
                    <div><label class="text-xs">Inicio</label><input type="date" id="f-start" class="w-full border p-1 rounded text-sm"></div>
                    <div><label class="text-xs">Fin</label><input type="date" id="f-end" class="w-full border p-1 rounded text-sm"></div>
                    <div><label class="text-xs">Hora In</label><input type="time" id="f-hstart" class="w-full border p-1 rounded text-sm"></div>
                    <div><label class="text-xs">Hora Fin</label><input type="time" id="f-hend" class="w-full border p-1 rounded text-sm"></div>
                    <button onclick="applyFilters(${hiveId})" class="bg-blue-600 text-white py-1 px-3 rounded text-sm h-8 col-span-2 md:col-span-1">Filtrar</button>
                </div>
                <!-- Gráficos -->
                <div id="graphs-grid" class="grid grid-cols-1 md:grid-cols-2 gap-6" id="charts-section-container">
                    <div id="box-temp" class="h-64 bg-gray-50 rounded p-2 shadow"><canvas id="chart-temp"></canvas></div>
                    <div id="box-weight" class="h-64 bg-gray-50 rounded p-2 shadow"><canvas id="chart-weight"></canvas></div>
                    <div id="box-humid" class="h-64 bg-gray-50 rounded p-2 shadow"><canvas id="chart-humid"></canvas></div>
                    <div id="box-audio" class="h-64 bg-gray-50 rounded p-2 shadow"><canvas id="chart-audio"></canvas></div>
                </div>
            </div>
        </div>
    `;

    // Renderizar gráficos iniciales
    setTimeout(() => drawCharts(history), 50);
    initializeIcons();
}

// Funciones de Gráficos
function drawCharts(data) {
    if (!data || !data.length) return;
    const labels = data.map(d => new Date(d.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}));
    
    const cfgs = [
        { id: 'chart-temp', label: 'Temp (°C)', key: 'temperature_c', color: 'rgb(239, 68, 68)' },
        { id: 'chart-weight', label: 'Peso (kg)', key: 'weight_kg', color: 'rgb(34, 197, 94)' },
        { id: 'chart-humid', label: 'Humedad (%)', key: 'humidity_pct', color: 'rgb(59, 130, 246)' },
        { id: 'chart-audio', label: 'Audio', key: 'audio_freq_avg', color: 'rgb(234, 179, 8)' }
    ];

    destroyAllCharts();
    cfgs.forEach(c => {
        const ctx = document.getElementById(c.id);
        if(ctx) {
            activeCharts[c.id] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{ label: c.label, data: data.map(d => d[c.key]), borderColor: c.color, tension: 0.3 }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }
    });
}

function toggleGraph(type) {
    const map = { 'temp': 'box-temp', 'weight': 'box-weight', 'humid': 'box-humid', 'audio': 'box-audio' };
    const boxId = map[type];
    
    // Lógica de selección cíclica
    if (selectedGraphs.length === 4) selectedGraphs = []; // Reset si todos estaban seleccionados
    
    const idx = selectedGraphs.indexOf(boxId);
    if (idx > -1) selectedGraphs.splice(idx, 1);
    else selectedGraphs.push(boxId);

    // Si está vacío, asumimos todos
    const active = selectedGraphs.length > 0 ? selectedGraphs : Object.values(map);

    // Actualizar UI
    Object.values(map).forEach(id => {
        const el = document.getElementById(id);
        const card = document.getElementById(id.replace('box', 'sensor-card')); // sensor-card-temp
        if(active.includes(id)) {
            el.style.display = 'block';
            card.classList.remove('opacity-50');
        } else {
            el.style.display = 'none';
            card.classList.add('opacity-50');
        }
    });

    // Full width si es 1 o 3
    const grid = document.getElementById('graphs-grid');
    if(active.length === 1 || active.length === 3) {
        grid.classList.remove('md:grid-cols-2');
        grid.classList.add('grid-cols-1');
    } else {
        grid.classList.add('md:grid-cols-2');
        grid.classList.remove('grid-cols-1');
    }
    
    // Scroll
    document.getElementById('graphs-grid').scrollIntoView({behavior: 'smooth'});
}

async function applyFilters(hiveId) {
    const start = document.getElementById('f-start').value;
    const end = document.getElementById('f-end').value;
    const hStart = document.getElementById('f-hstart').value;
    const hEnd = document.getElementById('f-hend').value;
    
    let data = await fetchHiveHistory(hiveId, { 
        startDate: start ? new Date(start) : null, 
        endDate: end ? new Date(end + 'T23:59:59') : null 
    });

    if (hStart && hEnd) {
        // Filtro de hora manual (simple)
        const s = parseInt(hStart.replace(':',''));
        const e = parseInt(hEnd.replace(':',''));
        data = data.filter(d => {
            const t = new Date(d.created_at);
            const curr = t.getHours()*100 + t.getMinutes();
            return curr >= s && curr <= e;
        });
    }
    
    drawCharts(data);
}


// =================================================================
// VISTA ADMIN
// =================================================================

function renderAdminPanel() {
    const content = document.getElementById('content');
    if (!isAuthenticated) { navigate('dashboard'); return; }

    const rows = hivesMeta.map(h => {
        const d = latestSensorData[h.hive_id];
        const stale = (!d || isReportStale(d.created_at));
        const statusCls = stale ? 'text-gray-400' : 'text-green-600';
        const statusTxt = stale ? 'Inactivo' : 'Activo';
        
        const pending = h.tare_command === 'TARE_REQUESTED';
        const btnTare = pending ? 
            `<span class="text-xs text-orange-500 animate-pulse">...</span>` :
            `<button onclick="handleTare(${h.hive_id})" class="text-blue-600"><i data-lucide="rotate-ccw" class="w-4 h-4"></i></button>`;

        return `
            <tr class="border-b hover:bg-yellow-50">
                <td class="p-3 text-sm font-bold">${h.hive_id}</td>
                <td class="p-3 text-sm">${h.name}</td>
                <td class="p-3 text-sm hidden sm:table-cell">${h.location}</td>
                <td class="p-3 text-sm font-bold ${statusCls}">${statusTxt}</td>
                <td class="p-3 text-center gap-2 flex justify-center">
                    ${btnTare}
                    <button onclick="navigate('edit', ${h.hive_id})" class="text-gray-600"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                    <button onclick="deleteHive(${h.hive_id})" class="text-red-600"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-secondary">Administración</h2>
            <button onclick="navigate('edit', 'new')" class="bg-green-500 text-white px-4 py-2 rounded shadow text-sm">+ Nueva</button>
        </div>
        <div class="bg-white rounded shadow overflow-x-auto">
            <table class="w-full">
                <thead class="bg-primary text-left"><tr><th class="p-3">ID</th><th class="p-3">Nombre</th><th class="p-3 hidden sm:table-cell">Ubicación</th><th class="p-3">Estado</th><th class="p-3 text-center">Acciones</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
    initializeIcons();
}

function renderEditHiveForm(id) {
    const content = document.getElementById('content');
    if(!isAuthenticated) { navigate('dashboard'); return; }
    
    const isNew = id === 'new';
    const h = isNew ? { hive_id: '', name: '', location: '', notes: '', twitch_channel_name: '' } : hivesMeta.find(x => x.hive_id == id);
    
    content.innerHTML = `
        <div class="max-w-md mx-auto bg-white p-6 rounded shadow mt-4">
            <h2 class="text-xl font-bold mb-4">${isNew ? 'Nueva Colmena' : 'Editar Colmena'}</h2>
            <form id="form-hive">
                <div class="mb-3"><label class="text-xs font-bold">ID ESP32</label><input type="number" name="hive_id" value="${h.hive_id}" class="w-full border p-2 rounded"></div>
                <div class="mb-3"><label class="text-xs font-bold">Nombre</label><input type="text" name="name" value="${h.name}" class="w-full border p-2 rounded"></div>
                <div class="mb-3"><label class="text-xs font-bold">Ubicación</label><input type="text" name="location" value="${h.location}" class="w-full border p-2 rounded"></div>
                <div class="mb-3"><label class="text-xs font-bold">Canal Twitch</label><input type="text" name="twitch" value="${h.twitch_channel_name||''}" class="w-full border p-2 rounded"></div>
                <button type="submit" class="w-full bg-primary py-2 rounded font-bold mt-2">Guardar</button>
            </form>
        </div>
    `;
    document.getElementById('form-hive').onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        saveHive({
            hive_id: fd.get('hive_id'),
            name: fd.get('name'),
            location: fd.get('location'),
            twitch_channel_name: fd.get('twitch'),
            status: 'Normal'
        }, isNew);
    };
}

// Acciones de DB
async function saveHive(data, isNew) {
    const query = supabaseClient.from('hives_meta');
    const res = isNew ? await query.insert([data]) : await query.update(data).eq('hive_id', data.hive_id);
    if(res.error) alert("Error: " + res.error.message);
    else { await fetchData(); navigate('admin'); }
}

async function deleteHive(id) {
    if(!confirm("¿Eliminar?")) return;
    const { error } = await supabaseClient.from('hives_meta').delete().eq('hive_id', id);
    if(error) alert("Error: " + error.message);
    else { await fetchData(); renderAdminPanel(); }
}

async function handleTare(id) {
    const { error } = await supabaseClient.from('hives_meta').update({ tare_command: 'TARE_REQUESTED' }).eq('hive_id', id);
    if(error) alert("Error al enviar Tara");
    else { 
        const h = hivesMeta.find(x => x.hive_id == id);
        if(h) h.tare_command = 'TARE_REQUESTED';
        renderAdminPanel();
    }
}