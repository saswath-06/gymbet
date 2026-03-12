import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Modal, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../../../src/context/AuthContext';
import { createTeam, setTeamMember } from '../../../src/lib/firestore';
import type { WorkoutDay } from '../../../src/types';

const DAYS: WorkoutDay[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<WorkoutDay, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
};

const TIMEZONES = [
  { label: 'US Eastern (New York)',     value: 'America/New_York' },
  { label: 'US Central (Chicago)',      value: 'America/Chicago' },
  { label: 'US Mountain (Denver)',      value: 'America/Denver' },
  { label: 'US Pacific (Los Angeles)',  value: 'America/Los_Angeles' },
  { label: 'US Alaska',                 value: 'America/Anchorage' },
  { label: 'US Hawaii',                 value: 'Pacific/Honolulu' },
  { label: 'UK (London)',               value: 'Europe/London' },
  { label: 'Central Europe (Paris)',    value: 'Europe/Paris' },
  { label: 'India (Kolkata)',           value: 'Asia/Kolkata' },
  { label: 'China (Shanghai)',          value: 'Asia/Shanghai' },
  { label: 'Japan (Tokyo)',             value: 'Asia/Tokyo' },
  { label: 'Australia East (Sydney)',   value: 'Australia/Sydney' },
];

export default function CreateTeamScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const functions = getFunctions();

  const [name, setName] = useState('');
  const [wager, setWager] = useState('');
  const [selectedDays, setSelectedDays] = useState<WorkoutDay[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [tzPickerOpen, setTzPickerOpen] = useState(false);
  const [currency, setCurrency] = useState<'cad' | 'usd'>('cad');
  const [error, setError] = useState('');
  const [noPaymentMethod, setNoPaymentMethod] = useState(false);
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
    setNoPaymentMethod(false);
    setLoading(true);
    try {
      const team = await createTeam(user!.uid, name.trim(), wagerNum, start, end, timezone, currency);
      await setTeamMember(team.id, user!.uid, selectedDays);
      // Charge wager escrow upfront
      const chargeTeamEscrow = httpsCallable(functions, 'chargeTeamEscrow');
      await chargeTeamEscrow({ teamId: team.id });
      router.replace(`/(app)/teams/${team.id}`);
    } catch (e: any) {
      const msg: string = e.message ?? '';
      if (msg.includes('No payment method')) {
        setNoPaymentMethod(true);
      } else {
        setError(msg || 'Failed to create team.');
      }
    } finally {
      setLoading(false);
    }
  }

  const tzLabel = TIMEZONES.find((t) => t.value === timezone)?.label ?? timezone;

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

      <Text style={styles.label}>Wager per person ({currency.toUpperCase()})</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 10"
        placeholderTextColor="#444"
        value={wager}
        onChangeText={setWager}
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Currency</Text>
      <View style={styles.currencyRow}>
        {(['cad', 'usd'] as const).map((c) => (
          <TouchableOpacity
            key={c}
            style={[styles.currencyBtn, currency === c && styles.currencyBtnActive]}
            onPress={() => setCurrency(c)}
          >
            <Text style={[styles.currencyBtnText, currency === c && styles.currencyBtnTextActive]}>
              {c.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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

      <Text style={styles.label}>Timezone</Text>
      <TouchableOpacity style={styles.tzBtn} onPress={() => setTzPickerOpen(true)}>
        <Text style={styles.tzBtnText}>{tzLabel}</Text>
        <Text style={styles.tzChevron}>▾</Text>
      </TouchableOpacity>

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

      {noPaymentMethod ? (
        <View style={styles.noPaymentBox}>
          <Text style={styles.noPaymentText}>No payment method on file</Text>
          <Text style={styles.noPaymentSub}>Add a card in your Wallet to pay the wager and activate your team.</Text>
          <TouchableOpacity style={styles.button} onPress={() => router.push('/(app)/wallet')}>
            <Text style={styles.buttonText}>Go to Wallet</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.button} onPress={handleCreate} disabled={loading}>
          {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Create Team</Text>}
        </TouchableOpacity>
      )}

      {/* Timezone picker modal */}
      <Modal visible={tzPickerOpen} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Timezone</Text>
              <TouchableOpacity onPress={() => setTzPickerOpen(false)}>
                <Text style={styles.modalClose}>Done</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={TIMEZONES}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.tzOption, item.value === timezone && styles.tzOptionActive]}
                  onPress={() => { setTimezone(item.value); setTzPickerOpen(false); }}
                >
                  <Text style={[styles.tzOptionText, item.value === timezone && styles.tzOptionTextActive]}>
                    {item.label}
                  </Text>
                  {item.value === timezone && <Text style={styles.tzCheck}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
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
  tzBtn: {
    backgroundColor: '#141414', borderWidth: 1, borderColor: '#222',
    borderRadius: 12, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  tzBtnText: { color: '#fff', fontSize: 15 },
  tzChevron: { color: '#555', fontSize: 14 },
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  currencyRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  currencyBtn: {
    borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 8,
    paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#141414',
  },
  currencyBtnActive: { backgroundColor: '#fff', borderColor: '#fff' },
  currencyBtnText: { color: '#555', fontSize: 14, fontWeight: '700' },
  currencyBtnTextActive: { color: '#000' },
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
  // Modal
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { backgroundColor: '#141414', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#222' },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalClose: { color: '#4ade80', fontSize: 15, fontWeight: '600' },
  tzOption: { paddingVertical: 16, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  tzOptionActive: { backgroundColor: '#0d2e1a' },
  tzOptionText: { color: '#aaa', fontSize: 15 },
  tzOptionTextActive: { color: '#fff', fontWeight: '600' },
  tzCheck: { color: '#4ade80', fontSize: 15, fontWeight: '700' },
});
