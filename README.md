# Fantasy FRC

Fantasy sports application for the FIRST Robotics Competition (FRC).

This project allows users to participate in a fantasy draft of FRC teams, tracking their performance and calculating scores based on real-time data from The Blue Alliance (TBA) and Statbotics.

## Features

- **Next.js Framework**: Modern, fast, and SEO-friendly.
- **Firebase Backend**: Real-time database (Firestore), scalable serverless functions, and secure authentication.
- **Dynamic Drafting**: Real-time drafting system for FRC teams.
- **Stat Tracking**: Automatic scoring using data from TBA and Statbotics APIs.

---

## Getting Started

### Prerequisites

- **Node.js** (v20+ recommended)
- **Firebase CLI** (`npm install -g firebase-tools`)
- **Git**

### 1. Clone the Repository

```bash
git clone https://github.com/aidankeighron/fantasy-FRC.git
cd fantasy-FRC
```

### 2. Install Dependencies

```bash
npm install
cd functions
npm install
cd ..
```

### 3. Setup Firebase

Detailed setup instructions, including Firestore rules, Firebase Functions, and environment variables, can be found in [instructions.md](file:///c:/Users/aidan/OneDrive/Documents/fantasy-FRC/instructions.md).

1. Create a Firebase project at the [Firebase Console](https://console.firebase.google.com/).
2. Enable Authentication (Email/Password), Firestore, and Functions.
3. Configure your `.env.local` with your Firebase project credentials (see `instructions.md` for the template).

### 4. Local Development

To run the Next.js development server:

```bash
npm run dev
```

The application will be available at [http://localhost:3000](http://localhost:3000).

---

## Deployment & Updating

### Deploying the Web App

We recommend using **Firebase App Hosting** for Next.js projects. It handles SSR and API routes automatically.

1. Connect your GitHub repository in the Firebase Console under **App Hosting**.
2. Push your changes to the main branch for automatic deployment.

### Deploying Firebase Functions

When you update code in the `functions/` directory:

```bash
firebase deploy --only functions
```

### Updating Rules and Indexes

```bash
firebase deploy --only firestore
```

---

## Project Structure

- `src/`: Next.js application source code (components, pages, styles).
- `functions/`: Firebase Cloud Functions (backend logic, data syncing).
- `public/`: Static assets (images, icons).
- `legacy/`: Contains the previous Node.js/MySQL/Docker version of the project.
- `instructions.md`: Comprehensive setup and technical configuration guide.

## Contributing

1. Create a new branch for your feature or bugfix.
2. Ensure your code follows the project's linting and type-checking rules.
3. Submit a pull request for review.

---

## License

This project is licensed under the MIT License - see the [LICENSE](file:///c:/Users/aidan/OneDrive/Documents/fantasy-FRC/LICENSE) file for details.
