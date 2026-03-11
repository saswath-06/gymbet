# GymBet

A gym accountability app where friends form wagered workout teams. Miss your workout day and your money goes to your teammates.

## How it works

1. Create or join a **workout team** with friends and set a wager amount
2. Each member picks their workout days (e.g. Mon/Wed/Fri)
3. On a workout day, open the app and take a live photo at the gym — AI verifies it's real
4. Miss a day? The wagered amount is automatically transferred to your teammates via Stripe

## Tech Stack

- **Frontend:** React Native + Expo (Expo Router)
- **Auth / Database / Storage:** Firebase
- **Payments:** Stripe Connect
- **AI Verification:** OpenAI GPT-4o Vision
- **Notifications:** Expo Notifications

## Getting Started

```bash
npm install
npx expo start
```

## Project Structure

```
app/          # Expo Router screens
functions/    # Firebase Cloud Functions
src/          # Shared types, hooks, utilities
```
