import { Redirect } from 'expo-router';
import { useAuth } from '../src/hooks/useAuth';

export default function Index() {
  const { session, loading } = useAuth();

  if (loading) return null;

  if (!session) return <Redirect href="/login" />;

  return <Redirect href="/(tabs)/production" />;
}
