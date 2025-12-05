// =================================================================
// ARCHIVO 2: UTILIDADES DE UI Y COMPONENTES CENTRALES
// =================================================================

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
// RENDERIZADO DE COMPONENTES DE UI (CLIMA Y ALERTAS)
// =================================================================

function renderWeatherBar() {
    if (!weatherData || !weatherData.current || !weatherData.forecast) return '';
    const current = weatherData.current;
    
    const forecastHtml = weatherData.forecast.length > 0 ? 
        weatherData.forecast.map(f => `
        <div class="flex flex-col items-center p-2">
            <span class="text-sm font-medium text-gray-700">${f.day}</span>
            <i data-lucide="${f.icon}" class="w-6 h-6 text-blue-500 my-1"></i>
            <span class="text-sm font-bold text-gray-800">${f.temp.toFixed(0)}°C</span>
        </div>
    `).join('') : '<p class="text-sm text-blue-700">Pronóstico no disponible.</p>';

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

/**
 * Renderiza la lista de alertas usando la configuración dinámica.
 */
function renderAlertsList() {
    
    // 1. Filtrar colmenas con alertas usando alertsConfig
    const alertHives = hivesMeta.filter(hive => {
        const data = latestSensorData[hive.hive_id];
        if (!data) return isReportStale(null); 
        
        // Usar variables de alertsConfig
        return data.temperature_c > alertsConfig.max_temp || 
               data.temperature_c < alertsConfig.min_temp ||
               data.weight_kg < alertsConfig.min_weight || 
               isReportStale(data.created_at) || 
               data.audio_freq_avg > alertsConfig.max_audio;
    });

    // 2. Generar HTML
    const alertsHtml = alertHives.map(hive => {
        const data = latestSensorData[hive.hive_id];
        let reason = 'Estado de meta: ' + hive.status;
        
        if (data) {
            if (isReportStale(data.created_at)) {
                reason = `¡REPORTE ANTIGUO! Última conexión: ${new Date(data.created_at).toLocaleString('es-ES')}`;
            } else if (data.temperature_c > alertsConfig.max_temp) {
                reason = `Temperatura alta (${data.temperature_c.toFixed(1)}°C > ${alertsConfig.max_temp}°C).`;
            } else if (data.temperature_c < alertsConfig.min_temp) {
                reason = `Temperatura baja (${data.temperature_c.toFixed(1)}°C < ${alertsConfig.min_temp}°C).`;
            } else if (data.weight_kg < alertsConfig.min_weight) {
                reason = `Peso bajo (${data.weight_kg.toFixed(1)} kg < ${alertsConfig.min_weight} kg).`;
            } else if (data.audio_freq_avg > alertsConfig.max_audio) {
                reason = `Audio alto (${data.audio_freq_avg.toFixed(0)} > ${alertsConfig.max_audio}).`;
            }
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
            <h2 class="text-xl sm:text-2xl font-bold text-secondary mb-4 flex items-center">
                <i data-lucide="siren" class="w-6 h-6 mr-2 text-red-500"></i>
                Alertas del Apiario (${alertHives.length})
            </h2>
            <div class="space-y-3">
                ${alertHives.length > 0 ? alertsHtml : '<p class="text-gray-500 italic">No hay alertas activas en este momento.</p>'}
            </div>
        </div>
    `;
}