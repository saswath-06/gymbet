import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../src/lib/firebase';

export default function HomeScreen() {
  const [firebaseStatus, setFirebaseStatus] = useState<'checking' | 'connected' | 'error'>('checking');

  useEffect(() => {
    async function testConnection() {
      try {
        const ref = doc(db, '_health', 'ping');
        await setDoc(ref, { ok: true, ts: Date.now() });
        const snap = await getDoc(ref);
        if (snap.exists()) setFirebaseStatus('connected');
      } catch {
        setFirebaseStatus('error');
      }
    }
    testConnection();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>GymBet</Text>
      <Text style={styles.subtitle}>Stay accountable. Wager on your workouts.</Text>
      <View style={[styles.badge, firebaseStatus === 'connected' && styles.badgeGreen, firebaseStatus === 'error' && styles.badgeRed]}>
        <Text style={styles.badgeText}>
          {firebaseStatus === 'checking' ? '⏳ Connecting to Firebase...' : firebaseStatus === 'connected' ? '✓ Firebase connected' : '✗ Firebase error'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 40,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: '#888888',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  badge: {
    marginTop: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
  },
  badgeGreen: {
    backgroundColor: '#0d2e1a',
  },
  badgeRed: {
    backgroundColor: '#2e0d0d',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 13,
  },
});
