// =================================================================
// CONFIGURACIÓN Y ESTADO GLOBAL (SUPABASE INICIALIZACIÓN)
// =================================================================

// Configuración de Supabase (URL y Clave proporcionadas por el usuario)
const SUPABASE_URL = "https://psigeyjvvmzdiidtoypq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzaWdleWp2dm16ZGlpZHRveXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMzE4MTEsImV4cCI6MjA3NjgwNzgxMX0.bwlxcwO4Yun78QpEMHDHl9ovqwl_a5d0-EKalOArBSs"; // Clave ANÓNIMA CORREGIDA

// Configuración de OpenWeatherMap
const OPENWEATHER_API_KEY = "78bb833c2b996c4c4d5918990f711c17";
// Latitud y Longitud de Campana, Argentina (ubicación de ejemplo)
const WEATHER_LAT = -34.1683; 
const WEATHER_LON = -58.9567; 

// Inicialización del cliente Supabase
// 'supabase' es el objeto global cargado desde el CDN
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Estado de la aplicación
let isAuthenticated = false;
let currentUserId = null; // ID del usuario autenticado
let isDataLoaded = false; // Bandera para asegurar que los datos iniciales se carguen solo una vez

// Variables para los datos
let hivesMeta = []; // Metadatos de las colmenas (hives_meta)
let latestSensorData = {}; // Últimos datos de sensores (sensor_data)
let weatherData = null; // Datos del clima

// Variable global para almacenar instancias de gráficos
let activeCharts = {};

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
    destroyAllCharts();

    const hash = window.location.hash.replace('#', '');
    let [path, id] = hash.split('/');
    
    const content = document.getElementById('content');
    
    // Si los datos no han cargado aún, solo mostramos el spinner
    if (!isDataLoaded) {
         if (!document.getElementById('loading-spinner')) {
            content.innerHTML = `<div id="loading-spinner" class="flex justify-center items-center h-64"><div class="loader mr-3"></div><p class="text-secondary font-medium">Cargando datos del apiario...</p></div>`;
         }
         return;
    }

    // Limpiar contenido antes de renderizar (excepto el clima que se inyecta primero)
    content.innerHTML = ''; 

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
    
    // Volver a inicializar los iconos de Lucide (movido al final de cada render)
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

function initializeIcons() {
    // Verifica si lucide está cargado antes de crear los íconos
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        try {
            lucide.createIcons();
        } catch (error) {
            console.error("Error al inicializar iconos Lucide:", error);
        }
    }
}

/**
 * Destruye todas las instancias activas de Chart.js
 */
function destroyAllCharts() {
    Object.values(activeCharts).forEach(chart => {
        if (chart) {
            chart.destroy();
        }
    });
    activeCharts = {};
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

/**
 * Mapea el código de icono de OpenWeatherMap al nombre de icono de Lucide.
 * @param {string} iconCode - Código de icono de OpenWeatherMap (ej. "01d")
 * @returns {string} Nombre del icono Lucide (ej. "sun")
 */
function mapWeatherIcon(iconCode) {
    if (!iconCode) return 'cloud';
    const iconMap = {
        // Días
        '01d': 'sun', '02d': 'cloud-sun', '03d': 'cloud', '04d': 'cloud-drizzle', '09d': 'cloud-rain',
        '10d': 'cloud-rain', '11d': 'cloud-lightning', '13d': 'snowflake', '50d': 'align-justify',
        // Noches
        '01n': 'moon', '02n': 'cloud-moon', '03n': 'cloud', '04n': 'cloud-drizzle', '09n': 'cloud-rain',
        '10n': 'cloud-rain', '11n': 'cloud-lightning', '13n': 'snowflake', '50n': 'align-justify'
    };
    return iconMap[iconCode] || 'cloud';
}

// =================================================================
// AUTENTICACIÓN (ADMIN) - ¡USANDO SUPABASE AUTH!
// =================================================================

// Observa cambios en el estado de autenticación
supabaseClient.auth.onAuthStateChange((event, session) => {
    isAuthenticated = !!session; // True si hay una sesión activa
    currentUserId = session ? session.user.id : null;
    const toggleButton = document.getElementById('admin-toggle');
    const currentHash = window.location.hash;

    if (toggleButton) {
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
    }
    // No llamar a handleRoute() aquí directamente, esperar a que fetchData() lo llame
    // o el evento hashchange lo haga.
});

// Adjuntar el listener al botón de Admin
const adminToggleBtn = document.getElementById('admin-toggle');
if (adminToggleBtn) {
    adminToggleBtn.addEventListener('click', () => {
        if (isAuthenticated) {
            handleLogout();
        } else {
            document.getElementById('login-modal').classList.remove('hidden');
            document.getElementById('admin-email').value = '';
            document.getElementById('admin-password').value = '';
            document.getElementById('login-error').classList.add('hidden');
        }
    });
}

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
        document.getElementById('login-modal').classList.add('hidden');
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
// GESTIÓN DE DATOS (SUPABASE Y OPENWEATHER)
// =================================================================

/**
 * Obtiene los datos de clima actual y pronóstico de OpenWeatherMap.
 */
async function fetchWeatherData() {
    const BASE_URL = `https://api.openweathermap.org/data/2.5/`;
    const units = 'metric'; // Unidades métricas (Celsius)
    const lang = 'es';      // Idioma español

    // 1. Clima Actual
    const currentUrl = `${BASE_URL}weather?lat=${WEATHER_LAT}&lon=${WEATHER_LON}&units=${units}&lang=${lang}&appid=${OPENWEATHER_API_KEY}`;
    
    // 2. Pronóstico (5 días / 3 horas)
    const forecastUrl = `${BASE_URL}forecast?lat=${WEATHER_LAT}&lon=${WEATHER_LON}&units=${units}&lang=${lang}&appid=${OPENWEATHER_API_KEY}`;
    
    try {
        const [currentRes, forecastRes] = await Promise.all([
            fetch(currentUrl),
            fetch(forecastUrl)
        ]);

        if (!currentRes.ok || !forecastRes.ok) {
            throw new Error(`HTTP error! status: ${currentRes.status} / ${forecastRes.status}`);
        }

        const currentData = await currentRes.json();
        const forecastData = await forecastRes.json();
        
        // 1. Procesar Clima Actual
        const current = {
            temp: currentData.main.temp,
            description: currentData.weather[0].description,
            icon: mapWeatherIcon(currentData.weather[0].icon),
            city: currentData.name || 'Ubicación'
        };

        // 2. Procesar Pronóstico (Obtener 3 días distintos, excluyendo hoy)
        const forecast = [];
        const addedDays = new Set();
        const today = new Date().toDateString();

        for (const item of forecastData.list) {
            const date = new Date(item.dt * 1000);
            const dayString = date.toDateString();

            if (dayString !== today && !addedDays.has(dayString)) {
                forecast.push({
                    day: date.toLocaleDateString('es-ES', { weekday: 'short' }),
                    temp: item.main.temp_max,
                    icon: mapWeatherIcon(item.weather[0].icon)
                });
                addedDays.add(dayString);
                if (forecast.length >= 3) break;
            }
        }

        return { current, forecast };

    } catch (error) {
        console.error("Error al cargar datos del clima (OpenWeatherMap):", error);
        // Devolver datos mock o null si la API falla
        return { 
            current: { temp: 'N/A', description: "Error de Conexión", icon: "alert-triangle", city: 'API Offline' },
            forecast: [] 
        };
    }
}


async function fetchData() {
    // Inicializar el spinner
    const loadingSpinner = document.getElementById('loading-spinner');
    if(loadingSpinner) loadingSpinner.classList.remove('hidden');

    // 1. Obtener datos del clima en paralelo
    weatherData = await fetchWeatherData();

    // 2. Obtener Metadatos de Colmenas (hives_meta)
    const { data: metaData, error: metaError } = await supabaseClient
        .from('hives_meta')
        .select('hive_id, name, location, notes, status, last_updated, twitch_channel_name, user_id') // CAMBIADO
        .order('hive_id', { ascending: true });


    if (metaError) {
        // El error de Supabase (Invalid API Key) se reporta aquí.
        console.error("Error al cargar metadatos:", metaError.message);
        showModal("Error de Conexión a Supabase", "No se pudieron cargar los metadatos de las colmenas. El error reportado es: " + metaError.message + ". Por favor, verifica tu 'SUPABASE_KEY' y las políticas RLS.");
        hivesMeta = [];
    } else {
        hivesMeta = metaData;
    }

    // 3. Obtener los Últimos Datos de Sensores para CADA Colmena
    latestSensorData = {};
    const sensorPromises = hivesMeta.map(hive => 
        supabaseClient
            .from('sensor_data')
            .select('created_at, temperature_c, humidity_pct, weight_kg, audio_freq_avg')
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

    isDataLoaded = true;
    if(loadingSpinner) loadingSpinner.classList.add('hidden');
    handleRoute(); // Inicia la app y renderiza la vista inicial
}

/**
 * Obtiene registros del sensor para una colmena con filtros de fecha.
 * @param {number} hiveId 
 * @param {Object} filters - Objeto con { startDate, endDate }
 * @returns {Promise<Array>} Datos históricos.
 */
async function fetchHiveHistory(hiveId, filters = {}) {
    let query = supabaseClient
        .from('sensor_data')
        .select('created_at, temperature_c, humidity_pct, weight_kg, audio_freq_avg')
        .eq('hive_id', hiveId);

    if (filters.startDate) {
        query = query.gte('created_at', filters.startDate.toISOString());
    }
    if (filters.endDate) {
        query = query.lte('created_at', filters.endDate.toISOString());
    }

    // Aplicar orden y límite
    if (filters.startDate || filters.endDate) {
        // Si filtramos por fecha, obtenemos más datos (hasta 2000)
        query = query.order('created_at', { ascending: false }).limit(2000);
    } else {
        // Carga inicial (últimos 50 puntos)
        query = query.order('created_at', { ascending: false }).limit(50);
    }

    const { data, error } = await query;

    if (error) {
        console.error("Error al cargar historial:", error.message);
        return [];
    }

    // Devolver los datos en orden cronológico (ascendente) para el gráfico
    return data.reverse(); 
}

/**
 * Filtra un array de datos por un rango horario.
 * @param {Array} data - Array de datos (ej. [{ created_at: '...', ... }])
 * @param {string} startTime - Hora de inicio (ej. "08:00")
 * @param {string} endTime - Hora de fin (ej. "17:00")
 * @returns {Array} Datos filtrados.
 */
function filterDataByTime(data, startTime, endTime) {
    if (!startTime || !endTime) return data;

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    return data.filter(d => {
        const date = new Date(d.created_at);
        const hour = date.getHours();
        const minute = date.getMinutes();

        // Convertir hora y minuto a un solo número para comparar (ej. 8:30 -> 830)
        const timeAsNumber = hour * 100 + minute;
        const startAsNumber = startH * 100 + startM;
        const endAsNumber = endH * 100 + endM;

        return timeAsNumber >= startAsNumber && timeAsNumber <= endAsNumber;
    });
}


// =================================================================
// GESTIÓN DE COLMENAS (CRUD - Solo Admin)
// =================================================================

async function saveHive(data, isNew) {
    if (!isAuthenticated) return showModal("Error de Acceso", "Debes estar autenticado para realizar esta acción.");

    let result;
    if (isNew) {
        // INSERT
        result = await supabaseClient
            .from('hives_meta')
            .insert([{...data, user_id: currentUserId}]) // Asociar con el ID de usuario autenticado
            .select();
    } else {
        // UPDATE
        // Asegurar que solo se pueda modificar si es el dueño (RLS) o si user_id es nulo
        result = await supabaseClient
            .from('hives_meta')
            .update({...data, user_id: currentUserId})
            .eq('hive_id', data.hive_id)
            .select();
    }

    if (result.error) {
        console.error("Error al guardar:", result.error.message);
        showModal("Error de Supabase", `No se pudo guardar: ${result.error.message}`);
    } else {
        showModal("Éxito", `Colmena ${isNew ? 'agregada' : 'actualizada'} correctamente.`);
        // Recargar los datos de meta y sensores
        isDataLoaded = false;
        await fetchData(); 
        navigate('admin');
    }
}

async function deleteHive(hiveId) {
    if (!isAuthenticated) return showModal("Error de Acceso", "Debes estar autenticado para realizar esta acción.");

    // Usamos un modal custom en lugar de confirm()
    showModal("Confirmar Eliminación", `¿Está seguro de eliminar la Colmena ID ${hiveId}? Esto eliminará los metadatos de administración.`);
    
    // Reemplazar el botón "Cerrar" del modal con un botón de confirmación
    const modalContainer = document.getElementById('modal-container');
    const modalButton = modalContainer.querySelector('button');
    
    // Clonar y reemplazar el botón para limpiar listeners antiguos
    const newModalButton = modalButton.cloneNode(true);
    modalButton.parentNode.replaceChild(newModalButton, modalButton);

    newModalButton.textContent = "Confirmar Eliminación";
    newModalButton.classList.add('bg-red-500', 'hover:bg-red-600');
    newModalButton.classList.remove('bg-primary', 'hover:bg-yellow-600');

    newModalButton.onclick = async () => {
        closeModal(); // Cerrar el modal inmediatamente

        const { error } = await supabaseClient
            .from('hives_meta')
            .delete()
            .eq('hive_id', hiveId);

        if (error) {
            console.error("Error al eliminar:", error.message);
            showModal("Error de Supabase", `No se pudo eliminar: ${error.message}`);
        } else {
            showModal("Eliminado", `Colmena ID ${hiveId} eliminada exitosamente.`);
            // Recargar datos
            isDataLoaded = false; 
            await fetchData(); 
        }
         // Restaurar el botón original (en el próximo modal que se abra)
        newModalButton.textContent = "Cerrar";
        newModalButton.classList.remove('bg-red-500', 'hover:bg-red-600');
        newModalButton.classList.add('bg-primary', 'hover:bg-yellow-600');
        newModalButton.onclick = closeModal;
    };
}
        
/**
 * Configura el event listener para el formulario de edición/creación de colmenas.
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
                twitch_channel_name: formData.get('twitch_channel_name') || null, // CAMBIADO
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
    if (!weatherData || !weatherData.current || !weatherData.forecast) return '';
    const current = weatherData.current;
    const forecastHtml = weatherData.forecast.map(f => `
        <div class="flex flex-col items-center p-2">
            <span class="text-sm font-medium text-gray-700">${f.day}</span>
            <i data-lucide="${f.icon}" class="w-6 h-6 text-blue-500 my-1"></i>
            <span class="text-sm font-bold text-gray-800">${f.temp.toFixed(0)}°C</span>
        </div>
    `).join('');

    return `
        <div class="bg-blue-100 p-4 rounded-xl shadow-md mb-8 border-l-4 border-blue-500">
            <h2 class="text-xl font-bold text-blue-800 mb-2 flex items-center">
                <i data-lucide="cloud-sun" class="w-6 h-6 mr-2"></i>
                Clima Actual (${current.city}) y Pronóstico
            </h2>
            <div class="flex justify-between items-center flex-wrap">
                <!-- Clima Actual -->
                <div class="flex items-center space-x-4 mb-4 md:mb-0">
                    <i data-lucide="${current.icon}" class="w-12 h-12 text-blue-500"></i>
                    <div>
                        <p class="text-3xl font-extrabold text-blue-900">${current.temp.toFixed(0)}°C</p>
                        <p class="text-lg text-blue-700">${current.description}</p>
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
     // Lógica simple de alertas basada en umbrales fijos para el demo
    const alerts = hivesMeta.filter(hive => {
        const data = latestSensorData[hive.hive_id];
        if (!data) return isReportStale(null); // Alertar si no hay datos
        return data.temperature_c > 35 || data.weight_kg < 5 || isReportStale(data.created_at);
    }).map(hive => {
        const data = latestSensorData[hive.hive_id];
        let reason = 'Estado de meta: ' + hive.status;
        
        if (data) {
            if (isReportStale(data.created_at)) reason = `¡REPORTE ANTIGUO! Última conexión: ${new Date(data.created_at).toLocaleString('es-ES')}`;
            else if (data.temperature_c > 35) reason = `Temperatura alta (${data.temperature_c.toFixed(1)}°C). Posible enjambre.`;
            else if (data.weight_kg < 5) reason = `Peso críticamente bajo (${data.weight_kg.toFixed(1)} kg).`;
            else if (data.audio_freq_avg > 2500) reason = `Actividad de audio anormalmente alta.`;
        } else if (isReportStale(null)) {
            reason = "¡INACTIVA! Nunca ha enviado datos o está desconectada.";
        }


        return `
            <div class="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm border-l-4 border-red-500 mb-2 hover:shadow-md transition">
                <div class="flex items-center">
                    <i data-lucide="alert-triangle" class="w-6 h-6 text-red-500 mr-3"></i>
                    <div>
                        <p class="font-bold text-red-700">${hive.name} (ID: ${hive.hive_id})</p>
                        <p class="text-sm text-gray-600">${reason}</p>
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
                Alertas del Apiario (${alerts.length})
            </h2>
            <div class="space-y-3">
                ${alerts.length > 0 ? alerts : '<p class="text-gray-500 italic">No hay alertas activas en este momento.</p>'}
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
    initializeIcons();
}

/**
 * Renderiza gráficos de línea usando Chart.js
 * @param {Array} data - Datos históricos (máximo 50 puntos)
 * @param {string} titleSuffix - Sufijo para el título (ej. "Últimos 50 puntos")
 */
function renderCharts(data, titleSuffix = "Últimos 50 puntos") {
    if (!data || data.length === 0) return;

    // Etiquetas de tiempo (Fecha corta y hora si hay pocos puntos, solo fecha si hay muchos)
    const labels = data.map(d => {
        const date = new Date(d.created_at);
        const options = {
            hour: '2-digit', minute: '2-digit'
        };
        // Si el rango es de más de 2 días, mostrar también la fecha
        if (data.length > 100) { 
            options.day = '2-digit';
            options.month = '2-digit';
        }
        return date.toLocaleString('es-ES', options);
    });
    
    const metrics = [
        { id: 'tempChart', label: 'Temperatura (°C)', dataKey: 'temperature_c', color: 'rgb(239, 68, 68)' }, // Red-500
        { id: 'weightChart', label: 'Peso (kg)', dataKey: 'weight_kg', color: 'rgb(34, 197, 94)' }, // Green-500
        { id: 'humidityChart', label: 'Humedad (%)', dataKey: 'humidity_pct', color: 'rgb(59, 130, 246)' } // Blue-500
    ];

    // Destruir gráficos anteriores
    destroyAllCharts();

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
                        tension: 0.3, // Suaviza las líneas
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
                            text: `${metric.label} (${titleSuffix})`,
                            font: { size: 16, weight: 'bold' }
                        }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: 'Tiempo' },
                            ticks: {
                                autoSkip: true,
                                maxTicksLimit: 15 // Aumentar el límite de ticks
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
 * Genera mensajes de diagnóstico basados en los datos del sensor y el historial.
 * @param {Object} hive - Metadatos de la colmena.
 * @param {Object} data - Último punto de datos del sensor.
 * @param {Array} history - Datos históricos.
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

    // --- Renderizado Final ---
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
            ${diagnosisHtml}
        </div>
    `;
}

/**
 * Función para manejar la lógica de filtrado de historial en la vista de detalle.
 * @param {number} hiveId 
 */
async function handleHistoryFilter(hiveId) {
    const startDate = document.getElementById('filter-start-date').value;
    const endDate = document.getElementById('filter-end-date').value;
    const startTime = document.getElementById('filter-start-time').value;
    const endTime = document.getElementById('filter-end-time').value;

    const filters = {};
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) {
        // Incluir el día completo (hasta las 23:59:59)
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filters.endDate = end;
    }

    // 1. Mostrar spinner en el contenedor de gráficos
    const chartsContainer = document.getElementById('charts-container');
    if (chartsContainer) {
        chartsContainer.innerHTML = `<div class="flex justify-center items-center h-64"><div class="loader mr-3"></div><p>Cargando datos filtrados...</p></div>`;
    }

    // 2. Cargar datos de Supabase filtrados por FECHA
    let historicalData = await fetchHiveHistory(hiveId, filters);

    // 3. Filtrar datos por HORA en JavaScript
    let filteredData = filterDataByTime(historicalData, startTime, endTime);

    // 4. Renderizar los gráficos
    if (chartsContainer) {
        // Restaurar la estructura HTML del canvas
        chartsContainer.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="bg-white p-4 rounded-xl shadow-lg h-80">
                    <canvas id="tempChart"></canvas>
                </div>
                <div class="bg-white p-4 rounded-xl shadow-lg h-80">
                    <canvas id="weightChart"></canvas>
                </div>
                <div class="bg-white p-4 rounded-xl shadow-lg h-80 md:col-span-2">
                    <canvas id="humidityChart"></canvas>
                </div>
            </div>`;
    }

    if (filteredData.length > 0) {
        const titleSuffix = `de ${startDate || 'inicio'} a ${endDate || 'fin'} (${startTime || '00:00'} - ${endTime || '23:59'})`;
        renderCharts(filteredData, titleSuffix);
    } else {
        destroyAllCharts();
        chartsContainer.innerHTML = '<p class="text-center text-gray-500 p-8">No se encontraron datos para los filtros seleccionados.</p>';
    }

    initializeIcons();
}


async function renderHiveDetail(hiveIdStr) {
    const content = document.getElementById('content');
    const hiveId = parseInt(hiveIdStr);
    const hive = hivesMeta.find(h => h.hive_id === hiveId);
    const data = latestSensorData[hiveId];
    
    // 1. Mostrar un indicador de carga mientras se obtienen los datos históricos
    content.innerHTML = `
        <div class="text-center p-8">
            <div class="loader mx-auto mb-3"></div>
            <p class="text-secondary font-medium">Cargando datos históricos y diagnóstico...</p>
        </div>
    `;
    
    if (!hive) {
        content.innerHTML = '<p class="text-red-500 p-8">Colmena no encontrada.</p>';
        return;
    }

    // 2. Obtener datos históricos INICIALES (últimos 50)
    const initialHistoricalData = await fetchHiveHistory(hiveId);
    const diagnosisHtml = generateHiveDiagnosis(hive, data, initialHistoricalData);

    // 3. Renderizar Tarjetas de Datos Actuales
    const dataHtml = data ? `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <!-- Tarjeta de Temperatura -->
            <div class="bg-red-50 p-6 rounded-xl shadow-md border-l-4 border-red-500">
                <i data-lucide="thermometer" class="w-8 h-8 text-red-500 mb-2"></i>
                <h3 class="text-xl font-semibold text-red-800">Temperatura Interna (Actual)</h3>
                <p class="text-4xl font-extrabold text-red-900 mt-2">${data.temperature_c.toFixed(2)} °C</p>
                <p class="text-sm text-gray-600 mt-1">${data.temperature_c > 35 ? '¡Alerta! Temperatura elevada.' : 'Nivel óptimo para la cría.'}</p>
            </div>

            <!-- Tarjeta de Peso -->
            <div class="bg-green-50 p-6 rounded-xl shadow-md border-l-4 border-green-500">
                <i data-lucide="scale" class="w-8 h-8 text-green-500 mb-2"></i>
                <h3 class="text-xl font-semibold text-green-800">Peso de la Colmena (Actual)</h3>
                <p class="text-4xl font-extrabold text-green-900 mt-2">${data.weight_kg.toFixed(2)} kg</p>
                <p class="text-sm text-gray-600 mt-1">${data.weight_kg > 20 ? 'Excelente producción de miel.' : 'Peso bajo, revisar reservas.'}</p>
            </div>

            <!-- Tarjeta de Humedad -->
            <div class="bg-blue-50 p-6 rounded-xl shadow-md border-l-4 border-blue-500">
                <i data-lucide="droplet" class="w-8 h-8 text-blue-500 mb-2"></i>
                <h3 class="text-xl font-semibold text-blue-800">Humedad Interna (Actual)</h3>
                <p class="text-4xl font-extrabold text-blue-900 mt-2">${data.humidity_pct.toFixed(2)} %</p>
                <p class="text-sm text-gray-600 mt-1">${data.humidity_pct > 70 ? 'Humedad alta, posible moho.' : 'Nivel aceptable.'}</p>
            </div>

            <!-- Tarjeta de Audio/Actividad -->
            <div class="bg-yellow-50 p-6 rounded-xl shadow-md border-l-4 border-yellow-500">
                <i data-lucide="volume-2" class="w-8 h-8 text-yellow-500 mb-2"></i>
                <h3 class="text-xl font-semibold text-yellow-800">Actividad de Audio (Actual)</h3>
                <p class="text-4xl font-extrabold text-yellow-900 mt-2">${data.audio_freq_avg.toFixed(0)} ADC</p>
                <p class="text-sm text-gray-600 mt-1">${data.audio_freq_avg > 2500 ? 'Actividad inusual. Revisar enjambre/reina.' : 'Actividad de rutina normal.'}</p>
            </div>
        </div>

        <p class="text-right text-sm text-gray-500 mt-4">Última actualización: ${data ? new Date(data.created_at).toLocaleString('es-ES') : 'N/A'}</p>
    ` : '<div class="bg-gray-100 p-6 rounded-xl text-center text-gray-500 font-medium">No se han recibido datos de sensor para esta colmena aún.</div>';

    // 4. Renderizar Stream de Twitch
    // CONSTRUCCIÓN DE URL CORREGIDA
    const twitchEmbedHtml = hive.twitch_channel_name ? `
        <div class="mt-8">
            <h3 class="text-2xl font-bold text-secondary mb-4 flex items-center">
                <i data-lucide="video" class="w-6 h-6 mr-2 text-purple-600"></i>
                Transmisión en Vivo (Twitch)
            </h3>
            <div class="twitch-container shadow-2xl">
                <iframe
                    src="https://player.twitch.tv/?channel=${hive.twitch_channel_name}&parent=${window.location.hostname}&autoplay=true&muted=true"
                    frameborder="0"
                    allowfullscreen="true"
                    scrolling="no"
                    loading="lazy">
                </iframe>
            </div>
        </div>
    ` : ''; // No mostrar nada si no hay URL


    // 5. Filtros y Gráficos
    const chartsHtml = `
        <div class="mt-10">
            <h3 class="text-2xl font-bold text-secondary mb-4 flex items-center">
                <i data-lucide="line-chart" class="w-6 h-6 mr-2 text-primary"></i>
                Análisis Histórico
            </h3>
            
            <!-- SECCIÓN DE FILTROS -->
            <div class="bg-white p-4 rounded-xl shadow-md mb-6 border-l-4 border-blue-500">
                <h4 class="font-bold text-lg text-blue-800 mb-3">Filtrar Historial</h4>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label for="filter-start-date" class="block text-sm font-medium text-gray-700">Fecha Inicio</label>
                        <input type="date" id="filter-start-date" class="w-full border border-gray-300 p-2 rounded-lg mt-1">
                    </div>
                    <div>
                        <label for="filter-end-date" class="block text-sm font-medium text-gray-700">Fecha Fin</label>
                        <input type="date" id="filter-end-date" class="w-full border border-gray-300 p-2 rounded-lg mt-1">
                    </div>
                    <button id="filter-apply-btn" class="bg-blue-500 text-white font-semibold rounded-lg px-4 py-2 self-end h-10 mt-6 md:mt-0 hover:bg-blue-600 transition">
                        Aplicar Filtros
                    </button>
                    <div>
                        <label for="filter-start-time" class="block text-sm font-medium text-gray-700">Hora Inicio</label>
                        <input type="time" id="filter-start-time" class="w-full border border-gray-300 p-2 rounded-lg mt-1">
                    </div>
                    <div>
                        <label for="filter-end-time" class="block text-sm font-medium text-gray-700">Hora Fin</label>
                        <input type="time" id="filter-end-time" class="w-full border border-gray-300 p-2 rounded-lg mt-1">
                    </div>
                </div>
            </div>

            <!-- CONTENEDOR DE GRÁFICOS -->
            <div id="charts-container">
                ${initialHistoricalData.length > 0 ? `
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="bg-white p-4 rounded-xl shadow-lg h-80">
                            <canvas id="tempChart"></canvas>
                        </div>
                        <div class="bg-white p-4 rounded-xl shadow-lg h-80">
                            <canvas id="weightChart"></canvas>
                        </div>
                        <div class="bg-white p-4 rounded-xl shadow-lg h-80 md:col-span-2">
                            <canvas id="humidityChart"></canvas>
                        </div>
                    </div>` : 
                    (data ? '<div class="mt-8 p-4 bg-yellow-100 rounded-xl text-yellow-800">Aún no hay suficiente historial de datos para mostrar gráficos. Esperando más reportes del ESP32.</div>' : '')
                }
            </div>
        </div>
    `;


    content.innerHTML = `
        <div class="mb-8">
            <button onclick="navigate('dashboard')" class="text-blue-500 hover:text-blue-700 font-semibold mb-4 flex items-center">
                <i data-lucide="arrow-left" class="w-5 h-5 mr-1"></i> Volver al Apiario
            </button>
            <h2 class="text-3xl font-extrabold text-secondary mb-2">${hive.name}</h2>
            <p class="text-lg text-gray-600 mb-6">ID: ${hive.hive_id} | Ubicación: ${hive.location}</p>

            ${dataHtml}
            ${diagnosisHtml}
            ${twitchEmbedHtml}
            ${chartsHtml}

            <div class="mt-8 p-6 bg-white rounded-xl shadow-md">
                <h3 class="text-xl font-bold text-secondary mb-3">Notas de Administrador</h3>
                <p class="text-gray-700 italic">${hive.notes || 'No hay notas añadidas para esta colmena.'}</p>
            </div>
        </div>
    `;
    
    // Renderizar los gráficos INICIALES
    if (initialHistoricalData.length > 0) {
        setTimeout(() => renderCharts(initialHistoricalData, "Últimos 50 puntos"), 0); 
    }

    // Añadir listener al botón de filtro
    const filterBtn = document.getElementById('filter-apply-btn');
    if (filterBtn) {
        filterBtn.addEventListener('click', () => handleHistoryFilter(hiveId));
    }

    initializeIcons();
}

function renderAdminPanel() {
    const content = document.getElementById('content');
    if (!isAuthenticated) {
        // Redirigir al dashboard si no está autenticado
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
                reportStatusText = 'Antiguo: ' + lastReport.toLocaleTimeString('es-ES');
                reportStatusColor = 'text-orange-500 font-bold';
            } else {
                reportStatusText = lastReport.toLocaleTimeString('es-ES');
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
                        <th class="px-6 py-3 text-center text-xs font-bold text-secondary uppercase tracking-wider">Úl. Peso</th>
                        <th class="px-6 py-3 text-left text-xs font-bold text-secondary uppercase tracking-wider">Úl. Reporte</th>
                        <th class="px-6 py-3 text-left text-xs font-bold text-secondary uppercase tracking-wider">Acciones</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    ${hiveRows.length > 0 ? hiveRows : '<tr><td colspan="7" class="p-6 text-center text-gray-500">No hay colmenas registradas.</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
    initializeIcons();
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
    // Usamos un objeto vacío o la data existente
    const hive = isNew ? { hive_id: '', name: '', location: '', status: 'Normal', notes: '', twitch_channel_name: '' } : hivesMeta.find(h => h.hive_id === hiveId);

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
                    <input type="number" id="hive_id" name="hive_id" value="${hive.hive_id}"
                        ${isNew ? 'required' : 'readonly class="bg-gray-100 cursor-not-allowed"'}
                        class="w-full border border-gray-300 p-3 rounded-lg focus:ring-primary focus:border-primary">
                    <p class="text-xs text-gray-500 mt-1">Debe coincidir con la constante HIVE_ID en el código de la placa ESP32.</p>
                </div>

                <div class="mb-4">
                    <label for="name" class="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                    <input type="text" id="name" name="name" value="${hive.name}" required
                        class="w-full border border-gray-300 p-3 rounded-lg focus:ring-primary focus:border-primary">
                </div>

                <div class="mb-4">
                    <label for="location" class="block text-sm font-medium text-gray-700 mb-1">Ubicación</label>
                    <input type="text" id="location" name="location" value="${hive.location}" required
                        class="w-full border border-gray-300 p-3 rounded-lg focus:ring-primary focus:border-primary">
                </div>
                
                <div class="mb-4">
                    <label for="twitch_channel_name" class="block text-sm font-medium text-gray-700 mb-1">Nombre del Canal de Twitch</label>
                    <input type="text" id="twitch_channel_name" name="twitch_channel_name" value="${hive.twitch_channel_name || ''}"
                        class="w-full border border-gray-300 p-3 rounded-lg focus:ring-primary focus:border-primary" placeholder="Ej: reservatrefila">
                    <p class="text-xs text-gray-500 mt-1">Solo el nombre del canal, no la URL completa.</p>
                </div>

                <div class="mb-6">
                    <label for="notes" class="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                    <textarea id="notes" name="notes" rows="3"
                        class="w-full border border-gray-300 p-3 rounded-lg focus:ring-primary focus:border-primary">${hive.notes}</textarea>
                </div>

                <button type="submit" class="w-full bg-primary text-secondary font-semibold py-3 rounded-lg hover:bg-yellow-600 transition shadow-lg">
                    ${isNew ? 'Crear Colmena' : 'Actualizar Colmena'}
                </button>
            </form>
        </div>
    `;
    
    setupEditFormListener(hive, isNew);
    initializeIcons();
}

// =================================================================
// INICIO DE LA APLICACIÓN
// =================================================================

// Se usa DOMContentLoaded para asegurar que todas las librerías CDN estén cargadas
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar iconos una vez al cargar el DOM.
    // Los iconos inyectados dinámicamente se inicializarán al final de cada
    // función de renderizado (renderPublicDashboard, renderHiveDetail, etc.)
    initializeIcons(); 
    
    fetchData(); // Iniciar la carga de datos y el flujo de la aplicación
});