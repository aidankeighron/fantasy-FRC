FROM node:18

WORKDIR /usr/src/app

# Install Python dependencies, packages, and cron
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    dos2unix \
    cron \
    && pip3 install --break-system-packages --no-cache-dir numpy mysql-connector-python requests statbotics \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

RUN npm install

# Copy the rest of the application
COPY . .

# Fix line endings for shell scripts and ensure they are executable
RUN dos2unix entrypoint.sh && chmod +x entrypoint.sh

# Setup Cron
COPY crontab /etc/cron.d/update-teams
RUN chmod 0644 /etc/cron.d/update-teams && \
    crontab /etc/cron.d/update-teams && \
    touch /var/log/cron.log

# Expose port 80
EXPOSE 80

# Use entrypoint script to initialize
ENTRYPOINT ["./entrypoint.sh"]

# Default command
CMD ["node", "server.js"]
