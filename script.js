// =================================================================
// 🐝 APIARIO DIGITAL - SCRIPT DE LÓGICA PRINCIPAL
// =================================================================

// =================================================================
// CONFIGURACIÓN Y ESTADO GLOBAL
// =================================================================

// Configuración de Supabase (URL y Clave proporcionadas)
const SUPABASE_URL = "https://psigeyjvvmzdiidtoypq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzaWdleWp2dm16ZGlpZHRveXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMzE4MTEsImV4cCI6MjA3NjgwNzgxMX0.bwlxcwO4Yun78QpEMHDHl9ovqwl_a5d0-EKalOArBSs";

// Configuración de OpenWeatherMap (Clave proporcionada)
const OPENWEATHER_API_KEY = "78bb833c2b996c4c4d5918990f711c17";
// Ubicación de ejemplo: Campana, Argentina (para la API del clima)
const WEATHER_LAT = -34.1636;
const WEATHER_LON = -58.9592;


// Inicialización del cliente Supabase
// Renombrado a supabaseClient para evitar conflictos con el objeto global 'supabase'
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Estado de la aplicación
let isAuthenticated = false;
let currentUserId = null; // ID del usuario autenticado
let activeCharts = {}; // Objeto para almacenar instancias de Chart.js

// Almacenes de datos locales
let hivesMeta = []; // Metadatos de las colmenas (hives_meta)
let latestSensorData = {}; // Últimos datos de sensores (sensor_data)
let weatherData = null; // Datos del clima

// =================================================================
// RUTAS Y NAVEGACIÓN
// =================================================================

// Mapea la ruta (hash) a la función de renderizado
const routes = {
    'dashboard': renderPublicDashboard,
    'detail': renderHiveDetail,
    'admin': renderAdminPanel,
    'edit': renderEditHiveForm
};

// Función para cambiar la URL (hash) y forzar el enrutamiento
function navigate(path, id = null) {
    let hash = path;
    if (id !== null) {
        hash += `/${id}`;
    }
    window.location.hash = hash;
}

// Función principal de enrutamiento
function handleRoute() {
    // Destruir gráficos anteriores antes de cambiar de vista
    Object.values(activeCharts).forEach(chart => chart.destroy());
    activeCharts = {};

    const hash = window.location.hash.replace('#', '');
    let [path, id] = hash.split('/');
    
    const content = document.getElementById('content');
    content.innerHTML = ''; // Limpiar contenido antes de renderizar

    // Si no hay hash, default a dashboard
    if (!path) {
        path = 'dashboard';
    }

    // Renderiza la barra de clima solo en el dashboard
    if (path === 'dashboard') {
        content.innerHTML += renderWeatherBar();
    }

    if (routes[path]) {
        const renderFunction = routes[path];
        // Los render functions son responsables de actualizar #content
        renderFunction(id); 
    } else {
        // Ruta no encontrada
        content.innerHTML += '<div class="text-center p-12 text-red-500">Ruta no encontrada (404)</div>';
    }

    // Volver a inicializar los iconos de Lucide después de inyectar HTML
    initializeIcons();
}

// Escucha cambios en el hash (navegación por el usuario)
window.addEventListener('hashchange', handleRoute);


// =================================================================
// UTILIDADES Y AYUDANTES
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
    // Verifica si lucide está cargado antes de crear los íconos
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

/**
 * Determina si la última hora de reporte fue hace más de 60 minutos.
 * @param {string | null} lastReport ISO date string or null
 * @returns {boolean} True if report is older than 60 mins or null
 */
function isReportStale(lastReport) {
    if (!lastReport) return true;
    const now = new Date();
    const last = new Date(lastReport);
    // 60 minutos * 60 segundos * 1000 milisegundos
    return (now.getTime() - last.getTime()) > (60 * 60 * 1000);
}

// =================================================================
// AUTENTICACIÓN (ADMIN) - USANDO SUPABASE AUTH
// =================================================================

// Observa cambios en el estado de autenticación
supabaseClient.auth.onAuthStateChange((event, session) => {
    isAuthenticated = !!session; // True si hay una sesión activa
    currentUserId = session ? session.user.id : null;
    const toggleButton = document.getElementById('admin-toggle');
    const currentHash = window.location.hash;

    if (isAuthenticated) {
        toggleButton.textContent = 'Cerrar Sesión';
        // Si el usuario se acaba de loguear y no está en admin, lo redirigimos
        if (!currentHash.includes('#admin') && !currentHash.includes('#edit')) {
            navigate('admin');
        }
    } else {
        toggleButton.textContent = 'Acceso Admin';
        // Si el usuario estaba en admin y cerró sesión, lo enviamos al dashboard
        if (currentHash.includes('#admin') || currentHash.includes('#edit')) {
             navigate('dashboard');
        }
    }
});

document.getElementById('admin-toggle').addEventListener('click', () => {
    if (isAuthenticated) {
        handleLogout();
    } else {
        document.getElementById('login-modal').classList.remove('hidden');
        document.getElementById('admin-email').value = '';
        document.getElementById('admin-password').value = '';
        document.getElementById('login-error').classList.add('hidden');
        // Asegurarse de que el icono 'x' se renderice
        initializeIcons(); 
    }
});

async function handleLogin() {
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;
    const errorElement = document.getElementById('login-error');
    errorElement.classList.add('hidden');

    if (!email || !password) {
        errorElement.textContent = "Ingresa email y contraseña.";
        errorElement.classList.remove('hidden');
        return;
    }

    // Llama a la función de Supabase para iniciar sesión
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        console.error("Login Error:", error.message);
        errorElement.textContent = `Error: ${error.message}`;
        errorElement.classList.remove('hidden');
    } else {
        // El onAuthStateChange manejará la actualización de la interfaz y la navegación
        closeLoginModal();
    }
}

async function handleLogout() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        console.error("Logout Error:", error.message);
        showModal("Error al Cerrar Sesión", error.message);
    } else {
        showModal("Sesión Cerrada", "Has cerrado la sesión de administrador exitosamente.");
    }
    // onAuthStateChange manejará la actualización de isAuthenticated y la navegación
}

// =================================================================
// GESTIÓN DE DATOS (SUPABASE Y OPENWEATHERMAP)
// =================================================================

async function fetchData() {
    const loadingSpinner = document.getElementById('loading-spinner');
    if(loadingSpinner) loadingSpinner.classList.remove('hidden');

    try {
        // 1. Obtener Metadatos de Colmenas (hives_meta)
        const { data: metaData, error: metaError } = await supabaseClient
            .from('hives_meta')
            .select('*')
            .order('hive_id', { ascending: true });

        if (metaError) {
            console.error("Error al cargar metadatos:", metaError.message);
            showModal("Error de Conexión", "No se pudieron cargar los metadatos de las colmenas. Verifica las políticas RLS de Supabase. " + metaError.message);
            hivesMeta = [];
        } else {
            hivesMeta = metaData;
        }

        // 2. Obtener los Últimos Datos de Sensores para CADA Colmena
        latestSensorData = {};
        const sensorPromises = hivesMeta.map(hive => 
            supabaseClient
                .from('sensor_data')
                .select('*')
                .eq('hive_id', hive.hive_id)
                .order('created_at', { ascending: false })
                .limit(1)
        );

        const sensorResults = await Promise.all(sensorPromises);
        
        sensorResults.forEach((result, index) => {
            const hiveId = hivesMeta[index].hive_id;
            if (result.error) {
                console.warn(`Error al cargar datos del sensor para ID ${hiveId}:`, result.error.message);
                latestSensorData[hiveId] = null;
            } else if (result.data.length > 0) {
                latestSensorData[hiveId] = result.data[0];
            } else {
                latestSensorData[hiveId] = null;
            }
        });

        // 3. Obtener Datos del Clima (API Real)
        weatherData = await fetchWeatherData();

    } catch (error) {
        console.error("Error fatal en fetchData:", error);
        showModal("Error Crítico", "No se pudo cargar la aplicación. " + error.message);
    } finally {
        if(loadingSpinner) loadingSpinner.classList.add('hidden');
        handleRoute(); // Inicia la app y renderiza la vista inicial
    }
}

/**
 * Mapea los códigos de icono de OpenWeatherMap a los iconos de Lucide.
 * @param {string} iconCode - Código de OpenWeatherMap (ej. "01d", "10n").
 * @returns {string} Nombre del icono de Lucide.
 */
function mapWeatherIcon(iconCode) {
    const map = {
        '01d': 'sun',
        '01n': 'moon',
        '02d': 'cloud-sun',
        '02n': 'cloud-moon',
        '03d': 'cloud',
        '03n': 'cloud',
        '04d': 'cloudy',
        '04n': 'cloudy',
        '09d': 'cloud-rain',
        '09n': 'cloud-rain',
        '10d': 'cloud-drizzle', // Lluvia ligera
        '10n': 'cloud-drizzle',
        '11d': 'cloud-lightning',
        '11n': 'cloud-lightning',
        '13d': 'snowflake',
        '13n': 'snowflake',
        '50d': 'cloud-fog', // Niebla
        '50n': 'cloud-fog',
    };
    return map[iconCode] || 'sun'; // Default
}

/**
 * Obtiene datos del clima de OpenWeatherMap usando los endpoints 2.5 (más accesibles).
 */
async function fetchWeatherData() {
    try {
        const units = 'metric'; // Para Celsius
        const lang = 'es';

        // 1. Obtener Clima Actual (API 2.5)
        const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${WEATHER_LAT}&lon=${WEATHER_LON}&appid=${OPENWEATHER_API_KEY}&units=${units}&lang=${lang}`;
        const currentResponse = await fetch(currentUrl);
        if (!currentResponse.ok) {
            throw new Error(`HTTP error! status: ${currentResponse.status} (Current Weather)`);
        }
        const current = await currentResponse.json();

        // 2. Obtener Pronóstico (API 2.5 - 5 días / 3 horas)
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${WEATHER_LAT}&lon=${WEATHER_LON}&appid=${OPENWEATHER_API_KEY}&units=${units}&lang=${lang}`;
        const forecastResponse = await fetch(forecastUrl);
        if (!forecastResponse.ok) {
            throw new Error(`HTTP error! status: ${forecastResponse.status} (Forecast)`);
        }
        const forecastData = await forecastResponse.json();

        // 3. Procesar el pronóstico para obtener los próximos 3 días (evitando duplicados)
        const dailyForecast = [];
        const seenDays = new Set();
        const today = new Date().toISOString().split('T')[0];
        seenDays.add(today); // No mostrar pronóstico para hoy (ya tenemos el actual)

        for (const item of forecastData.list) {
            const date = item.dt_txt.split(' ')[0];
            // Tomar solo la predicción del mediodía (12:00:00) si está disponible, o la primera del día
            if (!seenDays.has(date) && (item.dt_txt.includes("12:00:00") || dailyForecast.length < 3)) {
                seenDays.add(date);
                dailyForecast.push({
                    day: new Date(item.dt * 1000).toLocaleDateString('es-ES', { weekday: 'long' }),
                    temp: Math.round(item.main.temp_max),
                    icon: mapWeatherIcon(item.weather[0].icon),
                });
                if (dailyForecast.length >= 3) break;
            }
        }

        // 4. Formatear y devolver los datos
        return {
            location: current.name, // Nombre de la ciudad
            current: {
                temp: Math.round(current.main.temp),
                description: current.weather[0].description,
                icon: mapWeatherIcon(current.weather[0].icon),
            },
            forecast: dailyForecast,
        };

    } catch (error) {
        console.error("Error al cargar datos del clima (OpenWeatherMap):", error);
        // Devolver datos mock para que la app no se rompa
        return {
            location: "Error de API",
            current: { temp: '?', description: "No se pudo cargar el clima", icon: "cloud-off" },
            forecast: [
                { day: "Día 1", temp: '?', icon: "cloud-off" },
                { day: "Día 2", temp: '?', icon: "cloud-off" },
                { day: "Día 3", temp: '?', icon: "cloud-off" }
            ]
        };
    }
}


/**
 * Obtiene registros del sensor para una colmena con filtros opcionales.
 * @param {number} hiveId 
 * @param {object | null} filters - { startDate, endDate }
 * @returns {Promise<Array>} Datos históricos.
 */
async function fetchHiveHistory(hiveId, filters = null) {
    let query = supabaseClient
        .from('sensor_data')
        .select('created_at, temperature_c, humidity_pct, weight_kg, audio_freq_avg')
        .eq('hive_id', hiveId);

    if (filters && filters.startDate && filters.endDate) {
        // Filtrar por rango de fechas
        query = query.gte('created_at', filters.startDate);
        query = query.lte('created_at', filters.endDate);
        // Límite de seguridad para evitar sobrecargar el navegador
        query = query.limit(2000); 
    } else {
        // Default: últimos 50 puntos
        query = query.limit(50);
    }
    
    // Siempre ordenar por fecha
    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
        console.error("Error al cargar historial:", error.message);
        return [];
    }

    // Devolver los datos en orden cronológico (ascendente) para el gráfico
    return data.reverse(); 
}

/**
 * Filtra un array de datos (ya filtrado por fecha) por un rango horario.
 * @param {Array} data - Datos de Supabase.
 * @param {string | null} startTime - ej. "08:00"
 * @param {string | null} endTime - ej. "14:00"
 * @returns {Array} Datos filtrados por hora.
 */
function filterDataByTime(data, startTime, endTime) {
    // Si no hay filtros de hora, devolver todos los datos
    if (!startTime || !endTime) return data;

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    return data.filter(d => {
        const date = new Date(d.created_at);
        const hour = date.getHours();
        const minute = date.getMinutes();

        // Comparar horas y minutos
        const afterStart = (hour > startH) || (hour === startH && minute >= startM);
        const beforeEnd = (hour < endH) || (hour === endH && minute <= endM);

        return afterStart && beforeEnd;
    });
}


// =================================================================
// GESTIÓN DE COLMENAS (CRUD - Solo Admin)
// =================================================================

async function saveHive(data, isNew) {
    if (!isAuthenticated) return showModal("Error de Acceso", "Debes estar autenticado para realizar esta acción.");

    let result;
    const dataToSave = { ...data, user_id: currentUserId };

    if (isNew) {
        // INSERT
        result = await supabaseClient
            .from('hives_meta')
            .insert([dataToSave])
            .select();
    } else {
        // UPDATE
        result = await supabaseClient
            .from('hives_meta')
            .update(dataToSave)
            .eq('hive_id', data.hive_id)
            .select();
    }

    if (result.error) {
        console.error("Error al guardar:", result.error.message);
        showModal("Error de Supabase", `No se pudo guardar: ${result.error.message}`);
    } else {
        showModal("Éxito", `Colmena ${isNew ? 'agregada' : 'actualizada'} correctamente.`);
        // Recargar los datos locales (meta y sensores)
        await fetchData();
        // Navegar de vuelta al admin
        navigate('admin');
    }
}

async function deleteHive(hiveId) {
    if (!isAuthenticated) return showModal("Error de Acceso", "Debes estar autenticado para realizar esta acción.");

    // Usar un modal personalizado en lugar de confirm()
    showModal("Confirmar Eliminación", `¿Está seguro de eliminar la Colmena ID ${hiveId}? Esta acción es irreversible.`);
    
    // Esta es una implementación simple de confirmación. Una implementación real
    // modificaría el DOM del modal para añadir un botón "Confirmar".
    // Por simplicidad, usaremos el prompt nativo (aunque no se recomienda).
    
    if (!window.confirm(`¿Está seguro de eliminar la Colmena ID ${hiveId}? Esto eliminará los metadatos de administración.`)) {
        closeModal();
        return;
    }
    closeModal();


    const { error } = await supabaseClient
        .from('hives_meta')
        .delete()
        .eq('hive_id', hiveId);

    if (error) {
        console.error("Error al eliminar:", error.message);
        showModal("Error de Supabase", `No se pudo eliminar: ${error.message}`);
    } else {
        showModal("Eliminado", `Colmena ID ${hiveId} eliminada exitosamente.`);
        // Recargar los datos locales (meta y sensores)
        await fetchData();
    }
}

/**
 * Configura el event listener para el formulario de edición/creación de colmenas.
 * @param {Object} hive - Objeto con los metadatos de la colmena (o un objeto vacío si es nuevo)
 * @param {boolean} isNew - Indica si se está creando una colmena nueva
 */
function setupEditFormListener(hive, isNew) {
    const form = document.getElementById('hive-form');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = {
                hive_id: parseInt(formData.get('hive_id')),
                name: formData.get('name'),
                location: formData.get('location'),
                notes: formData.get('notes'),
                // Corrección: Leer el nombre del canal de Twitch en lugar de la URL
                twitch_channel_name: formData.get('twitch_channel_name') || null, 
                status: hive.status || 'Normal', 
                last_updated: new Date().toISOString()
            };
            saveHive(data, isNew);
        });
    }
}


// =================================================================
// FUNCIONES DE RENDERIZADO MODULAR (PÁGINAS)
// =================================================================

function renderWeatherBar() {
    if (!weatherData) return '';
    const current = weatherData.current;
    const forecastHtml = weatherData.forecast.map(f => `
        <div class="flex flex-col items-center p-2">
            <span class="text-sm font-medium text-gray-700">${f.day}</span>
            <i data-lucide="${f.icon}" class="w-6 h-6 text-blue-500 my-1"></i>
            <span class="text-sm font-bold text-gray-800">${f.temp}°C</span>
        </div>
    `).join('');

    return `
        <div class="bg-blue-100 p-4 rounded-xl shadow-md mb-8 border-l-4 border-blue-500">
            <h2 class="text-xl font-bold text-blue-800 mb-2 flex items-center">
                <i data-lucide="cloud-sun" class="w-6 h-6 mr-2"></i>
                Clima y Pronóstico (${weatherData.location || 'Reserva'})
            </h2>
            <div class="flex justify-between items-center flex-wrap">
                <!-- Clima Actual -->
                <div class="flex items-center space-x-4 mb-4 md:mb-0">
                    <i data-lucide="${current.icon}" class="w-12 h-12 text-blue-500"></i>
                    <div>
                        <p class="text-3xl font-extrabold text-blue-900">${current.temp}°C</p>
                        <p class="text-lg text-blue-700 capitalize">${current.description}</p>
                    </div>
                </div>
                <!-- Pronóstico -->
                <div class="flex space-x-4">
                    ${forecastHtml}
                </div>
            </div>
        </div>
    `;
}

function renderAlertsList() {
     // Lógica de alertas basada en umbrales fijos
    let alertCount = 0;
    const alertsHtml = hivesMeta.map(hive => {
        const data = latestSensorData[hive.hive_id];
        let alertMessages = [];

        if (!data) {
            alertMessages.push('¡INACTIVA! Nunca ha enviado datos o está desconectada.');
        } else {
            if (isReportStale(data.created_at)) {
                alertMessages.push(`¡REPORTE ANTIGUO! Última conexión: ${new Date(data.created_at).toLocaleString('es-ES')}`);
            }
            if (data.temperature_c > 35) {
                alertMessages.push(`Temperatura alta (${data.temperature_c.toFixed(1)}°C). Posible enjambre.`);
            }
            if (data.weight_kg < 5) {
                alertMessages.push(`Peso críticamente bajo (${data.weight_kg.toFixed(1)} kg).`);
            }
            if (data.audio_freq_avg > 2500) {
                 alertMessages.push(`Actividad de audio anormalmente alta.`);
            }
        }
        
        if (alertMessages.length === 0) return '';
        alertCount++;

        return `
            <div class="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm border-l-4 border-red-500 mb-2 hover:shadow-md transition">
                <div class="flex items-center">
                    <i data-lucide="alert-triangle" class="w-6 h-6 text-red-500 mr-3"></i>
                    <div>
                        <p class="font-bold text-red-700">${hive.name} (ID: ${hive.hive_id})</p>
                        ${alertMessages.map(msg => `<p class="text-sm text-gray-600">${msg}</p>`).join('')}
                    </div>
                </div>
                <button onclick="navigate('detail', ${hive.hive_id})" class="text-sm text-blue-500 hover:text-blue-700">Ver Detalles</button>
            </div>
        `;
    }).join('');

    return `
        <div class="mb-8">
            <h2 class="text-2xl font-bold text-secondary mb-4 flex items-center">
                <i data-lucide="siren" class="w-6 h-6 mr-2 text-red-500"></i>
                Alertas del Apiario (${alertCount})
            </h2>
            <div class="space-y-3">
                ${alertCount > 0 ? alertsHtml : '<p class="text-gray-500 italic">No hay alertas activas en este momento.</p>'}
            </div>
        </div>
    `;
}


function renderPublicDashboard() {
    const content = document.getElementById('content');
    
    const hiveCards = hivesMeta.map(hive => {
        const data = latestSensorData[hive.hive_id];
        
        let statusColor = 'bg-gray-400';
        let statusText = 'Sin Datos';

        if (data) {
            if (isReportStale(data.created_at)) {
                statusColor = 'bg-orange-400';
                statusText = 'Reporte Antiguo';
            } else if (data.temperature_c > 35 || data.weight_kg < 5) {
                statusColor = 'bg-red-500';
                statusText = 'Alerta Crítica';
            } else {
                statusColor = 'bg-green-500';
                statusText = 'Normal';
            }
        }

        // Renderiza los iconos de valores sensados
        const sensorIcons = data ? `
            <div class="flex flex-wrap justify-center gap-3">
                <div class="text-center">
                    <i data-lucide="thermometer" class="w-6 h-6 text-red-600 mx-auto"></i>
                    <span class="text-xs font-bold">${data.temperature_c.toFixed(1)}°C</span>
                </div>
                <div class="text-center">
                    <i data-lucide="droplet" class="w-6 h-6 text-blue-600 mx-auto"></i>
                    <span class="text-xs font-bold">${data.humidity_pct.toFixed(1)}%</span>
                </div>
                <div class="text-center">
                    <i data-lucide="scale" class="w-6 h-6 text-green-600 mx-auto"></i>
                    <span class="text-xs font-bold">${data.weight_kg.toFixed(1)} kg</span>
                </div>
                <div class="text-center">
                    <i data-lucide="volume-2" class="w-6 h-6 text-gray-600 mx-auto"></i>
                    <span class="text-xs font-bold">${data.audio_freq_avg.toFixed(0)} ADC</span>
                </div>
            </div>
        ` : '<p class="text-sm text-gray-500">Esperando datos del sensor...</p>';


        return `
            <div onclick="navigate('detail', ${hive.hive_id})" class="bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition cursor-pointer border-t-8 border-primary">
                <div class="hive-svg-container my-4">
                    <div class="hive-shape">
                        <!-- Icono de Hexágono (Panal) -->
                        <i data-lucide="hexagon" class="w-8 h-8 text-secondary"></i>
                    </div>
                </div>
                <h3 class="text-xl font-bold text-center text-secondary mb-2">${hive.name} (ID: ${hive.hive_id})</h3>
                <p class="text-sm text-center text-gray-600 mb-4">${hive.location}</p>

                <!-- Indicador de estado -->
                <div class="flex items-center justify-center mb-4">
                    <div class="w-3 h-3 rounded-full ${statusColor} mr-2 animate-pulse"></div>
                    <span class="font-semibold text-sm text-gray-700">${statusText}</span>
                </div>

                <!-- Iconos de valores sensados -->
                ${sensorIcons}
            </div>
        `;
    }).join('');

    content.innerHTML += `
        ${renderAlertsList()}
        <h2 class="text-2xl font-bold text-secondary mb-4 mt-6">
            <i data-lucide="grid-3x3" class="w-6 h-6 mr-2 text-primary"></i>
            Vista General del Apiario
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${hivesMeta.length > 0 ? hiveCards : '<p class="text-gray-500 italic">No hay colmenas configuradas. Inicia sesión como Admin para agregar una.</p>'}
        </div>
    `;
}

/**
 * Destruye y renderiza gráficos de línea usando Chart.js
 * @param {Array} data - Datos históricos filtrados
 */
function renderCharts(data) {
    // Destruir gráficos existentes para evitar conflictos
    Object.values(activeCharts).forEach(chart => chart.destroy());
    activeCharts = {};
    
    if (!data || data.length === 0) return;

    // Etiquetas de tiempo (Fecha corta y hora)
    const labels = data.map(d => new Date(d.created_at).toLocaleString('es-ES', { 
        day: '2-digit', 
        month: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
    }));
    
    const metrics = [
        { id: 'tempChart', label: 'Temperatura (°C)', dataKey: 'temperature_c', color: 'rgb(239, 68, 68)' }, // Red-500
        { id: 'weightChart', label: 'Peso (kg)', dataKey: 'weight_kg', color: 'rgb(34, 197, 94)' }, // Green-500
        { id: 'humidityChart', label: 'Humedad (%)', dataKey: 'humidity_pct', color: 'rgb(59, 130, 246)' } // Blue-500
    ];

    metrics.forEach(metric => {
        const ctx = document.getElementById(metric.id)?.getContext('2d');
        if (ctx) {
            activeCharts[metric.id] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: metric.label,
                        data: data.map(d => d[metric.dataKey]),
                        borderColor: metric.color,
                        backgroundColor: metric.color.replace(')', ', 0.15)').replace('rgb', 'rgba'),
                        tension: 0.3,
                        fill: true,
                        pointRadius: 2,
                        borderWidth: 2,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        title: {
                            display: true,
                            text: metric.label,
                            font: { size: 16, weight: 'bold' }
                        }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: 'Tiempo' },
                            ticks: {
                                autoSkip: true,
                                maxTicksLimit: 10
                            }
                        },
                        y: {
                            beginAtZero: false
                        }
                    }
                }
            });
        }
    });
}

/**
 * Genera mensajes de diagnóstico basados en datos actuales e históricos.
 * @param {Object} hive - Metadatos de la colmena.
 * @param {Object | null} data - Datos actuales del sensor.
 * @param {Array} history - Datos históricos filtrados.
 * @returns {string} HTML con el diagnóstico.
 */
function generateHiveDiagnosis(hive, data, history) {
    const messages = [];
    let status = 'good'; // good, warning, danger

    // --- 1. Verificación de Reporte ---
    if (!data || isReportStale(data ? data.created_at : null)) {
        messages.push({
            text: data ? `La colmena no ha reportado datos en más de una hora. Verificar conexión del ESP32.` : `Colmena inactiva. No se ha recibido ningún dato del sensor.`,
            icon: 'cloud-off',
            color: 'red'
        });
        status = 'danger';
    } else {
        messages.push({
            text: `Último reporte recibido hace ${Math.floor((new Date() - new Date(data.created_at)) / (1000 * 60))} minutos. Conexión estable.`,
            icon: 'wifi',
            color: 'green'
        });
    }

    // --- 2. Análisis de Temperatura ---
    if (data && data.temperature_c > 35) {
        messages.push({
            text: `Temperatura interna ALTA (${data.temperature_c.toFixed(1)}°C). Esto puede indicar un intento de enjambrazón o ventilación insuficiente.`,
            icon: 'thermometer-sun',
            color: 'red'
        });
        if (status === 'good') status = 'warning';
    } else if (data && data.temperature_c < 15 && data.temperature_c > 1) { // Ignorar 0.0 de error de sensor
        messages.push({
            text: `Temperatura interna BAJA (${data.temperature_c.toFixed(1)}°C). La colmena está en modo de racimo o tiene dificultades para mantener el calor.`,
            icon: 'thermometer-snowflake',
            color: 'orange'
        });
        if (status === 'good') status = 'warning';
    } else if (data) {
        messages.push({
            text: `Temperatura interna óptima (${data.temperature_c.toFixed(1)}°C), ideal para la cría y la actividad normal.`,
            icon: 'thermometer',
            color: 'green'
        });
    }

    // --- 3. Análisis de Peso (Tendencia) ---
    if (history.length > 5) {
        const initialWeight = history[0].weight_kg;
        const finalWeight = history[history.length - 1].weight_kg;
        const change = finalWeight - initialWeight;
        
        if (change > 0.5) {
            messages.push({
                text: `GANANCIA NETA de peso: +${change.toFixed(2)} kg en el período seleccionado. La recolección es exitosa.`,
                icon: 'trending-up',
                color: 'green'
            });
        } else if (change < -0.5) {
            messages.push({
                text: `PÉRDIDA NETA de peso: ${change.toFixed(2)} kg en el período seleccionado. Revisar consumo o escasez de alimento.`,
                icon: 'trending-down',
                color: 'red'
            });
            if (status === 'good') status = 'warning';
        } else {
            messages.push({
                text: `Peso estable en el período seleccionado. La colmena está en mantenimiento o el cambio es mínimo.`,
                icon: 'scale',
                color: 'gray'
            });
        }
    }

    // --- 4. Análisis de Audio/Frecuencias ---
    if (data && data.audio_freq_avg > 3000) {
        messages.push({
            text: `Frecuencia de Audio MUY ALTA. Puede indicar gran excitación, posible falta de reina (sonido de "piping") o preparativos de enjambrazón.`,
            icon: 'volume-2',
            color: 'red'
        });
        if (status === 'good') status = 'warning';
    } else if (data && data.audio_freq_avg < 1000 && data.audio_freq_avg > 1) { // Ignorar 0.0
        messages.push({
            text: `Frecuencia de Audio BAJA. La colmena está inactiva o con problemas serios de población.`,
            icon: 'volume-x',
            color: 'orange'
        });
        if (status === 'good') status = 'warning';
    }

    // --- Renderizado Final (Restaurando el estilo "lindo") ---
    const diagnosisHtml = messages.map(msg => `
        <div class="flex items-start p-3 rounded-lg bg-${msg.color}-50 border border-${msg.color}-200 mb-3">
            <i data-lucide="${msg.icon}" class="w-5 h-5 text-${msg.color}-600 mt-0.5 mr-3 flex-shrink-0"></i>
            <p class="text-sm text-gray-700">${msg.text}</p>
        </div>
    `).join('');

    return `
        <div class="mt-8 mb-8 p-6 bg-white rounded-xl shadow-lg border-t-8 border-yellow-500">
            <h3 class="text-2xl font-bold text-secondary mb-4 flex items-center">
                <i data-lucide="brain-circuit" class="w-6 h-6 mr-2 text-yellow-600"></i>
                Diagnóstico de la Colmena
            </h3>
            <div id="diagnosis-list">
                ${diagnosisHtml}
            </div>
        </div>
    `;
}


async function renderHiveDetail(hiveIdStr) {
    const content = document.getElementById('content');
    const hiveId = parseInt(hiveIdStr);
    const hive = hivesMeta.find(h => h.hive_id === hiveId);
    const data = latestSensorData[hiveId];
    
    // Mostrar un indicador de carga mientras se obtienen los datos históricos
    content.innerHTML = `
        <div class="text-center p-8">
            <div class="loader mx-auto mb-3"></div>
            <p class="text-secondary font-medium">Cargando datos históricos...</p>
        </div>
    `;
    
    if (!hive) {
        content.innerHTML = '<p class="text-red-500 p-8">Colmena no encontrada.</p>';
        return;
    }

    // Obtener datos históricos (últimos 50 por defecto)
    const historicalData = await fetchHiveHistory(hiveId);
    
    // Generar diagnóstico inicial
    const diagnosisHtml = generateHiveDiagnosis(hive, data, historicalData);

    // HTML de datos actuales
    const dataHtml = data ? `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <!-- Tarjeta de Temperatura -->
            <div class="bg-red-50 p-6 rounded-xl shadow-md border-l-4 border-red-500">
                <i data-lucide="thermometer" class="w-8 h-8 text-red-500 mb-2"></i>
                <h3 class="text-xl font-semibold text-red-800">Temperatura Interna</h3>
                <p class="text-4xl font-extrabold text-red-900 mt-2">${data.temperature_c.toFixed(2)} °C</p>
            </div>

            <!-- Tarjeta de Peso -->
            <div class="bg-green-50 p-6 rounded-xl shadow-md border-l-4 border-green-500">
                <i data-lucide="scale" class="w-8 h-8 text-green-500 mb-2"></i>
                <h3 class="text-xl font-semibold text-green-800">Peso de la Colmena</h3>
                <p class="text-4xl font-extrabold text-green-900 mt-2">${data.weight_kg.toFixed(2)} kg</p>
            </div>

            <!-- Tarjeta de Humedad -->
            <div class="bg-blue-50 p-6 rounded-xl shadow-md border-l-4 border-blue-500">
                <i data-lucide="droplet" class="w-8 h-8 text-blue-500 mb-2"></i>
                <h3 class="text-xl font-semibold text-blue-800">Humedad Interna</h3>
                <p class="text-4xl font-extrabold text-blue-900 mt-2">${data.humidity_pct.toFixed(2)} %</p>
            </div>

            <!-- Tarjeta de Audio/Actividad -->
            <div class="bg-yellow-50 p-6 rounded-xl shadow-md border-l-4 border-yellow-500">
                <i data-lucide="volume-2" class="w-8 h-8 text-yellow-500 mb-2"></i>
                <h3 class="text-xl font-semibold text-yellow-800">Actividad de Audio (ADC)</h3>
                <p class="text-4xl font-extrabold text-yellow-900 mt-2">${data.audio_freq_avg.toFixed(0)}</p>
            </div>
        </div>
        <p class="text-right text-sm text-gray-500 mt-4">Última actualización: ${new Date(data.created_at).toLocaleString('es-ES')}</p>
    ` : '<div class="bg-gray-100 p-6 rounded-xl text-center text-gray-500 font-medium">No se han recibido datos de sensor para esta colmena aún.</div>';

    // HTML de Stream de Twitch (basado en el nombre del canal)
    const twitchHtml = hive.twitch_channel_name ? `
        <div class="mt-10">
            <h3 class="text-2xl font-bold text-secondary mb-4 flex items-center">
                <i data-lucide="video" class="w-6 h-6 mr-2 text-primary"></i>
                Cámara en Vivo (Vía Twitch)
            </h3>
            <div class="aspect-video w-full max-w-3xl mx-auto bg-gray-900 rounded-xl overflow-hidden shadow-xl">
                <iframe
                    src="https://player.twitch.tv/?channel=${hive.twitch_channel_name}&parent=${window.location.hostname}&autoplay=false"
                    frameborder="0"
                    scrolling="no"
                    allowfullscreen="true"
                    class="w-full h-full">
                </iframe>
            </div>
        </div>
    ` : '';
    
    // HTML de Filtros y Gráficos (Restaurando el estilo "lindo" del filtro)
    const chartsContainerHtml = `
        <div class="mt-10">
            <!-- Sección de Filtros (CON LAYOUT CORREGIDO) -->
            <div class="bg-white p-4 rounded-xl shadow-md mb-6 border-l-4 border-blue-500">
                <h3 class="text-xl font-bold text-blue-800 mb-3">Filtrar Historial</h3>
                <!-- 
                  GRID CORREGIDO: 
                  - 1 columna en móvil (apilado)
                  - 2 columnas en tablet (flexible)
                  - 5 columnas en desktop (todo en línea)
                  - 'items-end' alinea el botón con los inputs
                -->
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
                    
                    <!-- Col 1: Fecha Inicio -->
                    <div>
                        <label for="filter-start-date" class="block text-sm font-medium text-gray-700">Fecha Inicio</label>
                        <input type="date" id="filter-start-date" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary">
                    </div>
                    
                    <!-- Col 2: Fecha Fin -->
                    <div>
                        <label for="filter-end-date" class="block text-sm font-medium text-gray-700">Fecha Fin</label>
                        <input type="date" id="filter-end-date" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary">
                    </div>
                    
                    <!-- Col 3: Hora Inicio -->
                    <div>
                        <label for="filter-start-time" class="block text-sm font-medium text-gray-700">Hora Inicio</label>
                        <input type="time" id="filter-start-time" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary">
                    </div>
                    
                    <!-- Col 4: Hora Fin -->
                    <div>
                        <label for="filter-end-time" class="block text-sm font-medium text-gray-700">Hora Fin</label>
                        <input type="time" id="filter-end-time" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary">
                    </div>
                    
                    <!-- Col 5: Botón (Alineado) -->
                    <button id="apply-filters-btn" class="w-full bg-primary text-secondary font-semibold px-4 py-2 rounded-lg shadow-md hover:bg-yellow-600 transition h-10">
                        Aplicar Filtros
                    </button>
                    
                </div>
                <div id="filter-loading" class="loader mt-4 hidden"></div>
            </div>

            <!-- Sección de Gráficos -->
            <h3 class="text-2xl font-bold text-secondary mb-4 flex items-center">
                <i data-lucide="line-chart" class="w-6 h-6 mr-2 text-primary"></i>
                <span id="charts-title">Análisis Histórico (Últimos 50 puntos)</span>
            </h3>
            
            <div id="charts-container" class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="bg-white p-4 rounded-xl shadow-lg h-80"><canvas id="tempChart"></canvas></div>
                <div class="bg-white p-4 rounded-xl shadow-lg h-80"><canvas id="weightChart"></canvas></div>
                <div class="bg-white p-4 rounded-xl shadow-lg h-80 md:col-span-2"><canvas id="humidityChart"></canvas></div>
            </div>
            <div id="charts-no-data" class="hidden p-6 bg-yellow-100 rounded-xl text-yellow-800">
                No se encontraron datos para los filtros seleccionados.
            </div>
        </div>
    `;

    // Renderizado final
    content.innerHTML = `
        <div class="mb-8">
            <button onclick="navigate('dashboard')" class="text-blue-500 hover:text-blue-700 font-semibold mb-4 flex items-center">
                <i data-lucide="arrow-left" class="w-5 h-5 mr-1"></i> Volver al Apiario
            </button>
            <h2 class="text-3xl font-extrabold text-secondary mb-2">${hive.name}</h2>
            <p class="text-lg text-gray-600 mb-6">ID: ${hive.hive_id} | Ubicación: ${hive.location}</p>

            ${dataHtml}

            <!-- Sección de Diagnóstico (Inyectada directamente) -->
            ${diagnosisHtml}
            
            ${twitchHtml}
            ${chartsContainerHtml}

            <div class="mt-8 p-6 bg-white rounded-xl shadow-md">
                <h3 class="text-xl font-bold text-secondary mb-3">Notas de Administrador</h3>
                <p class="text-gray-700 italic">${hive.notes || 'No hay notas añadidas para esta colmena.'}</p>
            </div>
        </div>
    `;
    
    // Renderizar los gráficos iniciales
    if (historicalData.length > 0) {
        setTimeout(() => renderCharts(historicalData), 0); 
    } else {
        document.getElementById('charts-container').classList.add('hidden');
        document.getElementById('charts-no-data').classList.remove('hidden');
        document.getElementById('charts-no-data').textContent = "Aún no hay historial de datos para esta colmena.";
    }
    
    // Añadir listener para el botón de filtros
    document.getElementById('apply-filters-btn').addEventListener('click', async () => {
        const startDate = document.getElementById('filter-start-date').value;
        const endDate = document.getElementById('filter-end-date').value;
        const startTime = document.getElementById('filter-start-time').value;
        const endTime = document.getElementById('filter-end-time').value;
        
        if (!startDate || !endDate) {
            showModal("Error de Filtro", "Por favor, selecciona una fecha de inicio y una fecha de fin.");
            return;
        }

        const filterLoading = document.getElementById('filter-loading');
        const chartsContainer = document.getElementById('charts-container');
        const chartsNoData = document.getElementById('charts-no-data');
        const chartsTitle = document.getElementById('charts-title');

        filterLoading.classList.remove('hidden');
        chartsContainer.classList.add('hidden');
        chartsNoData.classList.add('hidden');
        
        // 1. Obtener datos filtrados por fecha (de Supabase)
        // Formatear fecha para Supabase (ISO 8601)
        const startISO = new Date(startDate + 'T00:00:00').toISOString();
        const endISO = new Date(endDate + 'T23:59:59').toISOString();
        const filteredDateData = await fetchHiveHistory(hiveId, { startDate: startISO, endDate: endISO });

        // 2. Filtrar datos por hora (en JS)
        const filteredData = filterDataByTime(filteredDateData, startTime, endTime);

        // 3. Regenerar Diagnóstico y Gráficos
        const newDiagnosisHtml = generateHiveDiagnosis(hive, data, filteredData);
        // Reemplazar el diagnóstico anterior por el nuevo
        const diagnosisContainer = document.querySelector('[data-lucide="brain-circuit"]')?.closest('.border-yellow-500');
        if (diagnosisContainer) {
            // Reemplazamos el contenido interno para mantener la tarjeta contenedora
            const diagnosisList = diagnosisContainer.querySelector('#diagnosis-list');
            if (diagnosisList) {
                diagnosisList.innerHTML = newDiagnosisHtml.match(/<div id="diagnosis-list">([\s\S]*)<\/div>/)[1] || '';
            }
        }


        if (filteredData.length > 0) {
            chartsContainer.classList.remove('hidden');
            setTimeout(() => renderCharts(filteredData), 0);
            chartsTitle.textContent = `Análisis (${filteredData.length} puntos encontrados)`;
        } else {
            chartsNoData.classList.remove('hidden');
            chartsTitle.textContent = 'Análisis Histórico';
        }
        
        filterLoading.classList.add('hidden');
        initializeIcons(); // Reinicializar iconos del diagnóstico
    });

    // Volver a inicializar los iconos de Lucide (necesario tras modificar el innerHTML)
    initializeIcons();
}


function renderAdminPanel() {
    const content = document.getElementById('content');
    if (!isAuthenticated) {
        navigate('dashboard');
        showModal("Acceso Restringido", "Debes iniciar sesión para acceder al panel de administración.");
        return;
    }

    const hiveRows = hivesMeta.map(hive => {
        const data = latestSensorData[hive.hive_id];
        const lastReport = data ? new Date(data.created_at) : null;
        const isStale = isReportStale(data ? data.created_at : null);
        
        let reportStatusText = 'Sin Datos';
        let reportStatusColor = 'text-gray-500';

        if (lastReport) {
            if (isStale) {
                reportStatusText = 'Antiguo: ' + lastReport.toLocaleString('es-ES');
                reportStatusColor = 'text-orange-500 font-bold';
            } else {
                reportStatusText = lastReport.toLocaleString('es-ES');
                reportStatusColor = 'text-green-600 font-medium';
            }
        }

        return `
            <tr class="border-b hover:bg-yellow-50 transition">
                <td class="px-6 py-3 font-mono text-sm font-bold text-secondary">${hive.hive_id}</td>
                <td class="px-6 py-3">${hive.name}</td>
                <td class="px-6 py-3">${hive.location}</td>
                <td class="px-6 py-3 text-center">
                    <span class="text-xs font-bold ${data ? (data.temperature_c > 35 ? 'text-red-600' : 'text-green-600') : 'text-gray-500'}">
                        ${data ? data.temperature_c.toFixed(1) + '°C' : '-'}
                    </span>
                </td>
                <td class="px-6 py-3 text-center">
                    <span class="text-xs font-bold ${data ? (data.weight_kg < 5 ? 'text-red-600' : 'text-green-600') : 'text-gray-500'}">
                        ${data ? data.weight_kg.toFixed(1) + ' kg' : '-'}
                    </span>
                </td>
                <td class="px-6 py-3">
                    <span class="${reportStatusColor} text-xs">
                        ${reportStatusText}
                    </span>
                </td>
                <td class="px-6 py-3 whitespace-nowrap">
                    <button onclick="navigate('edit', ${hive.hive_id})" class="text-blue-600 hover:text-blue-800 mr-3">
                        <i data-lucide="edit-3" class="w-5 h-5 inline"></i>
                    </button>
                    <button onclick="deleteHive(${hive.hive_id})" class="text-red-600 hover:text-red-800">
                        <i data-lucide="trash-2" class="w-5 h-5 inline"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    content.innerHTML += `
        <div class="mb-6 flex justify-between items-center">
            <h2 class="text-3xl font-extrabold text-secondary flex items-center">
                <i data-lucide="user-cog" class="w-8 h-8 mr-2 text-primary"></i>
                Panel de Administración
            </h2>
            <p class="text-sm text-gray-500">
                <span class="font-bold text-secondary">Admin ID:</span> ${currentUserId || 'No Autenticado'}
            </p>
        </div>

        <button onclick="navigate('edit', 'new')" class="bg-green-500 text-white font-semibold px-6 py-3 rounded-xl mb-6 shadow-md hover:bg-green-600 transition flex items-center">
            <i data-lucide="plus-circle" class="w-5 h-5 mr-2"></i>
            Agregar Nueva Colmena
        </button>

        <div class="bg-white rounded-xl shadow-xl overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-primary bg-opacity-80">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-bold text-secondary uppercase tracking-wider">ID</th>
                        <th class="px-6 py-3 text-left text-xs font-bold text-secondary uppercase tracking-wider">Nombre</th>
                        <th class="px-6 py-3 text-left text-xs font-bold text-secondary uppercase tracking-wider">Ubicación</th>
                        <th class="px-6 py-3 text-center text-xs font-bold text-secondary uppercase tracking-wider">Última T°</th>
                        <th class="px-6 py-3 text-center text-xs font-bold text-secondary uppercase tracking-wider">Último Peso</th>
                        <th class="px-6 py-3 text-left text-xs font-bold text-secondary uppercase tracking-wider">Último Reporte</th>
                        <th class="px-6 py-3 text-left text-xs font-bold text-secondary uppercase tracking-wider">Acciones</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    ${hiveRows.length > 0 ? hiveRows : '<tr><td colspan="7" class="p-6 text-center text-gray-500">No hay colmenas registradas.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
}

function renderEditHiveForm(hiveIdStr) {
    const content = document.getElementById('content');
    if (!isAuthenticated) {
        navigate('dashboard');
        showModal("Acceso Restringido", "Debes iniciar sesión para administrar colmenas.");
        return;
    }

    const isNew = hiveIdStr === 'new';
    const hiveId = isNew ? null : parseInt(hiveIdStr);
    const hive = isNew ? { 
        hive_id: '', 
        name: '', 
        location: '', 
        status: 'Normal', 
        notes: '', 
        twitch_channel_name: '' 
    } : hivesMeta.find(h => h.hive_id === hiveId);

    if (!hive && !isNew) {
        content.innerHTML = '<p class="text-red-500 p-8">Colmena no encontrada para editar.</p>';
        return;
    }

    content.innerHTML += `
        <div class="max-w-xl mx-auto bg-white p-8 rounded-xl shadow-2xl border-t-8 border-primary">
            <button onclick="navigate('admin')" class="text-blue-500 hover:text-blue-700 font-semibold mb-6 flex items-center">
                <i data-lucide="arrow-left" class="w-5 h-5 mr-1"></i> Volver al Panel
            </button>
            <h2 class="text-3xl font-extrabold text-secondary mb-6">${isNew ? 'Agregar Nueva Colmena' : 'Editar Colmena: ' + hive.name}</h2>

            <form id="hive-form">
                <div class="mb-4">
                    <label for="hive_id" class="block text-sm font-medium text-gray-700 mb-1">ID Único de Colmena (Del ESP32)</label>
                    <input type="number" id="hive_id" name="hive_id" value="${hive.hive_id || ''}"
                        ${isNew ? 'required' : 'readonly class="bg-gray-100 cursor-not-allowed"'}
                        class="w-full border border-gray-300 p-3 rounded-lg focus:ring-primary focus:border-primary">
                    <p class="text-xs text-gray-500 mt-1">Debe coincidir con la constante HIVE_ID en el código de la placa ESP32.</p>
                </div>

                <div class="mb-4">
                    <label for="name" class="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                    <input type="text" id="name" name="name" value="${hive.name || ''}" required
                        class="w-full border border-gray-300 p-3 rounded-lg focus:ring-primary focus:border-primary">
                </div>

                <div class="mb-4">
                    <label for="location" class="block text-sm font-medium text-gray-700 mb-1">Ubicación</label>
                    <input type="text" id="location" name="location" value="${hive.location || ''}" required
                        class="w-full border border-gray-300 p-3 rounded-lg focus:ring-primary focus:border-primary">
                </div>
                
                <div class="mb-4">
                    <label for="twitch_channel_name" class="block text-sm font-medium text-gray-700 mb-1">Nombre del Canal de Twitch (Opcional)</label>
                    <input type="text" id="twitch_channel_name" name="twitch_channel_name" value="${hive.twitch_channel_name || ''}"
                        class="w-full border border-gray-300 p-3 rounded-lg focus:ring-primary focus:border-primary" placeholder="ej: reservatrefila">
                    <p class="text-xs text-gray-500 mt-1">Solo el nombre del canal, no la URL completa.</p>
                </div>

                <div class="mb-6">
                    <label for="notes" class="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                    <textarea id="notes" name="notes" rows="3"
                        class="w-full border border-gray-300 p-3 rounded-lg focus:ring-primary focus:border-primary">${hive.notes || ''}</textarea>
                </div>

                <button type="submit" class="w-full bg-primary text-secondary font-semibold py-3 rounded-lg hover:bg-yellow-600 transition shadow-lg">
                    ${isNew ? 'Crear Colmena' : 'Actualizar Colmena'}
                </button>
            </form>
        </div>
    `;
    
    // Adjuntar el listener de envío del formulario de forma segura
    setupEditFormListener(hive, isNew);
}

// =================================================================
// INICIO DE LA APLICACIÓN
// =================================================================

// Cargar los datos iniciales y luego iniciar el enrutamiento
document.addEventListener('DOMContentLoaded', () => {
    // La inicialización de iconos se movió a index.html
    // para asegurar que Lucide esté listo.
    fetchData(); 
});