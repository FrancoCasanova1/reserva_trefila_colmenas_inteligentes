// =================================================================
// ARCHIVO 4: RENDERIZADO DE VISTA DE DETALLE Y GRÁFICOS
// =================================================================

let selectedGraphs = [];

/**
 * Renderiza gráficos de línea usando Chart.js
 */
function renderCharts(data, titleSuffix = "Últimos 50 puntos") {
    if (!data || data.length === 0) return;

    const labels = data.map(d => {
        const date = new Date(d.created_at);
        const options = {
            hour: '2-digit', minute: '2-digit'
        };
        if (data.length > 100) { 
            options.day = '2-digit';
            options.month = '2-digit';
        }
        return date.toLocaleString('es-ES', options);
    });
    
    const metrics = [
        { id: 'tempChart', label: 'Temperatura (°C)', dataKey: 'temperature_c', color: 'rgb(239, 68, 68)' }, // Red-500
        { id: 'weightChart', label: 'Peso (kg)', dataKey: 'weight_kg', color: 'rgb(34, 197, 94)' }, // Green-500
        { id: 'humidityChart', label: 'Humedad (%)', dataKey: 'humidity_pct', color: 'rgb(59, 130, 246)' }, // Blue-500
        { id: 'audioChart', label: 'Actividad de Audio (ADC)', dataKey: 'audio_freq_avg', color: 'rgb(234, 179, 8)' } // Yellow-500
    ];

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
                            text: `${metric.label} (${titleSuffix})`,
                            font: { size: 14 }
                        }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: 'Tiempo' },
                            ticks: {
                                autoSkip: true,
                                maxTicksLimit: 15 
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

function generateHiveDiagnosis(hive, data, history) {
    const messages = [];
    let status = 'good';

    if (!data || isReportStale(data ? data.created_at : null)) {
        messages.push({
            text: data ? `La colmena no ha reportado datos en más de una hora. Verificar conexión del ESP32.` : `Colmena inactiva.`,
            icon: 'cloud-off',
            color: 'red'
        });
        status = 'danger';
    } else {
        messages.push({
            text: `Último reporte hace ${Math.floor((new Date() - new Date(data.created_at)) / (1000 * 60))} minutos. Conexión estable.`,
            icon: 'wifi',
            color: 'green'
        });
    }

    // Uso de alertsConfig para diagnósticos
    if (data && data.temperature_c > alertsConfig.max_temp) {
        messages.push({
            text: `Temperatura ALTA (${data.temperature_c.toFixed(1)}°C > ${alertsConfig.max_temp}°C). Riesgo de estrés.`,
            icon: 'thermometer-sun',
            color: 'red'
        });
        if (status === 'good') status = 'warning';
    } else if (data && data.temperature_c < alertsConfig.min_temp) {
        messages.push({
            text: `Temperatura BAJA (${data.temperature_c.toFixed(1)}°C < ${alertsConfig.min_temp}°C).`,
            icon: 'thermometer-snowflake',
            color: 'orange'
        });
        if (status === 'good') status = 'warning';
    } else if (data) {
        messages.push({
            text: `Temperatura óptima (${data.temperature_c.toFixed(1)}°C).`,
            icon: 'thermometer',
            color: 'green'
        });
    }

    if (history.length > 5) {
        const change = history[history.length - 1].weight_kg - history[0].weight_kg;
        if (change > 0.5) {
            messages.push({
                text: `GANANCIA de peso: +${change.toFixed(2)} kg.`,
                icon: 'trending-up',
                color: 'green'
            });
        } else if (change < -0.5) {
            messages.push({
                text: `PÉRDIDA de peso: ${change.toFixed(2)} kg.`,
                icon: 'trending-down',
                color: 'red'
            });
            if (status === 'good') status = 'warning';
        } else {
            messages.push({
                text: `Peso estable.`,
                icon: 'scale',
                color: 'gray'
            });
        }
    } else if (data && data.weight_kg < alertsConfig.min_weight) {
        messages.push({
            text: `Peso actual BAJO (${data.weight_kg.toFixed(1)} kg < ${alertsConfig.min_weight} kg).`,
            icon: 'scale',
            color: 'red'
        });
        if (status === 'good') status = 'warning';
    }

    if (data && data.audio_freq_avg > alertsConfig.max_audio) {
        messages.push({
            text: `Audio ALTO (${data.audio_freq_avg.toFixed(0)} > ${alertsConfig.max_audio}). Posible estrés.`,
            icon: 'volume-2',
            color: 'red'
        });
        if (status === 'good') status = 'warning';
    }

    const diagnosisHtml = messages.map(msg => `
        <div class="flex items-start p-2 sm:p-3 rounded-lg bg-${msg.color}-50 border border-${msg.color}-200 mb-3">
            <i data-lucide="${msg.icon}" class="w-5 h-5 text-${msg.color}-600 mt-0.5 mr-3 flex-shrink-0"></i>
            <p class="text-xs sm:text-sm text-gray-700">${msg.text}</p>
        </div>
    `).join('');

    return `
        <div class="mt-8 mb-8 p-4 sm:p-6 bg-white rounded-xl shadow-lg border-t-8 border-yellow-500">
            <h3 class="text-xl sm:text-2xl font-bold text-secondary mb-4 flex items-center">
                <i data-lucide="brain-circuit" class="w-6 h-6 mr-2 text-yellow-600"></i>
                Diagnóstico de la Colmena
            </h3>
            ${diagnosisHtml}
        </div>
    `;
}

function toggleGraphSelection(graphKey) {
    const index = selectedGraphs.indexOf(graphKey);

    if (selectedGraphs.length === 4) {
        selectedGraphs = [graphKey];
    } else if (index > -1) {
        selectedGraphs.splice(index, 1);
    } else {
        selectedGraphs.push(graphKey);
    }
    
    updateGraphVisibility();

    const chartsSection = document.getElementById('charts-section-container');
    if (chartsSection) {
        chartsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function updateGraphVisibility() {
    const allGraphs = ['temp', 'weight', 'humidity', 'audio'];
    const showAll = selectedGraphs.length === 0;

    const graphsGrid = document.getElementById('graphs-grid');
    if (graphsGrid) {
        if (selectedGraphs.length === 1 || selectedGraphs.length === 3) {
            graphsGrid.classList.remove('md:grid-cols-2');
            graphsGrid.classList.add('md:grid-cols-1');
        } else {
            graphsGrid.classList.remove('md:grid-cols-1');
            graphsGrid.classList.add('md:grid-cols-2');
        }
    }

    allGraphs.forEach(key => {
        const graphContainer = document.getElementById(`graph-container-${key}`);
        const card = document.getElementById(`sensor-card-${key}`);

        if (!graphContainer || !card) return; 

        const isSelected = selectedGraphs.includes(key);

        if (showAll || isSelected) {
            graphContainer.style.display = 'block';
        } else {
            graphContainer.style.display = 'none';
        }

        if (showAll) {
            card.classList.remove('opacity-50');
            card.classList.add('opacity-100');
        } else {
            if (isSelected) {
                card.classList.remove('opacity-50');
                card.classList.add('opacity-100');
            } else {
                card.classList.add('opacity-50');
                card.classList.remove('opacity-100');
            }
        }
    });
}


async function handleHistoryFilter(hiveId) {
    const startDate = document.getElementById('filter-start-date').value;
    const endDate = document.getElementById('filter-end-date').value;
    const startTime = document.getElementById('filter-start-time').value;
    const endTime = document.getElementById('filter-end-time').value;

    const filters = {};
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filters.endDate = end;
    }

    const chartsContainer = document.getElementById('charts-container');
    if (chartsContainer) {
        chartsContainer.innerHTML = `<div class="flex justify-center items-center h-64"><div class="loader mr-3"></div><p>Cargando datos filtrados...</p></div>`;
    }

    let historicalData = await fetchHiveHistory(hiveId, filters);
    let filteredData = filterDataByTime(historicalData, startTime, endTime);

    if (chartsContainer) {
        chartsContainer.innerHTML = `
            <div id="graphs-grid" class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div id="graph-container-temp" class="bg-white p-4 rounded-xl shadow-lg h-64 sm:h-80">
                    <canvas id="tempChart"></canvas>
                </div>
                <div id="graph-container-weight" class="bg-white p-4 rounded-xl shadow-lg h-64 sm:h-80">
                    <canvas id="weightChart"></canvas>
                </div>
                <div id="graph-container-humidity" class="bg-white p-4 rounded-xl shadow-lg h-64 sm:h-80">
                    <canvas id="humidityChart"></canvas>
                </div>
                <div id="graph-container-audio" class="bg-white p-4 rounded-xl shadow-lg h-64 sm:h-80">
                    <canvas id="audioChart"></canvas>
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

    updateGraphVisibility();
    initializeIcons();
}

async function renderHiveDetail(hiveIdStr) {
    const content = document.getElementById('content');
    const hiveId = parseInt(hiveIdStr);
    const hive = hivesMeta.find(h => h.hive_id === hiveId);
    const data = latestSensorData[hiveId];

    selectedGraphs = [];
    
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

    const initialHistoricalData = await fetchHiveHistory(hiveId);
    const diagnosisHtml = generateHiveDiagnosis(hive, data, initialHistoricalData);

    const dataHtml = data ? `
        <div class="grid grid-cols-2 md:grid-cols-2 gap-3 sm:gap-6 mb-8">
            
            <div id="sensor-card-temp" onclick="toggleGraphSelection('temp')" class="bg-red-50 p-3 sm:p-6 rounded-xl shadow-md border-l-4 border-red-500 cursor-pointer transition-all duration-300">
                <i data-lucide="thermometer" class="w-6 h-6 sm:w-8 sm:h-8 text-red-500 mb-1 sm:mb-2"></i>
                <h3 class="text-base sm:text-xl font-semibold text-red-800">Temperatura</h3>
                <p id="card-temp" class="text-2xl sm:text-4xl font-extrabold text-red-900 mt-1 sm:mt-2">${data.temperature_c.toFixed(2)} °C</p>
                <p class="text-xs text-gray-600 mt-1 hidden sm:block">${data.temperature_c > alertsConfig.max_temp ? '¡Alerta! Elevada.' : 'Nivel óptimo.'}</p>
            </div>

            <div id="sensor-card-weight" onclick="toggleGraphSelection('weight')" class="bg-green-50 p-3 sm:p-6 rounded-xl shadow-md border-l-4 border-green-500 cursor-pointer transition-all duration-300">
                <i data-lucide="scale" class="w-6 h-6 sm:w-8 sm:h-8 text-green-500 mb-1 sm:mb-2"></i>
                <h3 class="text-base sm:text-xl font-semibold text-green-800">Peso</h3>
                <p id="card-weight" class="text-2xl sm:text-4xl font-extrabold text-green-900 mt-1 sm:mt-2">${data.weight_kg.toFixed(2)} kg</p>
                <p class="text-xs text-gray-600 mt-1 hidden sm:block">${data.weight_kg < alertsConfig.min_weight ? 'Bajo' : 'Normal'}</p>
            </div>

            <div id="sensor-card-humidity" onclick="toggleGraphSelection('humidity')" class="bg-blue-50 p-3 sm:p-6 rounded-xl shadow-md border-l-4 border-blue-500 cursor-pointer transition-all duration-300">
                <i data-lucide="droplet" class="w-6 h-6 sm:w-8 sm:h-8 text-blue-500 mb-1 sm:mb-2"></i>
                <h3 class="text-base sm:text-xl font-semibold text-blue-800">Humedad</h3>
                <p id="card-humidity" class="text-2xl sm:text-4xl font-extrabold text-blue-900 mt-1 sm:mt-2">${data.humidity_pct.toFixed(2)} %</p>
                <p class="text-xs text-gray-600 mt-1 hidden sm:block">Normal</p>
            </div>

            <div id="sensor-card-audio" onclick="toggleGraphSelection('audio')" class="bg-yellow-50 p-3 sm:p-6 rounded-xl shadow-md border-l-4 border-yellow-500 cursor-pointer transition-all duration-300">
                <i data-lucide="volume-2" class="w-6 h-6 sm:w-8 sm:h-8 text-yellow-500 mb-1 sm:mb-2"></i>
                <h3 class="text-base sm:text-xl font-semibold text-yellow-800">Audio</h3>
                <p id="card-audio" class="text-2xl sm:text-4xl font-extrabold text-yellow-900 mt-1 sm:mt-2">${data.audio_freq_avg.toFixed(0)} ADC</p>
                <p class="text-xs text-gray-600 mt-1 hidden sm:block">${data.audio_freq_avg > alertsConfig.max_audio ? 'Alto' : 'Normal'}</p>
            </div>
        </div>

        <p id="card-last-update" class="text-right text-xs sm:text-sm text-gray-500 mt-4">Última actualización: ${data ? new Date(data.created_at).toLocaleString('es-ES') : 'N/A'}</p>
    ` : `<div class="bg-gray-100 p-6 rounded-xl text-center text-gray-500 font-medium">No se han recibido datos de sensor para esta colmena aún.</div>`;

    const twitchEmbedHtml = hive.twitch_channel_name ? `
        <div class="mt-8">
            <h3 class="text-xl sm:text-2xl font-bold text-secondary mb-4 flex items-center">
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
    ` : '';

    const chartsHtml = `
        <div id="charts-section-container" class="mt-10">
            <h3 class="text-xl sm:text-2xl font-bold text-secondary mb-4 flex items-center">
                <i data-lucide="line-chart" class="w-6 h-6 mr-2 text-primary"></i>
                Análisis Histórico
            </h3>
            
            <div class="bg-white p-3 sm:p-4 rounded-xl shadow-md mb-6 border-l-4 border-blue-500">
                <h4 class="font-bold text-base sm:text-lg text-blue-800 mb-3">Filtrar Historial</h4>
                <div class="grid grid-cols-2 md:grid-cols-5 gap-4 items-end">
                    <div><label class="block text-xs sm:text-sm font-medium text-gray-700">Fecha Inicio</label><input type="date" id="filter-start-date" class="w-full border border-gray-300 p-2 rounded-lg mt-1 text-sm"></div>
                    <div><label class="block text-xs sm:text-sm font-medium text-gray-700">Fecha Fin</label><input type="date" id="filter-end-date" class="w-full border border-gray-300 p-2 rounded-lg mt-1 text-sm"></div>
                    <div><label class="block text-xs sm:text-sm font-medium text-gray-700">Hora Inicio</label><input type="time" id="filter-start-time" class="w-full border border-gray-300 p-2 rounded-lg mt-1 text-sm"></div>
                    <div><label class="block text-xs sm:text-sm font-medium text-gray-700">Hora Fin</label><input type="time" id="filter-end-time" class="w-full border border-gray-300 p-2 rounded-lg mt-1 text-sm"></div>
                    <button id="filter-apply-btn" class="bg-blue-500 text-white font-semibold rounded-lg px-4 py-2 h-10 hover:bg-blue-600 transition w-full col-span-2 md:col-span-1 text-sm">Aplicar Filtros</button>
                </div>
            </div>

            <div id="charts-container">
                ${initialHistoricalData.length > 0 ? `
                    <div id="graphs-grid" class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div id="graph-container-temp" class="bg-white p-4 rounded-xl shadow-lg h-64 sm:h-80"><canvas id="tempChart"></canvas></div>
                        <div id="graph-container-weight" class="bg-white p-4 rounded-xl shadow-lg h-64 sm:h-80"><canvas id="weightChart"></canvas></div>
                        <div id="graph-container-humidity" class="bg-white p-4 rounded-xl shadow-lg h-64 sm:h-80"><canvas id="humidityChart"></canvas></div>
                        <div id="graph-container-audio" class="bg-white p-4 rounded-xl shadow-lg h-64 sm:h-80"><canvas id="audioChart"></canvas></div>
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
            <h2 class="text-2xl sm:text-3xl font-extrabold text-secondary mb-2">${hive.name}</h2>
            <p class="text-base sm:text-lg text-gray-600 mb-6">ID: ${hive.hive_id} | Ubicación: ${hive.location}</p>

            ${dataHtml}
            ${diagnosisHtml}
            ${twitchEmbedHtml}
            ${chartsHtml}

            <div class="mt-8 p-4 sm:p-6 bg-white rounded-xl shadow-md">
                <h3 class="text-xl font-bold text-secondary mb-3">Notas de Administrador</h3>
                <p class="text-sm sm:text-base text-gray-700 italic">${hive.notes || 'No hay notas añadidas para esta colmena.'}</p>
            </div>
        </div>
    `;
    
    if (initialHistoricalData.length > 0) {
        setTimeout(() => renderCharts(initialHistoricalData, "Últimos 50 puntos"), 0); 
    }

    const filterBtn = document.getElementById('filter-apply-btn');
    if (filterBtn) {
        filterBtn.addEventListener('click', () => handleHistoryFilter(hiveId));
    }

    initializeIcons();
}