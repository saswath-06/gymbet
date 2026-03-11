import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.name}>{user?.displayName ?? user?.email}</Text>
        </View>
        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.card} onPress={() => router.push('/(app)/teams')}>
        <Text style={styles.cardEmoji}>🏋️</Text>
        <Text style={styles.cardTitle}>My Teams</Text>
        <Text style={styles.cardDesc}>View your teams, create new ones, or join with a code.</Text>
        <Text style={styles.cardArrow}>→</Text>
      </TouchableOpacity>

      <View style={styles.comingSoon}>
        <Text style={styles.comingSoonText}>Check-ins, standings, and payments coming soon.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', paddingTop: 70, paddingHorizontal: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 },
  greeting: { color: '#555', fontSize: 14 },
  name: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 2 },
  signOutBtn: { borderWidth: 1, borderColor: '#222', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  signOutText: { color: '#666', fontSize: 13 },
  card: {
    backgroundColor: '#141414', borderRadius: 16, padding: 24,
    borderWidth: 1, borderColor: '#222',
  },
  cardEmoji: { fontSize: 28, marginBottom: 10 },
  cardTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 6 },
  cardDesc: { color: '#555', fontSize: 14, lineHeight: 20 },
  cardArrow: { color: '#fff', fontSize: 20, marginTop: 16, textAlign: 'right' },
  comingSoon: { marginTop: 24, alignItems: 'center' },
  comingSoonText: { color: '#333', fontSize: 13 },
});
