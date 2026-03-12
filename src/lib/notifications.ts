import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { WorkoutDay } from '../types';

// 1=Sunday, 2=Monday … 7=Saturday (Expo weekly trigger convention)
const WEEKDAY: Record<WorkoutDay, number> = {
  sunday: 1, monday: 2, tuesday: 3, wednesday: 4,
  thursday: 5, friday: 6, saturday: 7,
};

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/** Cancel all scheduled notifications and reschedule morning + evening reminders
 *  for every unique workout day across all of the user's teams. */
export async function scheduleWorkoutReminders(workoutDays: WorkoutDay[]): Promise<void> {
  const granted = await requestNotificationPermissions();
  if (!granted) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('workout-reminders', {
      name: 'Workout Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  await Notifications.cancelAllScheduledNotificationsAsync();

  const unique = [...new Set(workoutDays)];
  for (const day of unique) {
    const weekday = WEEKDAY[day];

    // 8 AM — morning reminder
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Workout day 💪',
        body: "Check in before midnight or you'll lose your wager!",
        sound: true,
        ...(Platform.OS === 'android' && { channelId: 'workout-reminders' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday,
        hour: 8,
        minute: 0,
      },
    });

    // 7 PM — evening nudge
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Last chance to check in ⏰",
        body: "You still have time to check in today — don't lose your wager!",
        sound: true,
        ...(Platform.OS === 'android' && { channelId: 'workout-reminders' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday,
        hour: 19,
        minute: 0,
      },
    });
  }
}
