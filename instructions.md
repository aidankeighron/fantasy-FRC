# Firebase Setup Instructions

Follow these instructions to set up Firebase for your Fantasy FRC rewrite.
This includes setting up Firestore, adding the correct security rules, creating Firebase Functions, and initializing Firebase Hosting.

## 1. Create a Firebase Project
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** and follow the prompts to create your new project (e.g., `fantasy-frc-new`).
3. Enable **Google Analytics** if desired.

## 2. Register Your Web App
1. In the Firebase console's project overview page, click the **Web `</>`** icon to add a web app.
2. Register the app (e.g., as "Fantasy FRC Web").
3. You will be provided with a `firebaseConfig` object. Keep this handy for the next step.

## 3. Set Up Environment Variables
In the root directory of this project (`c:\Users\aidan\OneDrive\Documents\fantasy-FRC`), create a file named `.env.local` and add the config from the previous step:

```env
NEXT_PUBLIC_FIREBASE_API_KEY="your-api-key"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your-project-id.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="your-project-id"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="your-project-id.appspot.com"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
NEXT_PUBLIC_FIREBASE_APP_ID="your-app-id"
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID="your-measurement-id"
```
*(Make sure to replace the dummy strings with your actual Firebase values).*

## 4. Enable Services
1. **Authentication**: Go to **Authentication** > **Get Started**. Enable **Email/Password**.
2. **Firestore Database**: Go to **Firestore Database** > **Create database**. Choose a location and start in **Production mode**.

## 5. Install & Setup Firebase CLI
To deploy the site and rules, run the following in your terminal:
```bash
npm install -g firebase-tools
firebase login
firebase init
```
When prompted during `firebase init`:
- **Select:** `Firestore`, `Functions`, and `Hosting` (and `Emulators` if you want local testing).
- **Project:** Select **Use an existing project** and choose the one you created.

### Firestore Setup
- Use `firestore.rules` for the rules file.
- Use `firestore.indexes.json` for the indexes.

### Functions Setup
- Language: **TypeScript**.
- ESLint: **Yes**.
- Install dependencies: **Yes**.

### Hosting Setup
- Public directory: `out` (Since we are using Next.js static exports, or if using App Hosting or Next.js experimental integrations, hit enter or select the web framework option depending on the CLI version).
- Configure as single-page app: **No** (Next.js handles routing).
- Set up auto-builds: Up to you.

## 6. Firestore Security Rules
1. Replace the contents of your generated `firestore.rules` file with the following rules carefully tailored for read/write access:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Global helper functions
    function isAdmin() {
      return request.auth != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }
    
    function isAuthed() {
      return request.auth != null;
    }

    // `draft_state`: Everyone can read. Only admins can write.
    match /draft_state/{document=**} {
      allow read: if true;
      allow write: if isAdmin();
    }
    
    // `teams`: Everyone can read. Only backend (admin SDK) or Admins can write.
    match /teams/{teamNumber} {
      allow read: if true;
      allow write: if isAdmin();
    }
    
    // `users`: 
    // - Everyone can read basic ranking info
    // - Users can read/write their own info
    // - Admins have full access
    match /users/{userId} {
      allow read: if true; // Allows the ranking page to display users
      allow write: if request.auth.uid == userId || isAdmin();
    }
    
    // `trades`: Users can read their own trades and create ones involving their team.
    match /trades/{tradeId} {
      allow read, update: if isAuthed() && (request.auth.uid == resource.data.senderId || request.auth.uid == resource.data.receiverId);
      allow create: if isAuthed() && request.auth.uid == request.resource.data.senderId;
      allow delete: if isAdmin() || (isAuthed() && (request.auth.uid == resource.data.senderId || request.auth.uid == resource.data.receiverId));
    }
    
    // `signup_links`: Only admins can manage. Users can read them temporarily to validate.
    match /signup_links/{linkId} {
      allow read: if true; // Needed so unauthenticated users can verify the link
      allow write: if isAdmin();
    }
  }
}
```

2. Run `firebase deploy --only firestore:rules` to deploy these rules.

## 7. Firebase App Hosting (Recommended for Next.js)
Firebase App Hosting is the newest, purpose-built solution for full-stack web frameworks like Next.js and Angular. It seamlessly handles Server-Side Rendering (SSR), API routes, and static assets without requiring complex configuration.
1. In the Firebase Console, go to **Build > App Hosting**.
2. Click **Get started** and connect your GitHub repository.
3. Select your root directory and the branch you want to deploy.
4. App Hosting will automatically detect Next.js. You can set environment variables and secrets directly in the console setup wizard.
5. Once configured, App Hosting will automatically deploy every time you push to your selected branch.

## 8. Backend Keys (TBA API & Admin SDK)
Your Firebase Functions will need secret keys like The Blue Alliance (TBA) API Key. Setting keys via `functions:config:set` is deprecated. Instead, use Google Cloud Secret Manager:

1. Use the Firebase CLI to set a secret (e.g., for `TBA_API_KEY`):
```bash
firebase functions:secrets:set TBA_API_KEY
```
2. Enter your secret value when prompted. 
3. In your Firebase Functions code, declare and access the secret by using the `defineSecret` method provided by `firebase-functions/params`.

*(For Next.js App Hosting, enter your secrets directly in the App Hosting console during setup, and locally place them in your `.env.local` file).*

## 9. Deploying Firebase Functions
When you write or update your Firebase Cloud Functions in the `functions` directory, you need to deploy them to the cloud.

1. Ensure you are in the root directory of your project (where `firebase.json` is located).
2. (Optional but recommended) Navigate to the functions folder and build to check for errors:
```bash
cd functions
npm run build
cd ..
```
3. Deploy the functions using the Firebase CLI:
```bash
firebase deploy --only functions
```
If you only want to deploy a specific function, you can run:
```bash
firebase deploy --only functions:functionName
```

Once you've completed these steps, your Next.js app and Firebase backend will be fully configured and deployed!
