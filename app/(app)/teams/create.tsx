import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../../src/context/AuthContext';
import { createTeam, setTeamMember } from '../../../src/lib/firestore';
import type { WorkoutDay } from '../../../src/types';

const DAYS: WorkoutDay[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<WorkoutDay, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

export default function CreateTeamScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [name, setName] = useState('');
  const [wager, setWager] = useState('');
  const [selectedDays, setSelectedDays] = useState<WorkoutDay[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function toggleDay(day: WorkoutDay) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function parseDate(str: string): Date | null {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  async function handleCreate() {
    if (!name.trim()) return setError('Team name is required.');
    const wagerNum = parseFloat(wager);
    if (!wager || isNaN(wagerNum) || wagerNum <= 0) return setError('Enter a valid wager amount.');
    if (selectedDays.length === 0) return setError('Select at least one workout day.');
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (!start) return setError('Enter a valid start date (YYYY-MM-DD).');
    if (!end) return setError('Enter a valid end date (YYYY-MM-DD).');
    if (end <= start) return setError('End date must be after start date.');

    setError('');
    setLoading(true);
    try {
      const team = await createTeam(user!.uid, name.trim(), wagerNum, start, end);
      await setTeamMember(team.id, user!.uid, selectedDays);
      router.replace(`/(app)/teams/${team.id}`);
    } catch (e: any) {
      setError(e.message ?? 'Failed to create team.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TouchableOpacity style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.push('/(app)/teams')}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Create Team</Text>
      <Text style={styles.subtitle}>Set up your accountability group.</Text>

      <Text style={styles.label}>Team Name</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Morning Grind"
        placeholderTextColor="#444"
        value={name}
        onChangeText={setName}
      />

      <Text style={styles.label}>Wager per person ($)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 10"
        placeholderTextColor="#444"
        value={wager}
        onChangeText={setWager}
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Start Date (YYYY-MM-DD)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 2026-03-15"
        placeholderTextColor="#444"
        value={startDate}
        onChangeText={setStartDate}
      />

      <Text style={styles.label}>End Date (YYYY-MM-DD)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 2026-04-15"
        placeholderTextColor="#444"
        value={endDate}
        onChangeText={setEndDate}
      />

      <Text style={styles.label}>Your Workout Days</Text>
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

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity style={styles.button} onPress={handleCreate} disabled={loading}>
        {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Create Team</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 60 },
  back: { marginBottom: 24 },
  backText: { color: '#666', fontSize: 14 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#555', marginBottom: 32 },
  label: { color: '#888', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: '#141414', borderWidth: 1, borderColor: '#222',
    borderRadius: 12, padding: 14, color: '#fff', fontSize: 15,
  },
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
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
});
