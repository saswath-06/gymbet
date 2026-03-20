import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import CheckInScreen from '../check-in';

// ── Camera mock ────────────────────────────────────────────────────────────
// forwardRef so cameraRef.current.takePictureAsync resolves in handleCapture

const mockTakePictureAsync = jest.fn();

jest.mock('expo-camera', () => {
  const { forwardRef, useImperativeHandle } = require('react');
  return {
    CameraView: forwardRef(({ children }: { children: React.ReactNode }, ref: any) => {
      useImperativeHandle(ref, () => ({ takePictureAsync: mockTakePictureAsync }));
      return <>{children}</>;
    }),
    useCameraPermissions: jest.fn(() => [{ granted: true }, jest.fn()]),
  };
});

// ── Module mocks ───────────────────────────────────────────────────────────

jest.mock('../../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'user1' } }),
}));

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => ({ teamId: 'team1' }),
}));

jest.mock('../../../src/lib/firestore', () => ({
  getWorkoutLog: jest.fn(),
  createWorkoutLog: jest.fn(),
}));

jest.mock('firebase/storage', () => ({
  ref: jest.fn(() => 'mock-storage-ref'),
  uploadBytes: jest.fn(),
  getDownloadURL: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => 'mock-doc-ref'),
  updateDoc: jest.fn(),
}));

const mockVerifyGymPhoto = jest.fn();
jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(() => ({})),
  httpsCallable: jest.fn(() => mockVerifyGymPhoto),
}));

jest.mock('../../../src/lib/firebase', () => ({ storage: {}, db: {} }));

// ── Import mocked modules for assertions ───────────────────────────────────

import { getWorkoutLog, createWorkoutLog } from '../../../src/lib/firestore';
import { uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateDoc } from 'firebase/firestore';
import { useCameraPermissions } from 'expo-camera';

// ── Defaults ───────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  (useCameraPermissions as jest.Mock).mockReturnValue([{ granted: true }, jest.fn()]);
  (getWorkoutLog as jest.Mock).mockResolvedValue(null);
  mockTakePictureAsync.mockResolvedValue({ uri: 'file://photo.jpg' });
  (uploadBytes as jest.Mock).mockResolvedValue(undefined);
  (getDownloadURL as jest.Mock).mockResolvedValue('https://fake.url/photo.jpg');
  (createWorkoutLog as jest.Mock).mockResolvedValue({ id: 'log-new' });
  (updateDoc as jest.Mock).mockResolvedValue(undefined);
  mockVerifyGymPhoto.mockResolvedValue({ data: { status: 'verified', aiFeedback: 'Looks legit' } });
  global.fetch = jest.fn().mockResolvedValue({
    blob: jest.fn().mockResolvedValue(new Blob()),
  });
});

// ── Helper: press shutter ──────────────────────────────────────────────────

async function pressShutter(utils: ReturnType<typeof render>) {
  await utils.findByText('Gym Check-In'); // wait for idle/camera state
  const shutter = utils.getByTestId('shutter-btn');
  await act(async () => {
    fireEvent.press(shutter);
  });
}

// ── duplicate prevention ───────────────────────────────────────────────────

describe('duplicate prevention', () => {
  it('shows already_done when log status is "pending"', async () => {
    (getWorkoutLog as jest.Mock).mockResolvedValue({ id: 'log1', status: 'pending' });
    const { findByText } = render(<CheckInScreen />);
    await findByText('Already checked in today!');
  });

  it('shows already_done when log status is "verified"', async () => {
    (getWorkoutLog as jest.Mock).mockResolvedValue({ id: 'log1', status: 'verified' });
    const { findByText } = render(<CheckInScreen />);
    await findByText('Already checked in today!');
  });

  it('shows camera view when no existing log', async () => {
    const { findByText } = render(<CheckInScreen />);
    await findByText('Gym Check-In');
  });

  it('shows camera view when existing log status is "failed" (retry allowed)', async () => {
    (getWorkoutLog as jest.Mock).mockResolvedValue({ id: 'log1', status: 'failed' });
    const { findByText } = render(<CheckInScreen />);
    await findByText('Gym Check-In');
  });

  it('already_done back button calls router.back()', async () => {
    (getWorkoutLog as jest.Mock).mockResolvedValue({ id: 'log1', status: 'pending' });
    const { findByText } = render(<CheckInScreen />);
    fireEvent.press(await findByText('← Back to Team'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

// ── permission gate ────────────────────────────────────────────────────────

describe('camera permission gate', () => {
  it('shows permission request screen when camera not granted', async () => {
    (useCameraPermissions as jest.Mock).mockReturnValue([{ granted: false }, jest.fn()]);
    const { findByText } = render(<CheckInScreen />);
    await findByText('Camera Access Required');
  });

  it('"Grant Camera Access" button calls requestPermission', async () => {
    const mockRequest = jest.fn();
    (useCameraPermissions as jest.Mock).mockReturnValue([{ granted: false }, mockRequest]);
    const { findByText } = render(<CheckInScreen />);
    fireEvent.press(await findByText('Grant Camera Access'));
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
});

// ── capture: happy path ────────────────────────────────────────────────────

describe('capture — happy path', () => {
  it('calls takePictureAsync with correct options when shutter is pressed', async () => {
    const utils = render(<CheckInScreen />);
    await pressShutter(utils);
    await waitFor(() => {
      expect(mockTakePictureAsync).toHaveBeenCalledWith({ quality: 0.7, base64: false });
    });
  });

  it('uploads photo to Firebase Storage after capture', async () => {
    const utils = render(<CheckInScreen />);
    await pressShutter(utils);
    await waitFor(() => {
      expect(uploadBytes).toHaveBeenCalled();
      expect(getDownloadURL).toHaveBeenCalled();
    });
  });

  it('creates a new workout log when none exists at upload time', async () => {
    const utils = render(<CheckInScreen />);
    await pressShutter(utils);
    await waitFor(() => {
      expect(createWorkoutLog).toHaveBeenCalledWith('team1', 'user1', expect.any(String));
    });
  });

  it('calls verifyGymPhoto with logId and storagePath', async () => {
    const utils = render(<CheckInScreen />);
    await pressShutter(utils);
    await waitFor(() => {
      expect(mockVerifyGymPhoto).toHaveBeenCalledWith(
        expect.objectContaining({
          logId: 'log-new',
          storagePath: expect.stringContaining('checkins/user1/team1/'),
        })
      );
    });
  });

  it('shows verified screen when AI confirms gym', async () => {
    const utils = render(<CheckInScreen />);
    await pressShutter(utils);
    await utils.findByText('Check-in verified!');
  });
});

// ── capture: AI rejection ──────────────────────────────────────────────────

describe('capture — AI rejection', () => {
  it('shows failed screen when verifyGymPhoto returns "failed"', async () => {
    mockVerifyGymPhoto.mockResolvedValue({ data: { status: 'failed', aiFeedback: 'Not a gym' } });
    const utils = render(<CheckInScreen />);
    await pressShutter(utils);
    await utils.findByText('Verification failed');
  });

  it('"Try Again" resets state back to idle camera view', async () => {
    mockVerifyGymPhoto.mockResolvedValue({ data: { status: 'failed' } });
    const utils = render(<CheckInScreen />);
    await pressShutter(utils);
    fireEvent.press(await utils.findByText('Try Again'));
    await utils.findByText('Gym Check-In');
  });
});

// ── capture: upload error ──────────────────────────────────────────────────

describe('capture — upload error', () => {
  it('shows error message in error bar when upload throws', async () => {
    (uploadBytes as jest.Mock).mockRejectedValue(new Error('Network error'));
    const utils = render(<CheckInScreen />);
    await pressShutter(utils);
    await utils.findByText('Network error');
  });

  it('shows Retry button after upload error', async () => {
    (uploadBytes as jest.Mock).mockRejectedValue(new Error('Network error'));
    const utils = render(<CheckInScreen />);
    await pressShutter(utils);
    await utils.findByText('Retry');
  });
});

// ── capture: existing log path ─────────────────────────────────────────────

describe('capture — existing log path', () => {
  it('skips createWorkoutLog and uses updateDoc when log already exists', async () => {
    // First call (mount useEffect) returns null so camera shows.
    // All subsequent calls (re-render useEffects + handleCapture) return existing log.
    // Note: user mock returns a new object ref on every render causing useEffect to
    // re-fire on state changes, so we can't rely on mockResolvedValueOnce ordering.
    let firstCall = true;
    (getWorkoutLog as jest.Mock).mockImplementation(() => {
      if (firstCall) { firstCall = false; return Promise.resolve(null); }
      return Promise.resolve({ id: 'existing-log', status: 'failed' });
    });

    const utils = render(<CheckInScreen />);
    await pressShutter(utils);

    await waitFor(() => {
      expect(createWorkoutLog).not.toHaveBeenCalled();
      expect(updateDoc).toHaveBeenCalledWith(
        'mock-doc-ref',
        expect.objectContaining({ imageUrl: 'https://fake.url/photo.jpg', status: 'pending' })
      );
    });
  });
});
