FROM node:18

WORKDIR /usr/src/app

# Install Python and dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages
# numpy, mysql-connector-python, requests, statbotics
RUN pip3 install --no-cache-dir numpy mysql-connector-python requests statbotics

# Copy package files
COPY package*.json ./

RUN npm install

# Copy entrypoint script and make executable
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Copy the rest of the application
COPY . .

# Expose port 80
EXPOSE 80

# Set entrypoint
ENTRYPOINT ["./entrypoint.sh"]

# Default command
CMD [ "node", "server.js" ]
