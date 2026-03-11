import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { storage, db } from '../../src/lib/firebase';
import { useAuth } from '../../src/context/AuthContext';
import { createWorkoutLog, getWorkoutLog } from '../../src/lib/firestore';

type CheckInStatus = 'idle' | 'capturing' | 'uploading' | 'pending_ai' | 'verified' | 'failed' | 'already_done';

export default function CheckInScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();

  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<CheckInStatus>('idle');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [error, setError] = useState('');
  const cameraRef = useRef<CameraView>(null);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!user || !teamId) return;
    getWorkoutLog(teamId, user.uid, today).then((log) => {
      if (log && (log.status === 'verified' || log.status === 'pending')) {
        setStatus('already_done');
      }
    });
  }, [user, teamId]);

  async function handleCapture() {
    if (!cameraRef.current || !user || !teamId) return;
    setStatus('capturing');
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7, base64: false });
      if (!photo?.uri) throw new Error('No photo captured.');
      setPhotoUri(photo.uri);
      setStatus('uploading');

      // Upload to Firebase Storage
      const response = await fetch(photo.uri);
      const blob = await response.blob();
      const storageRef = ref(storage, `checkins/${user.uid}/${teamId}/${today}.jpg`);
      await uploadBytes(storageRef, blob);
      const imageUrl = await getDownloadURL(storageRef);

      // Create / update workout log with pending status
      const existingLog = await getWorkoutLog(teamId, user.uid, today);
      let logId: string;
      if (existingLog) {
        logId = existingLog.id;
        await updateDoc(doc(db, 'workoutLogs', logId), { imageUrl, status: 'pending' });
      } else {
        const log = await createWorkoutLog(teamId, user.uid, today);
        logId = log.id;
        await updateDoc(doc(db, 'workoutLogs', logId), { imageUrl });
      }

      setStatus('pending_ai');

      // Call Cloud Function to verify the photo with AI
      const functions = getFunctions();
      const verifyGymPhoto = httpsCallable<
        { logId: string; storagePath: string },
        { status: string; aiFeedback: string }
      >(functions, 'verifyGymPhoto');

      const storagePath = `checkins/${user.uid}/${teamId}/${today}.jpg`;
      const result = await verifyGymPhoto({ logId, storagePath });
      const verified = result.data.status === 'verified';
      setStatus(verified ? 'verified' : 'failed');
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong.');
      setStatus('idle');
    }
  }

  function handleRetake() {
    setPhotoUri(null);
    setStatus('idle');
    setError('');
  }

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.permTitle}>Camera Access Required</Text>
        <Text style={styles.permSubtitle}>
          GymBet needs camera access to verify you're at the gym. No gallery uploads are allowed.
        </Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Camera Access</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (status === 'already_done') {
    return (
      <View style={styles.container}>
        <Text style={styles.doneIcon}>✓</Text>
        <Text style={styles.doneTitle}>Already checked in today!</Text>
        <Text style={styles.doneSubtitle}>Your photo is being reviewed. Check back soon.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back to Team</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (status === 'pending_ai') {
    return (
      <View style={styles.container}>
        {photoUri && <Image source={{ uri: photoUri }} style={styles.preview} />}
        <View style={styles.pendingBox}>
          <ActivityIndicator color="#fff" style={{ marginBottom: 12 }} />
          <Text style={styles.pendingTitle}>Verifying photo...</Text>
          <Text style={styles.pendingSubtitle}>
            Our AI is checking that you're at the gym. This takes a few seconds.
          </Text>
        </View>
      </View>
    );
  }

  if (status === 'verified') {
    return (
      <View style={styles.container}>
        <Text style={styles.doneIcon}>✅</Text>
        <Text style={styles.doneTitle}>Check-in verified!</Text>
        <Text style={styles.doneSubtitle}>Your gym session has been confirmed. Keep it up!</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Back to Team</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (status === 'failed') {
    return (
      <View style={styles.container}>
        <Text style={styles.doneIcon}>❌</Text>
        <Text style={styles.doneTitle}>Verification failed</Text>
        <Text style={styles.doneSubtitle}>
          The photo didn't look like a real public gym. Try again with a clear photo of gym equipment.
        </Text>
        <TouchableOpacity style={styles.button} onPress={handleRetake}>
          <Text style={styles.buttonText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back to Team</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (photoUri && status === 'uploading') {
    return (
      <View style={styles.container}>
        <Image source={{ uri: photoUri }} style={styles.preview} />
        <View style={styles.uploadingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.uploadingText}>Uploading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back" ref={cameraRef}>
        <View style={styles.cameraOverlay}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>

          <View style={styles.cameraInstructions}>
            <Text style={styles.instructionTitle}>Gym Check-In</Text>
            <Text style={styles.instructionText}>
              Take a live photo at your gym. AI will verify it's a real gym — no gallery uploads.
            </Text>
          </View>

          <View style={styles.shutterRow}>
            {status === 'capturing' ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : (
              <TouchableOpacity style={styles.shutter} onPress={handleCapture}>
                <View style={styles.shutterInner} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </CameraView>

      {error ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={handleRetake}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  camera: { flex: 1, width: '100%' },
  cameraOverlay: { flex: 1, justifyContent: 'space-between', paddingVertical: 60, paddingHorizontal: 24 },
  closeBtn: { alignSelf: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: '#fff', fontSize: 16 },
  cameraInstructions: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 16, padding: 16 },
  instructionTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 6 },
  instructionText: { color: '#ccc', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  shutterRow: { alignItems: 'center' },
  shutter: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.3)', borderWidth: 3, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  preview: { width: '100%', flex: 1 },
  uploadingOverlay: {
    position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  uploadingText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  pendingBox: { paddingHorizontal: 28, alignItems: 'center', position: 'absolute', bottom: 60 },
  pendingTitle: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  pendingSubtitle: { color: '#888', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  permTitle: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  permSubtitle: { color: '#666', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 32 },
  doneIcon: { fontSize: 56, marginBottom: 16 },
  doneTitle: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  doneSubtitle: { color: '#666', fontSize: 14, textAlign: 'center', marginBottom: 32 },
  button: { backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', width: '100%' },
  buttonText: { color: '#000', fontWeight: '700', fontSize: 15 },
  backBtn: { marginTop: 16 },
  backText: { color: '#666', fontSize: 14 },
  errorBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#2e0d0d', padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  errorText: { color: '#ff4d4d', fontSize: 13, flex: 1 },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '600', marginLeft: 12 },
});
