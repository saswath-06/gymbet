import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../../../src/context/AuthContext';
import { getTeamByInviteCode, joinTeam, setTeamMember } from '../../../src/lib/firestore';
import type { WorkoutDay } from '../../../src/types';

const DAYS: WorkoutDay[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<WorkoutDay, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

export default function JoinTeamScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const functions = getFunctions();

  const [code, setCode] = useState('');
  const [selectedDays, setSelectedDays] = useState<WorkoutDay[]>([]);
  const [teamName, setTeamName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [step, setStep] = useState<'code' | 'days'>('code');
  const [error, setError] = useState('');
  const [noPaymentMethod, setNoPaymentMethod] = useState(false);
  const [loading, setLoading] = useState(false);

  function toggleDay(day: WorkoutDay) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  async function handleLookup() {
    if (code.trim().length !== 6) return setError('Invite codes are 6 characters.');
    setError('');
    setLoading(true);
    try {
      const team = await getTeamByInviteCode(code.trim());
      if (!team) return setError('No team found with that code.');
      if (team.memberIds.includes(user!.uid)) return setError('You are already in this team.');
      setTeamName(team.name);
      setTeamId(team.id);
      setStep('days');
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (selectedDays.length === 0) return setError('Select at least one workout day.');
    setError('');
    setNoPaymentMethod(false);
    setLoading(true);
    try {
      await joinTeam(teamId, user!.uid);
      await setTeamMember(teamId, user!.uid, selectedDays);
      // Charge the wager escrow upfront
      const chargeTeamEscrow = httpsCallable(functions, 'chargeTeamEscrow');
      await chargeTeamEscrow({ teamId });
      router.replace(`/(app)/teams/${teamId}`);
    } catch (e: any) {
      const msg: string = e.message ?? '';
      if (msg.includes('No payment method')) {
        setNoPaymentMethod(true);
      } else {
        setError(msg || 'Failed to join team.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.push('/(app)/teams')}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      {step === 'code' ? (
        <>
          <Text style={styles.title}>Join a Team</Text>
          <Text style={styles.subtitle}>Enter the 6-character invite code.</Text>

          <TextInput
            style={styles.codeInput}
            placeholder="ABC123"
            placeholderTextColor="#333"
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            maxLength={6}
            autoCapitalize="characters"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity style={styles.button} onPress={handleLookup} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Find Team</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.title}>{teamName}</Text>
          <Text style={styles.subtitle}>Pick your workout days to commit to.</Text>

          <View style={styles.daysRow}>
            {DAYS.map((day) => (
              <TouchableOpacity
                key={day}
                style={[styles.dayBtn, selectedDays.includes(day) && styles.dayBtnActive]}
                onPress={() => toggleDay(day)}
              >
                <Text style={[styles.dayBtnText, selectedDays.includes(day) && styles.dayBtnTextActive]}>
                  {DAY_LABELS[day]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {selectedDays.length > 0 && (
            <Text style={styles.daysSelected}>{selectedDays.length} day{selectedDays.length !== 1 ? 's' : ''} selected</Text>
          )}

          {noPaymentMethod ? (
            <View style={styles.noPaymentBox}>
              <Text style={styles.noPaymentText}>No payment method on file</Text>
              <Text style={styles.noPaymentSub}>Add a card in your Wallet to pay the ${' '}wager and complete joining.</Text>
              <TouchableOpacity style={styles.button} onPress={() => router.push('/(app)/wallet')}>
                <Text style={styles.buttonText}>Go to Wallet</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <TouchableOpacity style={styles.button} onPress={handleJoin} disabled={loading}>
                {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Join Team</Text>}
              </TouchableOpacity>
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', paddingTop: 60, paddingHorizontal: 24 },
  back: { marginBottom: 24 },
  backText: { color: '#666', fontSize: 14 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#555', marginBottom: 32 },
  codeInput: {
    backgroundColor: '#141414', borderWidth: 1, borderColor: '#222', borderRadius: 12,
    padding: 16, color: '#fff', fontSize: 28, fontWeight: '700',
    textAlign: 'center', letterSpacing: 8,
  },
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayBtn: {
    borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#141414',
  },
  dayBtnActive: { backgroundColor: '#fff', borderColor: '#fff' },
  dayBtnText: { color: '#555', fontSize: 13, fontWeight: '600' },
  dayBtnTextActive: { color: '#000' },
  daysSelected: { color: '#4ade80', fontSize: 13, marginTop: 10 },
  error: { color: '#ff4d4d', fontSize: 13, marginTop: 16 },
  button: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 32,
  },
  buttonText: { color: '#000', fontWeight: '700', fontSize: 15 },
  noPaymentBox: { marginTop: 24 },
  noPaymentText: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 6 },
  noPaymentSub: { color: '#666', fontSize: 13, marginBottom: 0 },
});
