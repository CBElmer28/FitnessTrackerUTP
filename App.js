// App.js
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Button,
  Alert,
  Platform,
  ScrollView,
} from "react-native";
import * as Location from "expo-location";
import { Accelerometer } from "expo-sensors";
import MapView, { Marker } from "react-native-maps";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width, height } = Dimensions.get("window");
const MAP_HEIGHT = Math.round(height * 0.45);

export default function App() {
  // ubicación y permisos
  const [permissionStatus, setPermissionStatus] = useState(null);
  const [current, setCurrent] = useState(null); 
  const [watcher, setWatcher] = useState(null);

  // distancia acumulada
  const [distanceMeters, setDistanceMeters] = useState(0);
  const prevCoordsRef = useRef(null);

  // acelerómetro
  const [accel, setAccel] = useState({ x: 0, y: 0, z: 0 });
  const accelSubRef = useRef(null);

  // almacenamiento
  const [lastSavedLocation, setLastSavedLocation] = useState(null);
  const [loadedFromStorage, setLoadedFromStorage] = useState(false);

  // Cálculo Haversine
  const getDistanceMeters = (c1, c2) => {
    const R = 6371e3; 
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(c2.latitude - c1.latitude);
    const dLon = toRad(c2.longitude - c1.longitude);
    const lat1 = toRad(c1.latitude);
    const lat2 = toRad(c2.latitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;
    return d; // en metros
  };

  // Solicitar permiso y obtener ubicación inicial
  const requestAndStartLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(status);
      if (status !== "granted") {
        Alert.alert(
          "Permisos denegados",
          "La app necesita permiso de ubicación para funcionar correctamente."
        );
        return;
      }

      // ubicación actual (one-shot)
      const currentPos = await Location.getCurrentPositionAsync({});
      setCurrent(currentPos);

      // cargar guardado previo en AsyncStorage (si existe)
      const saved = await AsyncStorage.getItem("lastLocation");
      if (saved) {
        const parsed = JSON.parse(saved);
        setLastSavedLocation(parsed);
        setLoadedFromStorage(true);
      }

      // iniciar watch para actualizar ubicación y acumular distancia
      const subscriber = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 2000,
          distanceInterval: 1, 
        },
        (loc) => {
          setCurrent(loc);

          const prev = prevCoordsRef.current;
          if (prev) {
            const d = getDistanceMeters(prev, loc.coords);
            if (!isNaN(d) && isFinite(d)) {
              setDistanceMeters((s) => s + d);
            }
          }
          prevCoordsRef.current = loc.coords;

          // guardar la última ubicación en AsyncStorage
          AsyncStorage.setItem("lastLocation", JSON.stringify(loc.coords)).catch((err) =>
            console.warn("Error guardando ubicación:", err)
          );
        }
      );

      setWatcher(subscriber);
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Ocurrió un error solicitando la ubicación.");
    }
  };

  // Listener acelerómetro
  const startAccelerometer = () => {
    Accelerometer.setUpdateInterval(500); 
    const sub = Accelerometer.addListener((acc) => {
      setAccel({
        x: acc.x,
        y: acc.y,
        z: acc.z,
      });
    });
    accelSubRef.current = sub;
  };

  const stopAccelerometer = () => {
    if (accelSubRef.current) {
      accelSubRef.current.remove();
      accelSubRef.current = null;
    }
  };

  // cargar estado inicial
  useEffect(() => {
    requestAndStartLocation();
    startAccelerometer();

    return () => {
      // cleanup
      if (watcher && watcher.remove) watcher.remove();
      stopAccelerometer();
    };
  }, []);

  // función para volver a pedir permisos manualmente
  const handleRetryPermissions = async () => {
    // si ya existe watcher, cancelarlo para reiniciar cleanly
    if (watcher && watcher.remove) {
      watcher.remove();
      setWatcher(null);
      prevCoordsRef.current = null;
      setDistanceMeters(0);
    }
    await requestAndStartLocation();
  };

  // Helper para formatear número
  const formatNumber = (n, digits = 3) => {
    if (n == null || isNaN(n)) return "-";
    return Number(n).toFixed(digits);
  };

  const distanceKm = (distanceMeters / 1000).toFixed(3);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>GPS, Acelerómetro y Mapa</Text>

      <Text style={styles.help}>
        La app solicita permisos de ubicación y muestra tu posición en el mapa. Además lee el
        acelerómetro en tiempo real y calcula la distancia acumulada.
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Permiso de ubicación:</Text>
        <Text style={permissionStatus === "granted" ? styles.green : styles.red}>
          {permissionStatus === "granted" ? "Permitido" : permissionStatus === "denied" ? "Denegado" : "Pendiente"}
        </Text>
        <Button title="Verificar / Reiniciar permisos" onPress={handleRetryPermissions} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ubicación actual:</Text>
        {current ? (
          <>
            <Text>Lat: {formatNumber(current.coords.latitude, 6)}</Text>
            <Text>Lon: {formatNumber(current.coords.longitude, 6)}</Text>
            <Text>Altitud: {formatNumber(current.coords.altitude ?? 0, 2)} m</Text>
            <Text>Precisión: {formatNumber(current.coords.accuracy ?? 0, 2)} m</Text>
          </>
        ) : (
          <Text>No hay ubicación (esperando...)</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Acelerómetro (x / y / z):</Text>
        <Text>
          x: {formatNumber(accel.x, 3)} — y: {formatNumber(accel.y, 3)} — z: {formatNumber(accel.z, 3)}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Distancia recorrida:</Text>
        <Text style={styles.distText}>{distanceKm} km</Text>
      </View>

      <View style={[styles.mapContainer]}>
        {current ? (
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: current.coords.latitude,
              longitude: current.coords.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            region={
              current
                ? {
                    latitude: current.coords.latitude,
                    longitude: current.coords.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }
                : undefined
            }
            showsUserLocation={true}
            showsMyLocationButton={true}
          >
            <Marker
              coordinate={{
                latitude: current.coords.latitude,
                longitude: current.coords.longitude,
              }}
              title="Tu posición"
              description={`Lat ${formatNumber(current.coords.latitude, 6)}, Lon ${formatNumber(
                current.coords.longitude,
                6
              )}`}
            />
          </MapView>
        ) : (
          <View style={[styles.map, styles.mapPlaceholder]}>
            <Text>Mapa (esperando ubicación...)</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        {loadedFromStorage && lastSavedLocation ? (
          <>
            <Text style={styles.savedTitle}>Ultima posición cargada del almacenamiento local</Text>
            <Text>Lat: {formatNumber(lastSavedLocation.latitude, 6)}</Text>
            <Text>Lon: {formatNumber(lastSavedLocation.longitude, 6)}</Text>
          </>
        ) : (
          <Text>No se cargó ninguna posición guardada anteriormente.</Text>
        )}
      </View>

      <View style={styles.section}>
        <Button
          title="Borrar última posición guardada"
          color="#cc3333"
          onPress={async () => {
            await AsyncStorage.removeItem("lastLocation");
            setLastSavedLocation(null);
            setLoadedFromStorage(false);
            Alert.alert("Eliminado", "Última posición guardada eliminada.");
          }}
        />
      </View>

      <View style={{ height: 20 }} />
      <Text style={styles.footer}>Platform: {Platform.OS}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    alignItems: "center",
    backgroundColor: "#fafafa",
  },
  title: { fontSize: 20, fontWeight: "700", marginTop: 8 },
  help: { textAlign: "center", color: "#555", marginVertical: 8 },
  section: {
    width: "100%",
    marginVertical: 8,
    padding: 10,
    backgroundColor: "#fff",
    borderRadius: 8,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitle: { fontWeight: "600", marginBottom: 6 },
  green: { color: "green", fontWeight: "700", marginBottom: 8 },
  red: { color: "red", fontWeight: "700", marginBottom: 8 },
  distText: { fontSize: 18, fontWeight: "700" },
  mapContainer: {
    width: "100%",
    alignItems: "center",
    marginTop: 8,
  },
  map: {
    width: "100%",
    height: MAP_HEIGHT,
    borderRadius: 8,
  },
  mapPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eaeaea",
  },
  savedTitle: { fontWeight: "700", marginBottom: 4 },
  footer: { marginVertical: 16, color: "#888" },
});
