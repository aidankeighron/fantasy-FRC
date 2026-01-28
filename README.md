# Fantasy FRC

This is a web-based application for running fantasy drafts with FIRST Robotics Competition (FRC) teams. It allows a group of users to draft teams in real-time and tracks scores throughout the season.

## Features

- **User System**: Secure login and authentication for participants.
- **Live Drafting**: Real-time draft interface with timers and automatic picking if a user runs out of time.
- **Team Management**: View available teams, their stats, and filtered lists during the draft.
- **Admin Tools**: Tools for administrators to manage users and control the draft process.
- **Scoring**: Automated score calculation based on team performance.

## Setup

More detailed [instructions](https://aidankeighron.github.io/posts/how-to-setup-fantasy-frc/) here.

### Prerequisites

- Node.js
- MySQL Database
- Python (for data update scripts)

### Installation

1. Clone the repository to your local machine.
2. Navigate to the `server` directory.
3. Install the required Node.js dependencies:
   ```bash
   npm install
   ```

### Configuration

Create a `server_info.ini` file in the `server` directory with your configuration details. You will need to provide:

- **SQL**: Database connection details (IP, User, Password, Database Name).
- **TBA**: The Blue Alliance API key for fetching team data.
- **SERVER**: A secret key for session management.

## Running the Application

To start the server, run the following command from the root directory:

```bash
node server/server.js
```

The application will be accessible at `http://localhost:80` (or the port configured in the server script).
