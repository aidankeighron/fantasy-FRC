#!/bin/bash

# Define defaults if not set (optional)
# SQL_IP=${SQL_IP:-localhost}

echo "Generating server_info.ini..."

echo "[SQL]" > server_info.ini
echo "SQL_Passw = \"${SQL_PASSWORD}\"" >> server_info.ini
echo "SQL_IP = \"${SQL_IP}\"" >> server_info.ini
echo "SQL_User = \"${SQL_USER}\"" >> server_info.ini
echo "SQL_Database = \"${SQL_DATABASE}\"" >> server_info.ini

echo "[TBA]" >> server_info.ini
echo "BLUE_ALLIANCE = ${BLUE_ALLIANCE}" >> server_info.ini

echo "[SERVER]" >> server_info.ini
echo "SECRET = \"${SECRET}\"" >> server_info.ini

echo "server_info.ini created."

# Execute the passed command (e.g., node server.js)
exec "$@"
