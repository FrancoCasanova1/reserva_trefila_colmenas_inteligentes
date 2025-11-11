// =================================================================
// ARCHIVO 5: LÓGICA PRINCIPAL Y CONTROL DE DATOS
// =================================================================

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
        // Los render functions (en ui_views.js y ui_detail.js)
        // son responsables de actualizar #content y llamar a initializeIcons()
        renderFunction(id); 
    } else {
        // Ruta no encontrada
        content.innerHTML += '<div class="text-center p-12 text-red-500">Ruta no encontrada (404)</div>';
    }
    
    // (¡CORRECCIÓN!) Actualizar el botón de admin CADA VEZ que cambiamos de ruta
    updateAdminButton();
}

// Escucha cambios en el hash (navegación por el usuario)
window.addEventListener('hashchange', handleRoute);


// =================================================================
// AUTENTICACIÓN (ADMIN) - ¡USANDO SUPABASE AUTH!
// =================================================================

/**
 * (¡NUEVA FUNCIÓN DE CORRECCIÓN!)
 * Actualiza el texto y la función del botón de Admin
 * basado en el estado de autenticación Y la ruta actual.
 */
function updateAdminButton() {
    const toggleButton = document.getElementById('admin-toggle');
    if (!toggleButton) return; // Safety check

    const currentHash = window.location.hash;

    if (isAuthenticated) {
        if (currentHash.includes('#admin') || currentHash.includes('#edit')) {
            // Logueado Y en página de admin
            toggleButton.textContent = 'Cerrar Sesión';
            toggleButton.onclick = handleLogout;
        } else {
            // Logueado PERO en página pública (Dashboard, Detalle)
            toggleButton.textContent = 'Panel de Admin';
            toggleButton.onclick = () => navigate('admin');
        }
    } else {
        // No logueado
        toggleButton.textContent = 'Acceso Admin';
        toggleButton.onclick = () => {
            document.getElementById('login-modal').classList.remove('hidden');
            document.getElementById('admin-email').value = '';
            document.getElementById('admin-password').value = '';
            document.getElementById('login-error').classList.add('hidden');
            initializeIcons(); // Asegurarse de que el icono 'X' del modal se renderice
        };
    }
}

// Observa cambios en el estado de autenticación
supabaseClient.auth.onAuthStateChange((event, session) => {
    isAuthenticated = !!session; // True si hay una sesión activa
    currentUserId = session ? session.user.id : null;
    const currentHash = window.location.hash;

    // (¡CORRECCIÓN!) Llamar a la nueva función
    // para actualizar el botón
    updateAdminButton(); 

    // Lógica de redirección (se mantiene)
    if (isAuthenticated) {
        // Si acabas de iniciar sesión (evento 'SIGNED_IN') y no estás en admin, redirige.
        if (event === 'SIGNED_IN' && !currentHash.includes('#admin') && !currentHash.includes('#edit')) {
            navigate('admin');
        }
    } else {
        // Si cierras sesión mientras estás en admin, te envía al dashboard
        if (currentHash.includes('#admin') || currentHash.includes('#edit')) {
             navigate('dashboard');
        }
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
        .select('hive_id, name, location, notes, status, last_updated, twitch_channel_name, user_id, tare_command') // Añadido tare_command
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

/**
 * Guarda (Inserta o Actualiza) una colmena en la base de datos.
 */
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

/**
 * Elimina una colmena (solo metadatos).
 */
async function deleteHive(hiveId) {
    if (!isAuthenticated) return showModal("Error de Acceso", "Debes estar autenticado para realizar esta acción.");
    
    // Mostramos un modal de confirmación personalizado
    showModal("Confirmar Eliminación", `¿Está seguro de eliminar la Colmena ID ${hiveId}? Esto eliminará los metadatos de administración.`);
    
    const modalContainer = document.getElementById('modal-container');
    const modalButton = modalContainer.querySelector('button');
    
    // Clonar y reemplazar el botón para limpiar listeners antiguos
    const newModalButton = modalButton.cloneNode(true);
    modalButton.parentNode.replaceChild(newModalButton, modalButton);

    newModalButton.textContent = "Confirmar Eliminación";
    newModalButton.classList.add('bg-red-500', 'text-white', 'hover:bg-red-600');
    newModalButton.classList.remove('bg-primary', 'text-secondary', 'hover:bg-yellow-600');

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
        newModalButton.classList.remove('bg-red-500', 'text-white', 'hover:bg-red-600');
        newModalButton.classList.add('bg-primary', 'text-secondary', 'hover:bg-yellow-600');
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
                twitch_channel_name: formData.get('twitch_channel_name') || null,
                status: hive.status || 'Normal', 
                last_updated: new Date().toISOString()
            };
            saveHive(data, isNew);
        });
    }
}

/**
 * Envía la orden de TARA a Supabase.
 */
async function handleTareCommand(hiveId) {
    if (!isAuthenticated) return showModal("Error de Acceso", "Debes estar autenticado para realizar esta acción.");

    // (¡CORRECCIÓN!) Poner el estado local en 'pendiente' INMEDIATAMENTE
    const hive = hivesMeta.find(h => h.hive_id === hiveId);
    if (hive) {
        hive.tare_command = 'TARE_REQUESTED';
    }
    handleRoute(); // Recargar la vista actual (admin) para mostrar "Tara Pendiente"

    // Enviar el comando a Supabase
    const { error } = await supabaseClient
        .from('hives_meta')
        .update({ tare_command: 'TARE_REQUESTED' })
        .eq('hive_id', hiveId);
    
    if (error) {
        console.error("Error al enviar comando de Tara:", error.message);
        showModal("Error de Supabase", `No se pudo enviar la orden de Tara: ${error.message}`);
        // Revertir el estado local si falla
        if (hive) hive.tare_command = null;
        handleRoute();
    } else {
        // Ya no mostramos el modal aquí, el estado "pendiente" es suficiente
        console.log(`Orden de Tara enviada para colmena ID ${hiveId}.`);
    }
}


// =================================================================
// (¡NUEVO!) SUPABASE REALTIME
// =================================================================

/**
 * (¡NUEVO!) Actualiza solo las tarjetas de datos en la vista de detalle.
 * @param {object} data - El nuevo registro de sensor_data
 */
function updateDetailCards(data) {
    console.log("Actualizando tarjetas de detalle en tiempo real...");
    
    const tempEl = document.getElementById('card-temp');
    if (tempEl) tempEl.textContent = `${data.temperature_c.toFixed(2)} °C`;
    
    const weightEl = document.getElementById('card-weight');
    if (weightEl) weightEl.textContent = `${data.weight_kg.toFixed(2)} kg`;

    const humidityEl = document.getElementById('card-humidity');
    if (humidityEl) humidityEl.textContent = `${data.humidity_pct.toFixed(2)} %`;

    const audioEl = document.getElementById('card-audio');
    if (audioEl) audioEl.textContent = `${data.audio_freq_avg.toFixed(0)} ADC`;

    const updateEl = document.getElementById('card-last-update');
    if (updateEl) updateEl.textContent = `Última actualización: ${new Date(data.created_at).toLocaleString('es-ES')}`;
    
    // También actualizamos el objeto de datos local
    latestSensorData[data.hive_id] = data;
}


/**
 * Configura las suscripciones de Supabase Realtime.
 * Esto escucha cambios en la DB (Tara completada, nuevos datos de sensor)
 * y actualiza la UI sin necesidad de refrescar la página.
 */
function subscribeToChanges() {
    console.log("Subscribiéndose a cambios en tiempo real...");

    const channel = supabaseClient.channel('public-changes');

    channel.on(
        'postgres_changes',
        { 
            event: '*', // Escuchar INSERT, UPDATE, DELETE
            schema: 'public' 
            // No especificamos tabla para escuchar ambas
        },
        (payload) => {
            console.log('Cambio detectado en la DB:', payload);

            if (payload.table === 'hives_meta' && payload.eventType === 'UPDATE') {
                // La Tara fue completada por el ESP32 (cambió 'tare_command' a null)
                const updatedHive = payload.new;
                const index = hivesMeta.findIndex(h => h.hive_id === updatedHive.hive_id);
                
                if (index !== -1) {
                    // Actualizar la data local
                    hivesMeta[index] = updatedHive;
                    
                    // Solo recargar si estamos en el admin panel
                    if (window.location.hash.includes('#admin')) {
                         handleRoute(); // Re-renderizar la vista actual (esto quitará el "Tara Pendiente")
                    }
                }
            }

            if (payload.table === 'sensor_data' && payload.eventType === 'INSERT') {
                // Un ESP32 envió nuevos datos de sensor
                const newSensorData = payload.new;
                
                // Actualizar la data local (para que fetchData no la pida de nuevo)
                latestSensorData[newSensorData.hive_id] = newSensorData;

                // --- (¡NUEVO!) LÓGICA DE ACTUALIZACIÓN INTELIGENTE ---
                const currentHash = window.location.hash;

                if (currentHash.includes('#dashboard') || currentHash.includes('#admin')) {
                    // Si estamos en Dashboard o Admin, recargar toda la vista
                    handleRoute(); 
                } else if (currentHash.includes('#detail')) {
                    // Si estamos en Detalle, solo actualizar las tarjetas
                    const [, hiveId] = currentHash.split('/');
                    if (newSensorData.hive_id == hiveId) {
                        updateDetailCards(newSensorData);
                    }
                }
            }
        }
    ).subscribe();
}


// =================================================================
// INICIO DE LA APLICACIÓN
// =================================================================

// Se usa DOMContentLoaded para asegurar que todas las librerías CDN estén cargadas
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar iconos una vez al cargar el DOM.
    // Los iconos inyectados dinámicamente se inicializarán al final de cada
    // función de renderizado.
    initializeIcons(); 
    
    // (¡CORRECCIÓN!) Configurar el estado inicial del botón de admin
    // antes de que se carguen los datos.
    updateAdminButton();
    
    fetchData(); // Iniciar la carga de datos y el flujo de la aplicación

    // (¡NUEVO!) Iniciar el listener de Realtime
    subscribeToChanges(); 
});