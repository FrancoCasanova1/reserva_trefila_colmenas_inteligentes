// =================================================================
// ARCHIVO 4: RENDERIZADO DE VISTA DE DETALLE Y GRÁFICOS
// =================================================================

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
            color: 'red' // Tailwind color name
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

    // --- Renderizado Final (Estilos de Tailwind aplicados aquí) ---
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

/**
 * Renderiza la vista de detalle completa (la función más grande).
 */
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


    // 5. Filtros y Gráficos (Diseño de filtro corregido)
    const chartsHtml = `
        <div class="mt-10">
            <h3 class="text-2xl font-bold text-secondary mb-4 flex items-center">
                <i data-lucide="line-chart" class="w-6 h-6 mr-2 text-primary"></i>
                Análisis Histórico
            </h3>
            
            <!-- SECCIÓN DE FILTROS (DISEÑO CORREGIDO) -->
            <div class="bg-white p-4 rounded-xl shadow-md mb-6 border-l-4 border-blue-500">
                <h4 class="font-bold text-lg text-blue-800 mb-3">Filtrar Historial</h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
                    
                    <div>
                        <label for="filter-start-date" class="block text-sm font-medium text-gray-700">Fecha Inicio</label>
                        <input type="date" id="filter-start-date" class="w-full border border-gray-300 p-2 rounded-lg mt-1">
                    </div>
                    <div>
                        <label for="filter-end-date" class="block text-sm font-medium text-gray-700">Fecha Fin</label>
                        <input type="date" id="filter-end-date" class="w-full border border-gray-300 p-2 rounded-lg mt-1">
                    </div>
                    
                    <div>
                        <label for="filter-start-time" class="block text-sm font-medium text-gray-700">Hora Inicio</label>
                        <input type="time" id="filter-start-time" class="w-full border border-gray-300 p-2 rounded-lg mt-1">
                    </div>
                    <div>
                        <label for="filter-end-time" class="block text-sm font-medium text-gray-700">Hora Fin</label>
                        <input type="time" id="filter-end-time" class="w-full border border-gray-300 p-2 rounded-lg mt-1">
                    </div>

                    <button id="filter-apply-btn" class="bg-blue-500 text-white font-semibold rounded-lg px-4 py-2 h-10 hover:bg-blue-600 transition w-full">
                        Aplicar Filtros
                    </button>
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