/**
 * ============================================
 * LOCATION HOOK - expo-location
 * ============================================
 * GPS position, geofence validation, reverse geocoding
 * Used for absensi location, patrol tracking, panic alerts
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import * as Location from 'expo-location';

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

interface UseLocationReturn {
  location: LocationData | null;
  address: string;
  isLoading: boolean;
  error: string | null;
  requestPermission: () => Promise<boolean>;
  getCurrentPosition: () => Promise<LocationData | null>;
  getAddress: (lat: number, lng: number) => Promise<string>;
  isWithinRadius: (targetLat: number, targetLng: number, radiusMeters: number) => boolean;
  distanceTo: (targetLat: number, targetLng: number) => number;
  startTracking: (intervalMs?: number) => void;
  stopTracking: () => void;
  isTracking: boolean;
}

/**
 * Calculate distance between two GPS points (Haversine formula)
 */
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useLocation(): UseLocationReturn {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [address, setAddress] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchRef.current) {
        watchRef.current.remove();
      }
    };
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const { status: foreground } = await Location.requestForegroundPermissionsAsync();
      if (foreground !== 'granted') {
        Alert.alert(
          'Izin Lokasi Diperlukan',
          'Aplikasi membutuhkan akses lokasi untuk absensi, patroli, dan fitur darurat.',
          [{ text: 'OK' }]
        );
        return false;
      }

      // Request background for patrol tracking
      if (Platform.OS !== 'web') {
        const { status: background } = await Location.requestBackgroundPermissionsAsync();
        if (background !== 'granted') {
          console.log('Background location not granted - patrol tracking may be limited');
        }
      }

      return true;
    } catch (err) {
      setError('Gagal meminta izin lokasi');
      return false;
    }
  }, []);

  const getCurrentPosition = useCallback(async (): Promise<LocationData | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const hasPermission = await requestPermission();
      if (!hasPermission) return null;

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
      });

      const data: LocationData = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy,
        altitude: loc.coords.altitude,
        heading: loc.coords.heading,
        speed: loc.coords.speed,
        timestamp: loc.timestamp,
      };

      setLocation(data);

      // Auto reverse geocode
      try {
        const [addr] = await Location.reverseGeocodeAsync({
          latitude: data.latitude,
          longitude: data.longitude,
        });
        if (addr) {
          const formatted = [addr.street, addr.district, addr.city, addr.region]
            .filter(Boolean).join(', ');
          setAddress(formatted);
        }
      } catch {
        setAddress(`${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)}`);
      }

      return data;
    } catch (err: any) {
      setError(err.message || 'Gagal mendapatkan lokasi');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [requestPermission]);

  const getAddress = useCallback(async (lat: number, lng: number): Promise<string> => {
    try {
      const [addr] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (addr) {
        return [addr.street, addr.district, addr.city, addr.region].filter(Boolean).join(', ');
      }
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    } catch {
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
  }, []);

  const isWithinRadius = useCallback((targetLat: number, targetLng: number, radiusMeters: number): boolean => {
    if (!location) return false;
    const distance = haversineDistance(location.latitude, location.longitude, targetLat, targetLng);
    return distance <= radiusMeters;
  }, [location]);

  const distanceTo = useCallback((targetLat: number, targetLng: number): number => {
    if (!location) return Infinity;
    return haversineDistance(location.latitude, location.longitude, targetLat, targetLng);
  }, [location]);

  const startTracking = useCallback(async (intervalMs = 5000) => {
    const hasPermission = await requestPermission();
    if (!hasPermission) return;

    if (watchRef.current) watchRef.current.remove();

    watchRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: intervalMs,
        distanceInterval: 5,
      },
      (loc) => {
        setLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.coords.accuracy,
          altitude: loc.coords.altitude,
          heading: loc.coords.heading,
          speed: loc.coords.speed,
          timestamp: loc.timestamp,
        });
      }
    );
    setIsTracking(true);
  }, [requestPermission]);

  const stopTracking = useCallback(() => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
    setIsTracking(false);
  }, []);

  return {
    location,
    address,
    isLoading,
    error,
    requestPermission,
    getCurrentPosition,
    getAddress,
    isWithinRadius,
    distanceTo,
    startTracking,
    stopTracking,
    isTracking,
  };
}
