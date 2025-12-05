// =================================================================
// ARCHIVO 5: LÓGICA PRINCIPAL Y CONTROL DE DATOS
// =================================================================

// =================================================================
// RUTAS Y NAVEGACIÓN
// =================================================================

function navigate(path, id = null) {
    let hash = path;
    if (id !== null) {
        hash += `/${id}`;
    }
    window.location.hash = hash;
}

function handleRoute() {
    // Destruir gráficos anteriores
    destroyAllCharts();

    const hash = window.location.hash.replace('#', '');
    let [path, id] = hash.split('/');
    
    const content = document.getElementById('content');
    
    if (!isDataLoaded) {
         if (!document.getElementById('loading-spinner')) {
             content.innerHTML = `<div id="loading-spinner" class="flex justify-center items-center h-64"><div class="loader mr-3"></div><p class="text-secondary font-medium">Cargando datos del apiario...</p></div>`;
         }
         return;
    }

    content.innerHTML = ''; 

    if (!path) {
        path = 'dashboard';
    }

    if (path === 'dashboard' || path === 'admin') {
        content.innerHTML += renderWeatherBar();
    }

    if (routes[path]) {
        const renderFunction = routes[path];
        renderFunction(id); 
    } else {
        content.innerHTML += '<div class="text-center p-12 text-red-500">Ruta no encontrada (404)</div>';
    }
    
    updateAdminButton();
}

window.addEventListener('hashchange', handleRoute);


// =================================================================
// AUTENTICACIÓN Y CONFIGURACIÓN DE ALERTAS
// =================================================================

function updateAdminButton() {
    const toggleButton = document.getElementById('admin-toggle');
    if (!toggleButton) return; 

    const currentHash = window.location.hash;

    if (isAuthenticated) {
        if (currentHash.includes('#admin') || currentHash.includes('#edit')) {
            toggleButton.textContent = 'Cerrar Sesión';
            toggleButton.onclick = handleLogout;
        } else {
            toggleButton.textContent = 'Panel de Admin';
            toggleButton.onclick = () => navigate('admin');
        }
    } else {
        toggleButton.textContent = 'Acceso Admin';
        toggleButton.onclick = () => {
            document.getElementById('login-modal').classList.remove('hidden');
            document.getElementById('admin-email').value = '';
            document.getElementById('admin-password').value = '';
            document.getElementById('login-error').classList.add('hidden');
            initializeIcons(); 
        };
    }
}

supabaseClient.auth.onAuthStateChange((event, session) => {
    isAuthenticated = !!session; 
    currentUserId = session ? session.user.id : null;
    const currentHash = window.location.hash;

    updateAdminButton(); 

    if (isAuthenticated) {
        if (event === 'SIGNED_IN' && !currentHash.includes('#admin') && !currentHash.includes('#edit')) {
            navigate('admin');
        }
    } else {
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

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        console.error("Login Error:", error.message);
        errorElement.textContent = `Error: ${error.message}`;
        errorElement.classList.remove('hidden');
    } else {
        closeLoginModal();
    }
}

async function handleLogout() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        showModal("Error al Cerrar Sesión", error.message);
    } else {
        showModal("Sesión Cerrada", "Has cerrado la sesión de administrador exitosamente.");
    }
}

// --- Funciones de Configuración de Alertas ---

function openAlertsConfigModal() {
    document.getElementById('conf_max_temp').value = alertsConfig.max_temp;
    document.getElementById('conf_min_temp').value = alertsConfig.min_temp;
    document.getElementById('conf_min_weight').value = alertsConfig.min_weight;
    document.getElementById('conf_max_audio').value = alertsConfig.max_audio;
    
    document.getElementById('alerts-modal').classList.remove('hidden');
}

async function saveAlertsConfig() {
    const newConfig = {
        max_temp: parseFloat(document.getElementById('conf_max_temp').value),
        min_temp: parseFloat(document.getElementById('conf_min_temp').value),
        min_weight: parseFloat(document.getElementById('conf_min_weight').value),
        max_audio: parseFloat(document.getElementById('conf_max_audio').value),
        updated_at: new Date().toISOString()
    };

    const { error } = await supabaseClient
        .from('alerts_config')
        .update(newConfig)
        .eq('id', 1);

    if (error) {
        showModal("Error", "No se pudo guardar la configuración: " + error.message);
    } else {
        alertsConfig = { ...alertsConfig, ...newConfig }; 
        document.getElementById('alerts-modal').classList.add('hidden');
        showModal("Éxito", "Configuración de alertas actualizada correctamente.");
        handleRoute(); 
    }
}


// =================================================================
// GESTIÓN DE DATOS (SUPABASE Y OPENWEATHER)
// =================================================================

async function fetchWeatherData() {
    const BASE_URL = `https://api.openweathermap.org/data/2.5/`;
    const units = 'metric'; 
    const lang = 'es';      

    const currentUrl = `${BASE_URL}weather?lat=${WEATHER_LAT}&lon=${WEATHER_LON}&units=${units}&lang=${lang}&appid=${OPENWEATHER_API_KEY}`;
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
        
        const current = {
            temp: currentData.main.temp,
            description: currentData.weather[0].description,
            icon: mapWeatherIcon(currentData.weather[0].icon),
            city: currentData.name || 'Ubicación'
        };

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
        return { 
            current: { temp: 'N/A', description: "Error de Conexión", icon: "alert-triangle", city: 'API Offline' },
            forecast: [] 
        };
    }
}


async function fetchData() {
    const loadingSpinner = document.getElementById('loading-spinner');
    if(loadingSpinner) loadingSpinner.classList.remove('hidden');

    // 1. Cargar Configuración de Alertas
    const { data: configData } = await supabaseClient
        .from('alerts_config')
        .select('*')
        .eq('id', 1)
        .single();
    
    if (configData) {
        alertsConfig = configData;
    }

    // 2. Cargar Clima
    weatherData = await fetchWeatherData();

    // 3. Cargar Metadatos de Colmenas
    const { data: metaData, error: metaError } = await supabaseClient
        .from('hives_meta')
        .select('hive_id, name, location, notes, status, last_updated, twitch_channel_name, user_id, tare_command') 
        .order('hive_id', { ascending: true });


    if (metaError) {
        console.error("Error al cargar metadatos:", metaError.message);
        showModal("Error de Conexión a Supabase", "No se pudieron cargar los metadatos de las colmenas. " + metaError.message);
        hivesMeta = [];
    } else {
        hivesMeta = metaData;
    }

    // 4. Cargar Sensores
    latestSensorData = {};
    const sensorPromises = hivesMeta.map(hive => 
        supabaseClient
            .from('sensor_data')
            .select('created_at, temperature_c, humidity_pct, weight_kg, audio_freq_avg, hive_id')
            .eq('hive_id', hive.hive_id)
            .order('created_at', { ascending: false })
            .limit(1)
    );

    const sensorResults = await Promise.all(sensorPromises);
    
    sensorResults.forEach((result, index) => {
        if (result.data && result.data.length > 0) {
            const data = result.data[0];
            latestSensorData[data.hive_id] = data;
        } else {
             const hiveId = hivesMeta[index].hive_id;
             latestSensorData[hiveId] = null;
        }
    });

    isDataLoaded = true;
    if(loadingSpinner) loadingSpinner.classList.add('hidden');
    handleRoute(); 
}

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

    if (filters.startDate || filters.endDate) {
        query = query.order('created_at', { ascending: false }).limit(2000);
    } else {
        query = query.order('created_at', { ascending: false }).limit(50);
    }

    const { data, error } = await query;

    if (error) {
        console.error("Error al cargar historial:", error.message);
        return [];
    }

    return data.reverse(); 
}

function filterDataByTime(data, startTime, endTime) {
    if (!startTime || !endTime) return data;

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    return data.filter(d => {
        const date = new Date(d.created_at);
        const hour = date.getHours();
        const minute = date.getMinutes();
        const timeAsNumber = hour * 100 + minute;
        const startAsNumber = startH * 100 + startM;
        const endAsNumber = endH * 100 + endM;

        return timeAsNumber >= startAsNumber && timeAsNumber <= endAsNumber;
    });
}


// =================================================================
// GESTIÓN DE COLMENAS (CRUD)
// =================================================================

async function saveHive(data, isNew) {
    if (!isAuthenticated) return showModal("Error de Acceso", "Debes estar autenticado para realizar esta acción.");

    let result;
    if (isNew) {
        result = await supabaseClient
            .from('hives_meta')
            .insert([{...data, user_id: currentUserId}])
            .select();
    } else {
        result = await supabaseClient
            .from('hives_meta')
            .update({...data, user_id: currentUserId})
            .eq('hive_id', data.hive_id)
            .select();
    }

    if (result.error) {
        showModal("Error de Supabase", `No se pudo guardar: ${result.error.message}`);
    } else {
        showModal("Éxito", `Colmena ${isNew ? 'agregada' : 'actualizada'} correctamente.`);
        isDataLoaded = false;
        await fetchData(); 
        navigate('admin');
    }
}

async function deleteHive(hiveId) {
    if (!isAuthenticated) return showModal("Error de Acceso", "Debes estar autenticado para realizar esta acción.");
    
    showModal("Confirmar Eliminación", `¿Está seguro de eliminar la Colmena ID ${hiveId}? Esto eliminará los metadatos de administración.`);
    
    const modalContainer = document.getElementById('modal-container');
    const modalButton = modalContainer.querySelector('button');
    
    const newModalButton = modalButton.cloneNode(true);
    modalButton.parentNode.replaceChild(newModalButton, modalButton);

    newModalButton.textContent = "Confirmar Eliminación";
    newModalButton.classList.add('bg-red-500', 'text-white', 'hover:bg-red-600');
    newModalButton.classList.remove('bg-primary', 'text-secondary', 'hover:bg-yellow-600');

    newModalButton.onclick = async () => {
        closeModal(); 

        const { error } = await supabaseClient
            .from('hives_meta')
            .delete()
            .eq('hive_id', hiveId);

        if (error) {
            showModal("Error de Supabase", `No se pudo eliminar: ${error.message}`);
        } else {
            showModal("Eliminado", `Colmena ID ${hiveId} eliminada exitosamente.`);
            isDataLoaded = false; 
            await fetchData(); 
        }
        newModalButton.textContent = "Cerrar";
        newModalButton.classList.remove('bg-red-500', 'text-white', 'hover:bg-red-600');
        newModalButton.classList.add('bg-primary', 'text-secondary', 'hover:bg-yellow-600');
        newModalButton.onclick = closeModal;
    };
}
        
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

async function handleTareCommand(hiveId) {
    if (!isAuthenticated) return showModal("Error de Acceso", "Debes estar autenticado para realizar esta acción.");

    const hive = hivesMeta.find(h => h.hive_id === hiveId);
    if (hive) {
        hive.tare_command = 'TARE_REQUESTED';
    }
    handleRoute(); 

    const { error } = await supabaseClient
        .from('hives_meta')
        .update({ tare_command: 'TARE_REQUESTED' })
        .eq('hive_id', hiveId);
    
    if (error) {
        showModal("Error de Supabase", `No se pudo enviar la orden de Tara: ${error.message}`);
        if (hive) hive.tare_command = null;
        handleRoute();
    } else {
        console.log(`Orden de Tara enviada para colmena ID ${hiveId}.`);
    }
}


// =================================================================
// SUPABASE REALTIME
// =================================================================

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
    
    latestSensorData[data.hive_id] = data;
}


function subscribeToChanges() {
    console.log("Subscribiéndose a cambios en tiempo real...");

    const channel = supabaseClient.channel('public-changes');

    channel.on(
        'postgres_changes',
        { 
            event: '*', 
            schema: 'public' 
        },
        (payload) => {
            console.log('Cambio detectado en la DB:', payload);

            if (payload.table === 'hives_meta' && payload.eventType === 'UPDATE') {
                const updatedHive = payload.new;
                const index = hivesMeta.findIndex(h => h.hive_id === updatedHive.hive_id);
                
                if (index !== -1) {
                    hivesMeta[index] = updatedHive;
                    
                    if (window.location.hash.includes('#admin')) {
                         handleRoute(); 
                    }
                }
            }
            
            // (¡NUEVO!) Escuchar cambios en alerts_config también
            if (payload.table === 'alerts_config' && payload.eventType === 'UPDATE') {
                console.log("Configuración de alertas actualizada remotamente");
                alertsConfig = payload.new;
                // Recargar vista si estamos en dashboard o detalle para reflejar nuevos umbrales
                const currentHash = window.location.hash;
                if (currentHash.includes('#dashboard') || currentHash.includes('#detail')) {
                    handleRoute();
                }
            }

            if (payload.table === 'sensor_data' && payload.eventType === 'INSERT') {
                const newSensorData = payload.new;
                
                latestSensorData[newSensorData.hive_id] = newSensorData;

                const currentHash = window.location.hash;
                if (currentHash.includes('#dashboard') || currentHash.includes('#admin')) {
                    handleRoute(); 
                } else if (currentHash.includes('#detail')) {
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

document.addEventListener('DOMContentLoaded', () => {
    initializeIcons(); 
    updateAdminButton();
    fetchData(); 
    subscribeToChanges(); 
});