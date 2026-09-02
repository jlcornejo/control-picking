import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuth } from '../src/hooks/useAuth';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { AnimatedSplash } from '../src/components/AnimatedSplash';
import { OfflineBanner } from '../src/components/OfflineBanner';

// Keep native splash visible while loading
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
      // Conservar la caché una semana para que la data de terreno esté
      // disponible sin conexión tras reiniciar la app.
      gcTime: 1000 * 60 * 60 * 24 * 7,
    },
  },
});

// Persistir la caché de queries en AsyncStorage (soporte offline).
const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'fundo360.query_cache.v1',
  throttleTime: 1000,
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    if (loading) return;

    // Hide native splash, show our animated one
    SplashScreen.hideAsync();

    const inAuth = segments[0] === 'login';

    if (!session && !inAuth) {
      router.replace('/login');
    } else if (session && inAuth) {
      router.replace('/(tabs)/production');
    }
  }, [session, loading, segments]);

  if (loading) return null;

  return (
    <>
      {children}
      {showSplash && <AnimatedSplash onFinish={() => setShowSplash(false)} />}
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: asyncStoragePersister, maxAge: 1000 * 60 * 60 * 24 * 7 }}
      >
        <StatusBar style="light" />
        <OfflineBanner />
        <AuthGate>
          <Stack screenOptions={{ headerShown: false }} />
        </AuthGate>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
