// =================================================================
// ARCHIVO 1: CONFIGURACIÓN Y ESTADO GLOBAL
// =================================================================

// Configuración de Supabase (URL y Clave proporcionadas por el usuario)
const SUPABASE_URL = "https://psigeyjvvmzdiidtoypq.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzaWdleWp2dm16ZGlpZHRveXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMzE4MTEsImV4cCI6MjA3NjgwNzgxMX0.bwlxcwO4Yun78QpEMHDHl9ovqwl_a5d0-EKalOArBSs";

// Configuración de OpenWeatherMap
const OPENWEATHER_API_KEY = "78bb833c2b996c4c4d5918990f711c17";
// Latitud y Longitud de Campana, Argentina (ubicación de ejemplo)
const WEATHER_LAT = -34.1683; 
const WEATHER_LON = -58.9567; 

// Inicialización del cliente Supabase
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// =================================================================
// ESTADO GLOBAL DE LA APLICACIÓN
// =================================================================

let isAuthenticated = false;
let currentUserId = null; // ID del usuario autenticado
let isDataLoaded = false; // Bandera para asegurar que los datos iniciales se carguen solo una vez

// Variables para los datos
let hivesMeta = []; // Metadatos de las colmenas (hives_meta)
let latestSensorData = {}; // Últimos datos de sensores (sensor_data)
let weatherData = null; // Datos del clima

// (¡NUEVO!) Configuración de Alertas Global (Valores por defecto)
let alertsConfig = {
    id: 1,
    min_weight: 5.0,
    max_temp: 35.0,
    min_temp: 15.0,
    max_audio: 2500.0
};

// Variable global para almacenar instancias de gráficos
let activeCharts = {};