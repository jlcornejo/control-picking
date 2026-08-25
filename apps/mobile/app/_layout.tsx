import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../src/hooks/useAuth';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { AnimatedSplash } from '../src/components/AnimatedSplash';

// Keep native splash visible while loading
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, retry: 1 } },
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
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <AuthGate>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthGate>
    </QueryClientProvider>
  );
}
