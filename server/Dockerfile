FROM node:18

WORKDIR /usr/src/app

# Install Python dependencies and cron
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    dos2unix \
    cron \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages
# numpy, mysql-connector-python, requests, statbotics
RUN pip3 install --break-system-packages --no-cache-dir numpy mysql-connector-python requests statbotics

# Copy package files
COPY package*.json ./

RUN npm install

# Create entrypoint script using printf to ensure Unix line endings
RUN printf '#!/bin/bash\necho "Generating server_info.ini..."\necho "[SQL]" > server_info.ini\necho "SQL_Passw = \\"${SQL_PASSWORD}\\"" >> server_info.ini\necho "SQL_IP = \\"${SQL_IP}\\"" >> server_info.ini\necho "SQL_User = \\"${SQL_USER}\\"" >> server_info.ini\necho "SQL_Database = \\"${SQL_DATABASE}\\"" >> server_info.ini\necho "[TBA]" >> server_info.ini\necho "BLUE_ALLIANCE = ${BLUE_ALLIANCE}" >> server_info.ini\necho "[SERVER]" >> server_info.ini\necho "SECRET = \\"${SECRET}\\"" >> server_info.ini\necho "server_info.ini created."\nexec "$@"\n' > entrypoint.sh && chmod +x entrypoint.sh

# Copy the rest of the application
COPY . .

# Setup Cron
COPY crontab /etc/cron.d/update-teams
RUN chmod 0644 /etc/cron.d/update-teams
RUN crontab /etc/cron.d/update-teams
RUN touch /var/log/cron.log

# Expose port 80
EXPOSE 80

# Generate server_info.ini at runtime and start cron + server
CMD /bin/bash -c 'echo "[SQL]" > server_info.ini && \
    echo "SQL_Passw = \"${SQL_PASSWORD}\"" >> server_info.ini && \
    echo "SQL_IP = \"${SQL_IP}\"" >> server_info.ini && \
    echo "SQL_User = \"${SQL_USER}\"" >> server_info.ini && \
    echo "SQL_Database = \"${SQL_DATABASE}\"" >> server_info.ini && \
    echo "[TBA]" >> server_info.ini && \
    echo "BLUE_ALLIANCE = ${BLUE_ALLIANCE}" >> server_info.ini && \
    echo "[SERVER]" >> server_info.ini && \
    echo "SECRET = \"${SECRET}\"" >> server_info.ini && \
    echo "Config created." && \
    echo "Waiting for database to be fully ready..." && \
    sleep 5 && \
    cron && \
    node server.js'
