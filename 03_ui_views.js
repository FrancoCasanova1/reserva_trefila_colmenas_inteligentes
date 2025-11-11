// =================================================================
// ARCHIVO 3: RENDERIZADO DE VISTAS (DASHBOARD Y ADMIN)
// =================================================================

function renderPublicDashboard() {
    const content = document.getElementById('content');
    
    // 1. Renderizar Alertas (siempre primero)
    content.innerHTML += renderAlertsList();

    // (¡NUEVO!) SVG de la colmena Langstroth (cajas apiladas)
    // Este SVG es más moderno y profesional
    const beehiveSvg = `
        <svg viewBox="0 0 100 120" class="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g stroke="#3C2F2F" stroke-width="2">
                <!-- Techo (Tapa) -->
                <rect x="5" y="5" width="90" height="15" fill="#3C2F2F" rx="3"/>
                <!-- Alza de Miel (Super) -->
                <rect x="10" y="22" width="80" height="30" fill="#FFC300" rx="2"/>
                <!-- Cámara de Cría (Brood Box) -->
                <rect x="10" y="55" width="80" height="40" fill="#FFC300" rx="2"/>
                <!-- Piquera (Entrada) -->
                <rect x="35" y="85" width="30" height="5" fill="#3C2F2F" rx="1"/>
                <!-- Base (Piso) -->
                <rect x="8" y="98" width="84" height="10" fill="#3C2F2F" rx="2"/>
                <!-- Patas (Stand) -->
                <rect x="15" y="108" width="10" height="7" fill="#3C2F2F"/>
                <rect x="75" y="108" width="10" height="7" fill="#3C2F2F"/>
            </g>
        </svg>
    `;

    // 2. Renderizar Tarjetas de Colmenas
    const hiveCards = hivesMeta.map(hive => {
        const data = latestSensorData[hive.hive_id];
        
        let statusColorClass = 'bg-gray-400';
        let statusText = 'Sin Datos';

        if (data) {
            if (isReportStale(data.created_at)) {
                statusColorClass = 'bg-orange-400';
                statusText = 'Reporte Antiguo';
            } else if (data.temperature_c > 35 || data.weight_kg < 5) {
                statusColorClass = 'bg-red-500';
                statusText = 'Alerta Crítica';
            } else {
                statusColorClass = 'bg-green-500';
                statusText = 'Normal';
            }
        }

        // Renderiza los iconos de valores sensados
        // (¡NUEVO!) Gap reducido en móvil
        const sensorIcons = data ? `
            <div class="flex flex-wrap justify-center gap-2 sm:gap-3">
                <div class="text-center">
                    <i data-lucide="thermometer" class="w-5 sm:w-6 h-5 sm:h-6 text-red-600 mx-auto"></i>
                    <span class="text-xs font-bold">${data.temperature_c.toFixed(1)}°C</span>
                </div>
                <div class="text-center">
                    <i data-lucide="droplet" class="w-5 sm:w-6 h-5 sm:h-6 text-blue-600 mx-auto"></i>
                    <span class="text-xs font-bold">${data.humidity_pct.toFixed(1)}%</span>
                </div>
                <div class="text-center">
                    <i data-lucide="scale" class="w-5 sm:w-6 h-5 sm:h-6 text-green-600 mx-auto"></i>
                    <span class="text-xs font-bold">${data.weight_kg.toFixed(1)} kg</span>
                </div>
                <div class="text-center">
                    <i data-lucide="volume-2" class="w-5 sm:w-6 h-5 sm:h-6 text-yellow-500 mx-auto"></i>
                    <span class="text-xs font-bold">${data.audio_freq_avg.toFixed(0)} ADC</span>
                </div>
            </div>
        ` : '<p class="text-sm text-gray-500">Esperando datos del sensor...</p>';


        return `
            <!-- (¡NUEVO!) Padding reducido en móvil -->
            <div onclick="navigate('detail', ${hive.hive_id})" class="bg-white p-4 sm:p-6 rounded-xl shadow-lg hover:shadow-xl transition cursor-pointer border-t-8 border-primary">
                
                <!-- (¡NUEVO!) SVG más pequeño en móvil -->
                <div class="w-[100px] h-[120px] sm:w-[120px] sm:h-[140px] mx-auto my-4">
                    ${beehiveSvg}
                </div>

                <!-- (¡NUEVO!) Fuente de título más pequeña en móvil -->
                <h3 class="text-lg sm:text-xl font-bold text-center text-secondary mb-2">${hive.name} (ID: ${hive.hive_id})</h3>
                <p class="text-sm text-center text-gray-600 mb-4">${hive.location}</p>

                <!-- Indicador de estado -->
                <div class="flex items-center justify-center mb-4">
                    <div class="w-3 h-3 rounded-full ${statusColorClass} mr-2 animate-pulse"></div>
                    <span class="font-semibold text-sm text-gray-700">${statusText}</span>
                </div>

                <!-- Iconos de valores sensados -->
                ${sensorIcons}
            </div>
        `;
    }).join('');

    // 3. Añadir el contenedor de tarjetas al contenido
    // (¡NUEVO!) Título más pequeño en móvil
    content.innerHTML += `
        <h2 class="text-xl sm:text-2xl font-bold text-secondary mb-4 mt-6">
            <i data-lucide="grid-3x3" class="w-6 h-6 mr-2 text-primary"></i>
            Vista General del Apiario
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${hivesMeta.length > 0 ? hiveCards : '<p class="text-gray-500 italic">No hay colmenas configuradas. Inicia sesión como Admin para agregar una.</p>'}
        </div>
    `;

    // 4. Inicializar iconos
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
        
        // Revisar si hay una tara pendiente
        const tarePending = hive.tare_command === 'TARE_REQUESTED';
        const tareButtonHtml = tarePending ?
            `<span class="text-xs font-medium text-orange-500 animate-pulse">Tara Pendiente...</span>` :
            `<button onclick="handleTareCommand(${hive.hive_id})" class="text-blue-600 hover:text-blue-800" title="Realizar Tara (Poner peso a Cero)">
                <i data-lucide="rotate-ccw" class="w-5 h-5 inline"></i>
            </button>`;

        // (¡NUEVO!) Clases de padding y texto responsivas para la tabla
        return `
            <tr class="border-b hover:bg-yellow-50 transition">
                <td class="px-2 py-3 sm:px-6 font-mono text-sm font-bold text-secondary">${hive.hive_id}</td>
                <td class="px-2 py-3 sm:px-6 text-sm">${hive.name}</td>
                <td class="px-2 py-3 sm:px-6 text-sm hidden sm:table-cell">${hive.location}</td>
                <td class="px-2 py-3 sm:px-6 text-center">
                    <span class="text-xs font-bold ${data ? (data.temperature_c > 35 ? 'text-red-600' : 'text-green-600') : 'text-gray-500'}">
                        ${data ? data.temperature_c.toFixed(1) + '°C' : '-'}
                    </span>
                </td>
                <td class="px-2 py-3 sm:px-6 text-center">
                    <span class="text-xs font-bold ${data ? (data.weight_kg < 5 ? 'text-red-600' : 'text-green-600') : 'text-gray-500'}">
                        ${data ? data.weight_kg.toFixed(1) + ' kg' : '-'}
                    </span>
                </td>
                <td class="px-2 py-3 sm:px-6 text-xs hidden md:table-cell">
                    <span class="${reportStatusColor} text-xs">
                        ${reportStatusText}
                    </span>
                </td>
                <td class="px-2 py-3 sm:px-6 whitespace-nowrap text-center space-x-2 sm:space-x-3">
                    ${tareButtonHtml}
                    <button onclick="navigate('edit', ${hive.hive_id})" class="text-blue-600 hover:text-blue-800" title="Editar Colmena">
                        <i data-lucide="edit-3" class="w-5 h-5 inline"></i>
                    </button>
                    <button onclick="deleteHive(${hive.hive_id})" class="text-red-600 hover:text-red-800" title="Eliminar Colmena">
                        <i data-lucide="trash-2" class="w-5 h-5 inline"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    // (¡NUEVO!) Título y botón de admin más pequeños en móvil
    content.innerHTML += `
        <div class="mb-4 sm:mb-6 flex justify-between items-center">
            <h2 class="text-xl sm:text-3xl font-extrabold text-secondary flex items-center">
                <i data-lucide="user-cog" class="w-6 sm:w-8 h-6 sm:h-8 mr-2 text-primary"></i>
                Panel de Administración
            </h2>
            <p class="text-xs sm:text-sm text-gray-500">
                <span class="font-bold text-secondary">Admin ID:</span> ${currentUserId || 'No Autenticado'}
            </p>
        </div>

        <button onclick="navigate('edit', 'new')" class="bg-green-500 text-white font-semibold px-4 py-2 sm:px-6 sm:py-3 rounded-xl mb-6 shadow-md hover:bg-green-600 transition flex items-center text-sm sm:text-base">
            <i data-lucide="plus-circle" class="w-5 h-5 mr-2"></i>
            Agregar Nueva Colmena
        </button>

        <div class="bg-white rounded-xl shadow-xl overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-primary bg-opacity-80">
                    <tr>
                        <th class="px-2 py-3 sm:px-6 text-left text-xs font-bold text-secondary uppercase tracking-wider">ID</th>
                        <th class="px-2 py-3 sm:px-6 text-left text-xs font-bold text-secondary uppercase tracking-wider">Nombre</th>
                        <th class="px-2 py-3 sm:px-6 text-left text-xs font-bold text-secondary uppercase tracking-wider hidden sm:table-cell">Ubicación</th>
                        <th class="px-2 py-3 sm:px-6 text-center text-xs font-bold text-secondary uppercase tracking-wider">T°</th>
                        <th class="px-2 py-3 sm:px-6 text-center text-xs font-bold text-secondary uppercase tracking-wider">Peso</th>
                        <th class="px-2 py-3 sm:px-6 text-left text-xs font-bold text-secondary uppercase tracking-wider hidden md:table-cell">Reporte</th>
                        <th class="px-2 py-3 sm:px-6 text-center text-xs font-bold text-secondary uppercase tracking-wider">Acciones</th>
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

    // (¡NUEVO!) Padding y fuente más pequeños en móvil
    content.innerHTML += `
        <div class="max-w-xl mx-auto bg-white p-4 sm:p-8 rounded-xl shadow-2xl border-t-8 border-primary">
            <button onclick="navigate('admin')" class="text-blue-500 hover:text-blue-700 font-semibold mb-4 sm:mb-6 flex items-center">
                <i data-lucide="arrow-left" class="w-5 h-5 mr-1"></i> Volver al Panel
            </button>
            <h2 class="text-2xl sm:text-3xl font-extrabold text-secondary mb-6">${isNew ? 'Agregar Nueva Colmena' : 'Editar Colmena: ' + hive.name}</h2>

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
                    <label for="twitch_channel_name" class="block text-sm font-medium text-gray-700 mb-1">Nombre del Canal de Twitch (Opcional)</label>
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
    
    // Adjuntar el listener de envío del formulario de forma segura
    setupEditFormListener(hive, isNew);
    initializeIcons();
}