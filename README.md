# Fantasy FRC

A fantasy sports web application for the FIRST Robotics Competition (FRC), built with Node.js, MySQL, and Docker.

https://cloud.oracle.com/networking/vcns

## Quick Start (Docker)

The easiest way to run the application is using Docker.

1.  **Clone the repository**
2.  **Configure environment variables**
    *   **Docker:** The application runs on a `.ini` file, but the Docker container **automatically generates** this file from environment variables.
    *   You can modify `docker-compose.yml` directly or create a `.env` file to set variables like `SQL_PASSWORD` and `BLUE_ALLIANCE`.

3.  **Start the Application**
    ```bash
    docker-compose up --build
    ```
4.  **Access the App**
    *   Open [http://localhost](http://localhost) in your browser.

---

## Local Installation (Without Docker)

### Prerequisites
*   Node.js (v18+)
*   MySQL Server (v8.0+)
*   Python (v3.x) with `pip`

### Setup
1.  **Install Node Dependencies**
    ```bash
    cd server
    npm install
    ```
2.  **Install Python Dependencies**
    ```bash
    pip install numpy mysql-connector-python requests statbotics
    ```
3.  **Setup Database**
    *   Log in to MySQL and run the initialization script:
    ```bash
    mysql -u root -p < server/init.sql
    ```
4.  **Configuration**
    *   Create `server/server_info.ini` with your credentials:
    ```ini
    [SQL]
    SQL_Passw = "your_password"
    SQL_IP = "localhost"
    SQL_User = "root"
    SQL_Database = "fantasy"

    [TBA]
    BLUE_ALLIANCE = "your_tba_api_key"

    [SERVER]
    SECRET = "your_session_secret"
    ```
5.  **Run the Server**
    ```bash
    node server/server.js
    ```

---

## Updating Team Info (New Season)

The application pulls team data from The Blue Alliance (TBA) and Statbotics. To update the data for a new season:

1.  **Edit the Script**
    *   Open `server/get_team_info.py`.
    *   Update the `YEAR` variable to the current season (e.g., `YEAR = 2026`).
2.  **Run the Update Script**
    *   **Docker:**
        ```bash
        docker-compose run app python3 server/get_team_info.py
        ```
    *   **Local:**
        ```bash
        python3 server/get_team_info.py
        ```
    *   This will generate a new `server/team_info.json` file.
3.  **Restart the Server** to load the new data.

---

## Admin User Management

The admin user has special privileges to start drafts and manage users.

### Changing the Admin User
Currently, the admin user is defined in the server code. To change it:

1.  **Open `server/server.js`**.
2.  Locate the admin configuration (around line 43):
    ```javascript
    const adminId = "your_admin_id"; // e.g., "cf3a7c"
    const adminName = "YourUsername"; // e.g., "Aidan"
    ```
3.  **Update `adminName`** to the username of the account you want to be admin.
4.  **Update `adminId`**:
    *   You can find a user's ID by checking the `users` table in the database:
        ```sql
        SELECT * FROM users WHERE name = 'YourUsername';
        ```
    *   Or by logging `req.user` in the code for debugging.
5.  **Restart the server** for changes to take effect.

### Creating a New Admin Account via Database
If you initialized the database using `init.sql`, the default admin is:
*   **Username:** `Aidan`
*   **Password:** `mad77777`

To manually create a different admin in SQL:
```sql
INSERT INTO users (id, name, passw, teams, score, quals_score, elim_score, position)
VALUES ('new_admin_id', 'NewAdminName', 'bcrypt_hashed_password', '', 0, 0, 0, 0);
```

---

## Project Structure

*   `server/` - Node.js backend code.
    *   `server.js` - Main application entry point.
    *   `sqlConnection.js` - Database interaction logic.
    *   `www/` - Frontend HTML, CSS, and JS files.
    *   `get_team_info.py` - Script to fetch FRC team data.
*   `docker-compose.yml` - Docker service definition.

## Usage

1.  **Login/Signup:** Create an account to participate.
2.  **Draft:** The admin starts the draft. Users take turns picking FRC teams.
3.  **Scoring:** Points are calculated based on the performance of drafted teams (using data from Statbotics/TBA).
